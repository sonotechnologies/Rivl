-- Rivl catch-up: brings any Supabase database up to date with the app.
-- Safe to run on a fresh database, a partly migrated one, or a fully migrated
-- one, and safe to run more than once. Paste all of it into the SQL Editor and Run.
-- (Generated from supabase/migrations/*.sql; those stay the source of truth.)

-- ═══ 20261024000000_profiles.sql ═══

-- Rivl foundation: profiles.
-- One row per auth user, created by trigger on sign-up.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique
    check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text check (char_length(display_name) <= 40),
  avatar_url text,
  bio text check (char_length(bio) <= 120),
  timezone text not null default 'UTC',
  coach_style text not null default 'hype'
    check (coach_style in ('hype', 'calm', 'roast')),
  theme text not null default 'dark'
    check (theme in ('dark', 'light')),
  accent text not null default 'volt'
    check (accent in ('volt', 'pulse', 'ice', 'blaze', 'nova', 'gold')),
  -- Game state below is written only by server-side database functions.
  streak_count integer not null default 0 check (streak_count >= 0),
  streak_freezes integer not null default 0 check (streak_freezes >= 0),
  ai_actions_today integer not null default 0 check (ai_actions_today >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Public profile and preferences for each Rivl user.';

-- Keep updated_at fresh.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Create a profile when someone signs up (Google or magic link).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)), 40),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row-level security: users read and edit only their own row for now.
-- Friends will read each other through views once friendships exist (build step 5).
alter table public.profiles enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Clients may only change these columns; streaks and AI quota are server-owned.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (username, display_name, avatar_url, bio, timezone, coach_style, theme, accent)
  on public.profiles to authenticated;


-- ═══ 20261024100000_tasks.sql ═══

-- Rivl build step 2: tasks and subtasks.
-- Ids are generated on the device so tasks can be created offline and synced later.

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 140),
  notes text check (char_length(notes) <= 2000),
  -- A calendar day in the owner's time zone, plus an optional time of day.
  due_on date,
  due_time time,
  category text check (char_length(category) between 1 and 24),
  -- 1–5. Picked by the user for now; AI scoring takes this over in build step 3.
  difficulty smallint check (difficulty between 1 and 5),
  difficulty_reason text check (char_length(difficulty_reason) <= 200),
  recurrence_rule text check (recurrence_rule in ('daily', 'weekdays', 'weekly', 'monthly')),
  -- Every occurrence of a repeating task shares the id of the first one.
  series_id uuid,
  is_shared boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint due_time_needs_date check (due_time is null or due_on is not null)
);

comment on column public.tasks.created_at is 'Set by the server; points need a task to exist 10 minutes before completion.';

create index if not exists tasks_user_open_idx on public.tasks (user_id, due_on) where completed_at is null;
create index if not exists tasks_user_completed_idx on public.tasks (user_id, completed_at) where completed_at is not null;
create index if not exists tasks_series_idx on public.tasks (series_id, due_on) where series_id is not null;

create table if not exists public.subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 140),
  est_minutes smallint check (est_minutes between 1 and 600),
  done boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists subtasks_task_idx on public.subtasks (task_id, position);

-- Server-owned fields: timestamps, and completion times that can't be in the future
-- or before the task existed.
create or replace function public.tasks_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at = now();
    if new.recurrence_rule is not null and new.series_id is null then
      new.series_id = new.id;
    end if;
  else
    new.created_at = old.created_at;
    if new.recurrence_rule is not null and new.series_id is null then
      new.series_id = new.id;
    end if;
  end if;
  new.updated_at = now();
  if new.completed_at is not null and (tg_op = 'INSERT' or old.completed_at is distinct from new.completed_at) then
    new.completed_at = least(greatest(new.completed_at, new.created_at), now());
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_before_write on public.tasks;
create trigger tasks_before_write
  before insert or update on public.tasks
  for each row execute function public.tasks_before_write();

-- When a repeating task is completed, schedule its next occurrence (with fresh subtasks).
-- Overdue habits skip ahead, so finishing one late never creates a backlog.
create or replace function public.tasks_schedule_next()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text;
  today date;
  next_on date;
  next_id uuid;
begin
  if new.recurrence_rule is null or new.completed_at is null or old.completed_at is not null then
    return new;
  end if;

  select coalesce(p.timezone, 'UTC') into tz from public.profiles p where p.id = new.user_id;
  today := (now() at time zone tz)::date;
  next_on := coalesce(new.due_on, today);

  loop
    next_on := case new.recurrence_rule
      when 'daily' then next_on + 1
      when 'weekly' then next_on + 7
      when 'monthly' then (next_on + interval '1 month')::date
      when 'weekdays' then next_on + case extract(isodow from next_on)::int when 5 then 3 when 6 then 2 else 1 end
    end;
    exit when next_on > today;
  end loop;

  if exists (
    select 1 from public.tasks t
    where t.series_id = new.series_id and t.due_on >= next_on and t.completed_at is null
  ) then
    return new;
  end if;

  insert into public.tasks (user_id, title, notes, due_on, due_time, category, difficulty, difficulty_reason, recurrence_rule, series_id, is_shared)
  values (new.user_id, new.title, new.notes, next_on, new.due_time, new.category, new.difficulty, new.difficulty_reason, new.recurrence_rule, new.series_id, new.is_shared)
  returning id into next_id;

  insert into public.subtasks (task_id, title, est_minutes, position)
  select next_id, s.title, s.est_minutes, s.position from public.subtasks s where s.task_id = new.id;

  return new;
end;
$$;

drop trigger if exists tasks_schedule_next on public.tasks;
create trigger tasks_schedule_next
  after update of completed_at on public.tasks
  for each row execute function public.tasks_schedule_next();

-- Row-level security: tasks are private to their owner.
-- Friends will only ever see shared wins, through feed views (build step 8).
alter table public.tasks enable row level security;
alter table public.subtasks enable row level security;

drop policy if exists "Users manage their own tasks" on public.tasks;
create policy "Users manage their own tasks"
  on public.tasks for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage subtasks of their own tasks" on public.subtasks;
create policy "Users manage subtasks of their own tasks"
  on public.subtasks for all
  to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id and t.user_id = (select auth.uid())))
  with check (exists (select 1 from public.tasks t where t.id = task_id and t.user_id = (select auth.uid())));

revoke all on public.tasks, public.subtasks from anon;
revoke insert, update on public.tasks, public.subtasks from authenticated;

grant select, delete on public.tasks, public.subtasks to authenticated;
grant insert (id, user_id, title, notes, due_on, due_time, category, difficulty, recurrence_rule, is_shared, completed_at),
  update (title, notes, due_on, due_time, category, difficulty, recurrence_rule, is_shared, completed_at)
  on public.tasks to authenticated;
grant insert (id, task_id, title, est_minutes, done, position),
  update (title, est_minutes, done, position)
  on public.subtasks to authenticated;


-- ═══ 20261024200000_ai.sql ═══

-- Rivl build step 3: AI scoring, breakdown and Plan my day.
-- All AI work runs in the /api/ai route with the service key; nothing here is callable by users.

-- Daily AI allowance and the user's day, for Plan my day.
alter table public.profiles
  add column if not exists ai_actions_on date,
  add column if not exists wake_time time not null default '07:00',
  add column if not exists sleep_time time not null default '23:00';

grant update (wake_time, sleep_time) on public.profiles to authenticated;

-- Difficulty is now judged by the AI, not picked by the user, so it can't be farmed.
alter table public.tasks
  add column if not exists difficulty_input_hash text,
  add column if not exists ai_score_count smallint not null default 0;

revoke insert, update on public.tasks from authenticated;
grant insert (id, user_id, title, notes, due_on, due_time, category, recurrence_rule, is_shared, completed_at),
  update (title, notes, due_on, due_time, category, recurrence_rule, is_shared, completed_at)
  on public.tasks to authenticated;

/**
 * Uses one of the user's daily AI actions. Resets at midnight in their time zone.
 * Returns how many are left after this one, or -1 if the limit was already reached.
 */
create or replace function public.consume_ai_action(p_user uuid, p_limit integer default 10)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date;
  used integer;
begin
  select (now() at time zone coalesce(timezone, 'UTC'))::date,
         case when ai_actions_on = (now() at time zone coalesce(timezone, 'UTC'))::date then ai_actions_today else 0 end
    into today, used
    from public.profiles where id = p_user
    for update;
  if not found then
    return -1;
  end if;
  if used >= p_limit then
    return -1;
  end if;
  update public.profiles set ai_actions_today = used + 1, ai_actions_on = today where id = p_user;
  return p_limit - used - 1;
end;
$$;

/** Actions left today without using one. */
create or replace function public.ai_actions_left(p_user uuid, p_limit integer default 10)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(p_limit - case when ai_actions_on = (now() at time zone coalesce(timezone, 'UTC'))::date then ai_actions_today else 0 end, 0)
  from public.profiles where id = p_user;
$$;

revoke execute on function public.consume_ai_action(uuid, integer) from public, anon, authenticated;
revoke execute on function public.ai_actions_left(uuid, integer) from public, anon, authenticated;

-- Repeats keep their rating, so the next occurrence isn't scored (or billed) again.
create or replace function public.tasks_schedule_next()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text;
  today date;
  next_on date;
  next_id uuid;
begin
  if new.recurrence_rule is null or new.completed_at is null or old.completed_at is not null then
    return new;
  end if;

  select coalesce(p.timezone, 'UTC') into tz from public.profiles p where p.id = new.user_id;
  today := (now() at time zone tz)::date;
  next_on := coalesce(new.due_on, today);

  loop
    next_on := case new.recurrence_rule
      when 'daily' then next_on + 1
      when 'weekly' then next_on + 7
      when 'monthly' then (next_on + interval '1 month')::date
      when 'weekdays' then next_on + case extract(isodow from next_on)::int when 5 then 3 when 6 then 2 else 1 end
    end;
    exit when next_on > today;
  end loop;

  if exists (
    select 1 from public.tasks t
    where t.series_id = new.series_id and t.due_on >= next_on and t.completed_at is null
  ) then
    return new;
  end if;

  insert into public.tasks (user_id, title, notes, due_on, due_time, category, difficulty, difficulty_reason, difficulty_input_hash, recurrence_rule, series_id, is_shared)
  values (new.user_id, new.title, new.notes, next_on, new.due_time, new.category, new.difficulty, new.difficulty_reason, new.difficulty_input_hash, new.recurrence_rule, new.series_id, new.is_shared)
  returning id into next_id;

  insert into public.subtasks (task_id, title, est_minutes, position)
  select next_id, s.title, s.est_minutes, s.position from public.subtasks s where s.task_id = new.id;

  return new;
end;
$$;


-- ═══ 20261024300000_points.sql ═══

-- Rivl build step 4: points, streaks, badges, plus onboarding and the weekly goal.
-- Every point change is written here, by the database, never by the client.

-- ── Profile additions ─────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists streak_last_on date,
  add column if not exists streak_best integer not null default 0,
  -- One level of undo, so un-ticking the day's only task takes the streak back.
  add column if not exists streak_prev_count integer,
  add column if not exists streak_prev_on date,
  add column if not exists streak_prev_freezes integer,
  add column if not exists weekly_goal integer not null default 500 check (weekly_goal between 50 and 5000),
  add column if not exists onboarded_at timestamptz;

grant update (weekly_goal, onboarded_at) on public.profiles to authenticated;

-- ── Point events ──────────────────────────────────────────────────────────
create table if not exists public.point_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Deleting a completed task deletes its points.
  task_id uuid references public.tasks (id) on delete cascade,
  type text not null check (type in ('task', 'on_time', 'streak', 'focus', 'photo', 'challenge', 'invite')),
  amount integer not null,
  -- The owner's local calendar day, and the Monday of that week (the board resets Monday 00:00).
  day date not null,
  week_start date not null,
  created_at timestamptz not null default now()
);

create index if not exists point_events_user_week_idx on public.point_events (user_id, week_start);
create index if not exists point_events_user_day_idx on public.point_events (user_id, day);
create index if not exists point_events_task_idx on public.point_events (task_id) where task_id is not null;

alter table public.point_events enable row level security;
drop policy if exists "Users read their own points" on public.point_events;
create policy "Users read their own points"
  on public.point_events for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.point_events from anon;
revoke insert, update, delete on public.point_events from authenticated;

-- ── Badges ────────────────────────────────────────────────────────────────
create table if not exists public.achievements (
  id text primary key,
  name text not null,
  description text not null,
  icon text not null,
  position integer not null
);

insert into public.achievements (id, name, description, icon, position) values
  ('early', 'Early Bird', '5 tasks before 9 am', 'wb_twilight', 1),
  ('fire', 'On Fire', '7-day streak', 'local_fire_department', 2),
  ('heavy', 'Heavy Lifter', 'Finish a hard task', 'fitness_center', 3),
  ('rival', 'Rival', 'Win a challenge', 'swords', 4),
  ('sweep', 'Clean Sweep', 'Clear a whole day', 'cleaning_services', 5),
  ('slayer', 'Giant Slayer', 'Take #1 on the board', 'workspace_premium', 6),
  ('owl', 'Night Owl', '10 tasks after 10 pm', 'dark_mode', 7),
  ('cent', 'Centurion', 'Finish 100 tasks', 'military_tech', 8)
on conflict (id) do nothing;

create table if not exists public.user_achievements (
  user_id uuid not null references public.profiles (id) on delete cascade,
  achievement_id text not null references public.achievements (id),
  earned_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;
drop policy if exists "Anyone signed in can read badge definitions" on public.achievements;
create policy "Anyone signed in can read badge definitions"
  on public.achievements for select to authenticated using (true);
drop policy if exists "Users read their own badges" on public.user_achievements;
create policy "Users read their own badges"
  on public.user_achievements for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.achievements, public.user_achievements from anon;
revoke insert, update, delete on public.achievements, public.user_achievements from authenticated;

-- ── Scoring ───────────────────────────────────────────────────────────────

create or replace function public.local_day(p_user uuid, p_at timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select (p_at at time zone coalesce((select timezone from public.profiles where id = p_user), 'UTC'))::date;
$$;

create or replace function public.week_start_of(p_day date)
returns date
language sql
immutable
as $$
  select p_day - (extract(isodow from p_day)::int - 1);
$$;

/**
 * (Re)writes the task and on-time points for one task. Idempotent: safe to call
 * whenever completion or difficulty changes.
 * 5/10/20/35/50 by difficulty (2 if not rated yet), +20% if done on or before the
 * due date, nothing if the task was under 10 minutes old, and at most 300 task
 * points per day.
 */
create or replace function public.award_task_points(p_task uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  d date;
  base integer;
  bonus integer;
  used integer;
  room integer;
begin
  select * into t from public.tasks where id = p_task;
  delete from public.point_events where task_id = p_task and type in ('task', 'on_time');
  if t.id is null or t.completed_at is null then
    return;
  end if;
  if t.completed_at < t.created_at + interval '10 minutes' then
    return; -- Still counts for the streak, but earns nothing.
  end if;

  d := public.local_day(t.user_id, t.completed_at);
  base := case coalesce(t.difficulty, 2) when 1 then 5 when 2 then 10 when 3 then 20 when 4 then 35 else 50 end;
  bonus := case when t.due_on is not null and d <= t.due_on then round(base * 0.2)::int else 0 end;

  select coalesce(sum(amount), 0) into used
    from public.point_events
    where user_id = t.user_id and day = d and type in ('task', 'on_time');
  room := greatest(300 - used, 0);
  base := least(base, room);
  bonus := least(bonus, room - base);

  if base > 0 then
    insert into public.point_events (user_id, task_id, type, amount, day, week_start)
    values (t.user_id, t.id, 'task', base, d, public.week_start_of(d));
  end if;
  if bonus > 0 then
    insert into public.point_events (user_id, task_id, type, amount, day, week_start)
    values (t.user_id, t.id, 'on_time', bonus, d, public.week_start_of(d));
  end if;
end;
$$;

/**
 * First completion of a day keeps the streak: +1 (or a freeze covers one missed
 * day), streak points of 5 × tier (tier rises every 7 days, max 5), and a freeze
 * earned at every 7 days (hold at most 1).
 */
create or replace function public.streak_on_complete(p_user uuid, p_day date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles;
  next_count integer;
  next_freezes integer;
begin
  select * into p from public.profiles where id = p_user for update;
  if p.streak_last_on is not null and p_day <= p.streak_last_on then
    return; -- Already counted today (or a late sync of an earlier day).
  end if;

  next_freezes := p.streak_freezes;
  if p.streak_last_on = p_day - 1 then
    next_count := p.streak_count + 1;
  elsif p.streak_last_on = p_day - 2 and p.streak_freezes > 0 then
    next_count := p.streak_count + 1;
    next_freezes := next_freezes - 1;
  else
    next_count := 1;
  end if;
  if next_count % 7 = 0 and next_freezes < 1 then
    next_freezes := next_freezes + 1;
  end if;

  update public.profiles set
    streak_prev_count = p.streak_count,
    streak_prev_on = p.streak_last_on,
    streak_prev_freezes = p.streak_freezes,
    streak_count = next_count,
    streak_last_on = p_day,
    streak_freezes = next_freezes,
    streak_best = greatest(p.streak_best, next_count)
  where id = p_user;

  insert into public.point_events (user_id, type, amount, day, week_start)
  values (p_user, 'streak', 5 * least(5, 1 + (next_count - 1) / 7), p_day, public.week_start_of(p_day));
end;
$$;

/** If the day no longer has any completed task, take back that day's streak. */
create or replace function public.streak_on_undo(p_user uuid, p_day date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles;
begin
  if exists (
    select 1 from public.tasks
    where user_id = p_user and completed_at is not null and public.local_day(p_user, completed_at) = p_day
  ) then
    return;
  end if;
  select * into p from public.profiles where id = p_user for update;
  if p.streak_last_on is distinct from p_day then
    return;
  end if;
  update public.profiles set
    streak_count = coalesce(p.streak_prev_count, 0),
    streak_last_on = p.streak_prev_on,
    streak_freezes = coalesce(p.streak_prev_freezes, p.streak_freezes),
    streak_prev_count = null,
    streak_prev_on = null,
    streak_prev_freezes = null
  where id = p_user;
  delete from public.point_events where user_id = p_user and type = 'streak' and day = p_day;
end;
$$;

create or replace function public.grant_badge(p_user uuid, p_badge text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.user_achievements (user_id, achievement_id) values (p_user, p_badge)
  on conflict do nothing;
$$;

/** Checks the badges a completion can unlock. */
create or replace function public.check_badges(p_user uuid, p_task uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  tz text;
  d date;
begin
  select * into t from public.tasks where id = p_task;
  if not found or t.completed_at is null then
    return;
  end if;
  select coalesce(timezone, 'UTC') into tz from public.profiles where id = p_user;
  d := (t.completed_at at time zone tz)::date;

  if coalesce(t.difficulty, 0) >= 4 then
    perform public.grant_badge(p_user, 'heavy');
  end if;
  if (select streak_count from public.profiles where id = p_user) >= 7 then
    perform public.grant_badge(p_user, 'fire');
  end if;
  if (select count(*) from public.tasks where user_id = p_user and completed_at is not null) >= 100 then
    perform public.grant_badge(p_user, 'cent');
  end if;
  if extract(hour from t.completed_at at time zone tz) < 9 and (
    select count(*) from public.tasks
    where user_id = p_user and completed_at is not null and extract(hour from completed_at at time zone tz) < 9
  ) >= 5 then
    perform public.grant_badge(p_user, 'early');
  end if;
  if extract(hour from t.completed_at at time zone tz) >= 22 and (
    select count(*) from public.tasks
    where user_id = p_user and completed_at is not null and extract(hour from completed_at at time zone tz) >= 22
  ) >= 10 then
    perform public.grant_badge(p_user, 'owl');
  end if;
  -- Clean Sweep: at least 3 tasks due today, and nothing due today or earlier left open.
  if (select count(*) from public.tasks where user_id = p_user and due_on = d) >= 3
     and not exists (select 1 from public.tasks where user_id = p_user and completed_at is null and due_on <= d) then
    perform public.grant_badge(p_user, 'sweep');
  end if;
end;
$$;

create or replace function public.tasks_after_points()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.completed_at is not null then
      perform public.streak_on_undo(old.user_id, public.local_day(old.user_id, old.completed_at));
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.completed_at is not null then
      perform public.award_task_points(new.id);
      perform public.streak_on_complete(new.user_id, public.local_day(new.user_id, new.completed_at));
      perform public.check_badges(new.user_id, new.id);
    end if;
    return new;
  end if;

  if old.completed_at is null and new.completed_at is not null then
    perform public.award_task_points(new.id);
    perform public.streak_on_complete(new.user_id, public.local_day(new.user_id, new.completed_at));
    perform public.check_badges(new.user_id, new.id);
  elsif old.completed_at is not null and new.completed_at is null then
    perform public.award_task_points(new.id); -- Removes them.
    perform public.streak_on_undo(new.user_id, public.local_day(new.user_id, old.completed_at));
  elsif new.completed_at is not null and (old.difficulty is distinct from new.difficulty or old.due_on is distinct from new.due_on) then
    -- Rated (or re-dated) after it was finished: recalculate.
    perform public.award_task_points(new.id);
    perform public.check_badges(new.user_id, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_after_points on public.tasks;
create trigger tasks_after_points
  after insert or update of completed_at, difficulty, due_on or delete on public.tasks
  for each row execute function public.tasks_after_points();

revoke execute on function public.award_task_points(uuid), public.streak_on_complete(uuid, date), public.streak_on_undo(uuid, date),
  public.grant_badge(uuid, text), public.check_badges(uuid, uuid) from public, anon, authenticated;

-- ── Stats for the profile screen ──────────────────────────────────────────
/** Lifetime points, tasks done and an 18-week activity calendar for the signed-in user. */
create or replace function public.my_stats()
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  select json_build_object(
    'total_points', (select coalesce(sum(amount), 0) from public.point_events where user_id = auth.uid()),
    'tasks_done', (select count(*) from public.tasks where user_id = auth.uid() and completed_at is not null),
    'days', coalesce((
      select json_agg(json_build_object('day', day, 'count', n) order by day)
      from (
        select public.local_day(auth.uid(), completed_at) as day, count(*) as n
        from public.tasks
        where user_id = auth.uid() and completed_at > now() - interval '127 days'
        group by 1
      ) x
    ), '[]'::json)
  );
$$;

grant execute on function public.my_stats() to authenticated;
grant execute on function public.local_day(uuid, timestamptz) to authenticated;


-- ═══ 20261024400000_friends.sql ═══

-- Rivl build step 5: friends, invite links, requests, block and report.
-- Users never read other profiles directly. Everything goes through the
-- functions below, which return only public fields (name, username, colour, streak).

-- ── Tables ────────────────────────────────────────────────────────────────
create table if not exists public.invites (
  code text primary key check (code ~ '^[a-z0-9]{8}$'),
  inviter_id uuid not null unique references public.profiles (id) on delete cascade,
  uses integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.invite_redemptions (
  -- Each account can be brought in by one invite, once.
  invitee_id uuid primary key references public.profiles (id) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  code text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  -- For 'blocked', requester is the person who blocked.
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);

-- One row per pair, whichever direction.
create unique index if not exists friendships_pair_idx on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_addressee_idx on public.friendships (addressee_id, status);
create index if not exists friendships_requester_idx on public.friendships (requester_id, status);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_user_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists profiles_username_prefix_idx on public.profiles (username text_pattern_ops);

alter table public.invites enable row level security;
alter table public.invite_redemptions enable row level security;
alter table public.friendships enable row level security;
alter table public.reports enable row level security;

drop policy if exists "Users read their own invite" on public.invites;
create policy "Users read their own invite" on public.invites for select to authenticated
  using ((select auth.uid()) = inviter_id);
drop policy if exists "Users read their own friendships" on public.friendships;
create policy "Users read their own friendships" on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

revoke all on public.invites, public.invite_redemptions, public.friendships, public.reports from anon;
revoke insert, update, delete on public.invites, public.invite_redemptions, public.friendships, public.reports from authenticated;
revoke select on public.invite_redemptions, public.reports from authenticated;

-- ── Helpers ───────────────────────────────────────────────────────────────

/** The friendship row between the caller and another user, if any. */
create or replace function public.friendship_with(p_other uuid)
returns public.friendships
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.friendships
  where least(requester_id, addressee_id) = least(auth.uid(), p_other)
    and greatest(requester_id, addressee_id) = greatest(auth.uid(), p_other);
$$;

/** How another user relates to the caller: none, friends, incoming, outgoing, blocked (by either side). */
create or replace function public.relation_to(p_other uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when f.id is null then 'none'
    when f.status = 'accepted' then 'friends'
    when f.status = 'blocked' then 'blocked'
    when f.requester_id = auth.uid() then 'outgoing'
    else 'incoming'
  end
  from (select (public.friendship_with(p_other)).*) f;
$$;

-- ── Invites ───────────────────────────────────────────────────────────────

/** The caller's invite code, created on first use. */
create or replace function public.my_invite_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c text;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  select code into c from public.invites where inviter_id = auth.uid();
  if c is not null then
    return c;
  end if;
  loop
    c := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    exit when not exists (select 1 from public.invites where code = c);
  end loop;
  insert into public.invites (code, inviter_id) values (c, auth.uid());
  return c;
end;
$$;

/** Public card for an invite link: who's inviting. Works signed out. */
create or replace function public.invite_lookup(p_code text)
returns table (display_name text, username text, accent text, streak_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name, p.username, p.accent, p.streak_count
  from public.invites i join public.profiles p on p.id = i.inviter_id
  where i.code = lower(p_code);
$$;

/**
 * Joins via an invite: makes the two of you friends and, the first time a new
 * account (under 7 days old) joins, gives both people +100 points.
 * Returns 'joined', 'joined_bonus', 'self', 'blocked' or 'invalid'.
 */
create or replace function public.redeem_invite(p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  inviter uuid;
  f public.friendships;
  fresh boolean;
  d date;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  select inviter_id into inviter from public.invites where code = lower(p_code);
  if inviter is null then
    return 'invalid';
  end if;
  if inviter = me then
    return 'self';
  end if;

  f := public.friendship_with(inviter);
  if f.status = 'blocked' then
    return 'blocked';
  elsif f.id is null then
    insert into public.friendships (requester_id, addressee_id, status, responded_at) values (inviter, me, 'accepted', now());
  elsif f.status = 'pending' then
    update public.friendships set status = 'accepted', responded_at = now() where id = f.id;
  end if;

  select u.created_at > now() - interval '7 days' into fresh from auth.users u where u.id = me;
  if coalesce(fresh, false) and not exists (select 1 from public.invite_redemptions where invitee_id = me) then
    insert into public.invite_redemptions (invitee_id, inviter_id, code) values (me, inviter, lower(p_code));
    update public.invites set uses = uses + 1 where code = lower(p_code);
    d := public.local_day(me, now());
    insert into public.point_events (user_id, type, amount, day, week_start) values (me, 'invite', 100, d, public.week_start_of(d));
    d := public.local_day(inviter, now());
    insert into public.point_events (user_id, type, amount, day, week_start) values (inviter, 'invite', 100, d, public.week_start_of(d));
    return 'joined_bonus';
  end if;
  return 'joined';
end;
$$;

-- ── Finding people ────────────────────────────────────────────────────────

/** Username prefix search (2+ characters), hiding yourself and anyone blocked either way. */
create or replace function public.search_profiles(p_query text)
returns table (id uuid, display_name text, username text, accent text, relation text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.username, p.accent, public.relation_to(p.id)
  from public.profiles p
  where char_length(trim(p_query)) >= 2
    and p.username like lower(trim(leading '@' from trim(p_query))) || '%'
    and p.id <> auth.uid()
    and public.relation_to(p.id) <> 'blocked'
  order by p.username
  limit 10;
$$;

/** Accepted friends with their public card. */
create or replace function public.my_friends()
returns table (id uuid, display_name text, username text, accent text, streak_count integer, streak_last_on date, since timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.username, p.accent, p.streak_count, p.streak_last_on, f.responded_at
  from public.friendships f
  join public.profiles p on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  where f.status = 'accepted' and auth.uid() in (f.requester_id, f.addressee_id)
  order by lower(coalesce(p.display_name, p.username));
$$;

/** Pending requests both ways, and people you've blocked. */
create or replace function public.my_friend_requests()
returns table (friendship_id uuid, direction text, id uuid, display_name text, username text, accent text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id,
         case when f.status = 'blocked' then 'blocked' when f.addressee_id = auth.uid() then 'incoming' else 'outgoing' end,
         p.id, p.display_name, p.username, p.accent, f.created_at
  from public.friendships f
  join public.profiles p on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  where (f.status = 'pending' and auth.uid() in (f.requester_id, f.addressee_id))
     or (f.status = 'blocked' and f.requester_id = auth.uid())
  order by f.created_at desc;
$$;

-- ── Requests ──────────────────────────────────────────────────────────────

/**
 * Sends a friend request (max 20 a day). If they already asked you, you're
 * now friends. Returns the new relation, or 'limit' / 'unavailable'.
 */
create or replace function public.send_friend_request(p_other uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  f public.friendships;
begin
  if me is null or p_other is null or p_other = me or not exists (select 1 from public.profiles where id = p_other) then
    return 'unavailable';
  end if;
  f := public.friendship_with(p_other);
  if f.status = 'blocked' then
    return 'unavailable'; -- Don't reveal who blocked whom.
  elsif f.status = 'accepted' then
    return 'friends';
  elsif f.status = 'pending' and f.addressee_id = me then
    update public.friendships set status = 'accepted', responded_at = now() where id = f.id;
    return 'friends';
  elsif f.status = 'pending' then
    return 'outgoing';
  end if;
  if (select count(*) from public.friendships where requester_id = me and created_at > now() - interval '1 day') >= 20 then
    return 'limit';
  end if;
  insert into public.friendships (requester_id, addressee_id, status) values (me, p_other, 'pending');
  return 'outgoing';
end;
$$;

/** Accept or decline a request sent to you. */
create or replace function public.respond_friend_request(p_friendship uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_accept then
    update public.friendships set status = 'accepted', responded_at = now()
    where id = p_friendship and addressee_id = auth.uid() and status = 'pending';
    return case when found then 'friends' else 'unavailable' end;
  end if;
  delete from public.friendships where id = p_friendship and addressee_id = auth.uid() and status = 'pending';
  return 'none';
end;
$$;

/** Unfriend, cancel your own request, or unblock someone you blocked. */
create or replace function public.remove_friend(p_other uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.friendships
  where least(requester_id, addressee_id) = least(auth.uid(), p_other)
    and greatest(requester_id, addressee_id) = greatest(auth.uid(), p_other)
    and (status <> 'blocked' or requester_id = auth.uid());
  return 'none';
end;
$$;

/** Blocks someone: ends any friendship and hides you from each other. */
create or replace function public.block_user(p_other uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or p_other is null or p_other = me then
    return 'unavailable';
  end if;
  delete from public.friendships
  where least(requester_id, addressee_id) = least(me, p_other)
    and greatest(requester_id, addressee_id) = greatest(me, p_other)
    and not (status = 'blocked' and requester_id = p_other);
  if exists (select 1 from public.friendships
             where least(requester_id, addressee_id) = least(me, p_other)
               and greatest(requester_id, addressee_id) = greatest(me, p_other)) then
    return 'blocked'; -- They already blocked you; nothing more to do.
  end if;
  insert into public.friendships (requester_id, addressee_id, status, responded_at) values (me, p_other, 'blocked', now());
  return 'blocked';
end;
$$;

/** Reports someone for review (max 10 a day). */
create or replace function public.report_user(p_other uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or p_other = auth.uid() or not exists (select 1 from public.profiles where id = p_other) then
    return 'unavailable';
  end if;
  if (select count(*) from public.reports where reporter_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    return 'limit';
  end if;
  insert into public.reports (reporter_id, target_user_id, reason) values (auth.uid(), p_other, left(coalesce(nullif(trim(p_reason), ''), 'No reason given'), 500));
  return 'reported';
end;
$$;

-- Internal helpers stay internal; the rest are the friends API.
revoke execute on function public.friendship_with(uuid), public.relation_to(uuid) from public, anon, authenticated;
revoke execute on function public.my_invite_code(), public.redeem_invite(text), public.search_profiles(text), public.my_friends(),
  public.my_friend_requests(), public.send_friend_request(uuid), public.respond_friend_request(uuid, boolean),
  public.remove_friend(uuid), public.block_user(uuid), public.report_user(uuid, text) from public, anon;
grant execute on function public.my_invite_code(), public.redeem_invite(text), public.search_profiles(text), public.my_friends(),
  public.my_friend_requests(), public.send_friend_request(uuid), public.respond_friend_request(uuid, boolean),
  public.remove_friend(uuid), public.block_user(uuid), public.report_user(uuid, text) to authenticated;
grant execute on function public.invite_lookup(text) to anon, authenticated;


-- ═══ 20261024500000_board.sql ═══

-- Rivl build step 6: the weekly leaderboard.
-- The board is a live sum of point_events for the current week, so it "resets"
-- on its own at Monday 00:00 in each person's time zone. A job closes each
-- finished week into weekly_results (for the recap card and Giant Slayer).

-- Friends can see each other's point events: the board shows these totals
-- anyway, and it lets Realtime push friends' points to the board live.
drop policy if exists "Friends read each other's points" on public.point_events;
create policy "Friends read each other's points"
  on public.point_events for select to authenticated
  using (exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = (select auth.uid()) and f.addressee_id = point_events.user_id)
        or (f.addressee_id = (select auth.uid()) and f.requester_id = point_events.user_id))
  ));

/** You and your friends for the week (default: your current week), ranked by points. */
create or replace function public.weekly_board(p_week date default null)
returns table (
  id uuid, display_name text, username text, accent text,
  points integer, streak_count integer, streak_last_on date, is_me boolean, rank integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select auth.uid() as id,
           coalesce(p_week, public.week_start_of(public.local_day(auth.uid(), now()))) as week
  ),
  people as (
    select me.id from me
    union
    select case when f.requester_id = me.id then f.addressee_id else f.requester_id end
    from public.friendships f, me
    where f.status = 'accepted' and me.id in (f.requester_id, f.addressee_id)
  ),
  totals as (
    select pe.user_id, sum(pe.amount)::int as points
    from public.point_events pe, me
    where pe.week_start = me.week and pe.user_id in (select id from people)
    group by pe.user_id
  )
  select p.id, p.display_name, p.username, p.accent,
         coalesce(t.points, 0), p.streak_count, p.streak_last_on, p.id = (select id from me),
         (rank() over (order by coalesce(t.points, 0) desc))::int
  from people x
  join public.profiles p on p.id = x.id
  left join totals t on t.user_id = p.id
  where auth.uid() is not null
  order by coalesce(t.points, 0) desc, lower(coalesce(p.display_name, p.username, ''));
$$;

revoke execute on function public.weekly_board(date) from public, anon;
grant execute on function public.weekly_board(date) to authenticated;

-- ── Closing weeks ─────────────────────────────────────────────────────────
create table if not exists public.weekly_results (
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  points integer not null,
  rank integer not null,
  rivals integer not null, -- How many friends were on the board.
  created_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

alter table public.weekly_results enable row level security;
drop policy if exists "Users read their own results" on public.weekly_results;
create policy "Users read their own results" on public.weekly_results for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.weekly_results from anon;
revoke insert, update, delete on public.weekly_results from authenticated;

/**
 * For everyone whose local week has rolled over, records last week's points and
 * rank among their friends. Finishing #1 against at least one friend who scored
 * earns Giant Slayer. Idempotent; run it hourly.
 */
create or replace function public.close_weeks()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
  last_week date;
  mine integer;
  better integer;
  scored_rivals integer;
  rivals integer;
  closed integer := 0;
begin
  for p in select id from public.profiles where onboarded_at is not null loop
    last_week := public.week_start_of(public.local_day(p.id, now())) - 7;
    continue when exists (select 1 from public.weekly_results where user_id = p.id and week_start = last_week);

    select coalesce(sum(amount), 0) into mine from public.point_events where user_id = p.id and week_start = last_week;
    with friends as (
      select case when f.requester_id = p.id then f.addressee_id else f.requester_id end as id
      from public.friendships f
      where f.status = 'accepted' and p.id in (f.requester_id, f.addressee_id)
    ), totals as (
      select fr.id, coalesce((select sum(amount) from public.point_events pe where pe.user_id = fr.id and pe.week_start = last_week), 0) as pts
      from friends fr
    )
    select count(*) filter (where pts > mine), count(*) filter (where pts > 0), count(*)
      into better, scored_rivals, rivals
    from totals;

    insert into public.weekly_results (user_id, week_start, points, rank, rivals)
    values (p.id, last_week, mine, better + 1, rivals);
    closed := closed + 1;

    if better = 0 and mine > 0 and scored_rivals > 0 then
      perform public.grant_badge(p.id, 'slayer');
    end if;
  end loop;
  return closed;
end;
$$;

revoke execute on function public.close_weeks() from public, anon, authenticated;

update public.achievements set description = 'Finish a week #1 on the board' where id = 'slayer';

-- Run close_weeks() hourly (pg_cron), and stream point_events over Realtime.
-- Both are optional extras: if either isn't available, the board still works.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('rivl-close-weeks', '7 * * * *', 'select public.close_weeks()');
exception when others then
  raise notice 'pg_cron not available (%). Enable it under Database → Extensions, then run: select cron.schedule(''rivl-close-weeks'', ''7 * * * *'', ''select public.close_weeks()'');', sqlerrm;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.point_events;
exception when others then
  raise notice 'Realtime publication not updated (%). The board falls back to refreshing every 30 seconds.', sqlerrm;
end;
$$;


-- ═══ 20261024600000_challenges.sql ═══

-- Rivl build step 7: head-to-head challenges.
--   points: most points between start and end
--   tasks:  first to N tasks (that earned points), or most tasks by the end
-- Progress only counts point events after the challenge starts, so it can't be
-- padded with old work. Winners get +50 and the Rival badge.

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  opponent_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('points', 'tasks')),
  target integer check (target between 1 and 100),
  starts_at timestamptz,
  ends_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'declined', 'cancelled', 'finished')),
  winner_id uuid references public.profiles (id) on delete set null,
  creator_score integer,
  opponent_score integer,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  check (creator_id <> opponent_id),
  check ((type = 'tasks') = (target is not null))
);

create index if not exists challenges_creator_idx on public.challenges (creator_id, status);
create index if not exists challenges_opponent_idx on public.challenges (opponent_id, status);
create index if not exists challenges_open_idx on public.challenges (ends_at) where status = 'active';

alter table public.challenges enable row level security;
drop policy if exists "Players read their challenges" on public.challenges;
create policy "Players read their challenges" on public.challenges for select to authenticated
  using ((select auth.uid()) in (creator_id, opponent_id));
revoke all on public.challenges from anon;
revoke insert, update, delete on public.challenges from authenticated;

/** One player's score in a challenge so far. */
create or replace function public.challenge_score(c public.challenges, p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when c.starts_at is null then 0
    when c.type = 'points' then coalesce((
      select sum(amount) from public.point_events
      where user_id = p_user and type not in ('challenge', 'invite')
        and created_at >= c.starts_at and created_at < c.ends_at), 0)::int
    else (
      select count(distinct task_id) from public.point_events
      where user_id = p_user and type = 'task'
        and created_at >= c.starts_at and created_at < c.ends_at)::int
  end;
$$;

/** Finishes a challenge if it's over: deadline passed, or someone reached N first. */
create or replace function public.settle_challenge(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.challenges;
  a integer;
  b integer;
  winner uuid;
  d date;
begin
  select * into c from public.challenges where id = p_id and status = 'active' for update;
  if c.id is null then
    return;
  end if;
  a := public.challenge_score(c, c.creator_id);
  b := public.challenge_score(c, c.opponent_id);
  if not (now() >= c.ends_at or (c.type = 'tasks' and greatest(a, b) >= c.target)) then
    return;
  end if;

  winner := case when a > b then c.creator_id when b > a then c.opponent_id end; -- Tie: a draw.
  update public.challenges
     set status = 'finished', winner_id = winner, creator_score = a, opponent_score = b, finished_at = now()
   where id = c.id;

  if winner is not null then
    d := public.local_day(winner, now());
    insert into public.point_events (user_id, type, amount, day, week_start)
    values (winner, 'challenge', 50, d, public.week_start_of(d));
    perform public.grant_badge(winner, 'rival');
  end if;
end;
$$;

/** Settles every active challenge that's due. Run every few minutes. */
create or replace function public.settle_challenges()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  for r in select id from public.challenges where status = 'active' and ends_at <= now() loop
    perform public.settle_challenge(r.id);
    n := n + 1;
  end loop;
  -- Pending invites nobody answered before the end are dropped.
  update public.challenges set status = 'cancelled' where status = 'pending' and ends_at <= now();
  return n;
end;
$$;

-- "First to N" ends the moment someone gets there.
create or replace function public.challenges_after_points()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if new.type <> 'task' then
    return new;
  end if;
  for r in
    select id from public.challenges
    where status = 'active' and type = 'tasks' and new.user_id in (creator_id, opponent_id)
  loop
    perform public.settle_challenge(r.id);
  end loop;
  return new;
end;
$$;

drop trigger if exists challenges_after_points on public.point_events;
create trigger challenges_after_points
  after insert on public.point_events
  for each row execute function public.challenges_after_points();

-- ── Player actions ────────────────────────────────────────────────────────

/**
 * Challenges a friend. Ends between 1 hour and 14 days from now; at most 5 open
 * challenges each. Returns the new id, or raises a short reason.
 */
create or replace function public.create_challenge(p_opponent uuid, p_type text, p_target integer, p_ends_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  new_id uuid;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  if public.relation_to(p_opponent) <> 'friends' then
    raise exception 'not_friends';
  end if;
  if p_type not in ('points', 'tasks') or (p_type = 'tasks' and (p_target is null or p_target not between 1 and 100)) then
    raise exception 'bad_target';
  end if;
  if p_ends_at < now() + interval '1 hour' or p_ends_at > now() + interval '14 days' then
    raise exception 'bad_end';
  end if;
  if (select count(*) from public.challenges
      where me in (creator_id, opponent_id) and status in ('pending', 'active')) >= 5 then
    raise exception 'too_many';
  end if;
  insert into public.challenges (creator_id, opponent_id, type, target, ends_at)
  values (me, p_opponent, p_type, case when p_type = 'tasks' then p_target end, p_ends_at)
  returning id into new_id;
  return new_id;
end;
$$;

/** Accept (it starts now) or decline a challenge sent to you. */
create or replace function public.respond_challenge(p_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.challenges
     set status = case when p_accept then 'active' else 'declined' end,
         starts_at = case when p_accept then now() end
   where id = p_id and opponent_id = auth.uid() and status = 'pending' and ends_at > now();
  return case when not found then 'unavailable' when p_accept then 'active' else 'declined' end;
end;
$$;

/** Withdraw a challenge you sent that hasn't been accepted yet. */
create or replace function public.cancel_challenge(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.challenges set status = 'cancelled'
   where id = p_id and creator_id = auth.uid() and status = 'pending';
  return case when found then 'cancelled' else 'unavailable' end;
end;
$$;

/**
 * Your challenges: open ones, plus anything finished in the last week, with
 * live scores from your side ("me" and "them").
 */
create or replace function public.my_challenges()
returns table (
  id uuid, type text, target integer, status text, starts_at timestamptz, ends_at timestamptz, finished_at timestamptz,
  i_created boolean, outcome text, my_score integer, their_score integer,
  them_id uuid, them_name text, them_username text, them_accent text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Settle anything of yours that's due, so results never wait for the job.
  perform public.settle_challenge(c.id)
     from public.challenges c
    where c.status = 'active' and auth.uid() in (c.creator_id, c.opponent_id) and c.ends_at <= now();

  return query
  select c.id, c.type, c.target, c.status, c.starts_at, c.ends_at, c.finished_at,
         c.creator_id = auth.uid(),
         case when c.status <> 'finished' then null
              when c.winner_id is null then 'draw'
              when c.winner_id = auth.uid() then 'won' else 'lost' end,
         case when c.status = 'finished' then (case when c.creator_id = auth.uid() then c.creator_score else c.opponent_score end)
              else public.challenge_score(c, auth.uid()) end,
         case when c.status = 'finished' then (case when c.creator_id = auth.uid() then c.opponent_score else c.creator_score end)
              else public.challenge_score(c, case when c.creator_id = auth.uid() then c.opponent_id else c.creator_id end) end,
         p.id, p.display_name, p.username, p.accent
  from public.challenges c
  join public.profiles p on p.id = case when c.creator_id = auth.uid() then c.opponent_id else c.creator_id end
  where auth.uid() in (c.creator_id, c.opponent_id)
    and (c.status in ('pending', 'active') or (c.status = 'finished' and c.finished_at > now() - interval '7 days'))
  order by case c.status when 'pending' then 0 when 'active' then 1 else 2 end, c.ends_at;
end;
$$;

revoke execute on function public.challenge_score(public.challenges, uuid), public.settle_challenge(uuid),
  public.settle_challenges() from public, anon, authenticated;
revoke execute on function public.create_challenge(uuid, text, integer, timestamptz), public.respond_challenge(uuid, boolean),
  public.cancel_challenge(uuid), public.my_challenges() from public, anon;
grant execute on function public.create_challenge(uuid, text, integer, timestamptz), public.respond_challenge(uuid, boolean),
  public.cancel_challenge(uuid), public.my_challenges() to authenticated;

-- Wins for the profile screen.
create or replace function public.my_stats()
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  select json_build_object(
    'total_points', (select coalesce(sum(amount), 0) from public.point_events where user_id = auth.uid()),
    'tasks_done', (select count(*) from public.tasks where user_id = auth.uid() and completed_at is not null),
    'wins', (select count(*) from public.challenges where winner_id = auth.uid()),
    'days', coalesce((
      select json_agg(json_build_object('day', day, 'count', n) order by day)
      from (
        select public.local_day(auth.uid(), completed_at) as day, count(*) as n
        from public.tasks
        where user_id = auth.uid() and completed_at > now() - interval '127 days'
        group by 1
      ) x
    ), '[]'::json)
  );
$$;

do $$
begin
  perform cron.schedule('rivl-settle-challenges', '*/5 * * * *', 'select public.settle_challenges()');
exception when others then
  raise notice 'pg_cron not available (%). Challenges still settle when players open the app.', sqlerrm;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.challenges;
exception when others then
  raise notice 'Realtime publication not updated (%). Challenge cards refresh every 30 seconds instead.', sqlerrm;
end;
$$;


-- ═══ 20261024700000_feed.sql ═══

-- Rivl build step 8: the feed of shared wins.
-- A post appears when a task marked "shared" is finished. Friends see the title,
-- points and an optional photo; notes and steps stay private. Reactions are
-- 🔥 👏 😂 💪. Two "sus" flags remove a post's points until the owner adds photo
-- proof. Photos earn +10, live in a private bucket and are deleted after 7 days.

alter table public.profiles add column if not exists share_by_default boolean not null default false;
grant update (share_by_default) on public.profiles to authenticated;

create table if not exists public.feed_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  task_id uuid not null unique references public.tasks (id) on delete cascade,
  title text not null,
  photo_path text,
  verified boolean not null default false, -- Photo proof was added (stays true after the photo expires).
  flags_count integer not null default 0,
  points_removed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists feed_posts_user_idx on public.feed_posts (user_id, created_at desc);
create index if not exists feed_posts_recent_idx on public.feed_posts (created_at desc);

create table if not exists public.reactions (
  post_id uuid not null references public.feed_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (emoji in ('🔥', '👏', '😂', '💪')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, emoji)
);

create table if not exists public.post_flags (
  post_id uuid not null references public.feed_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

/** True when the caller is the user or an accepted friend of theirs. */
create or replace function public.can_see(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user = auth.uid() or exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = auth.uid() and f.addressee_id = p_user) or (f.addressee_id = auth.uid() and f.requester_id = p_user))
  );
$$;

alter table public.feed_posts enable row level security;
alter table public.reactions enable row level security;
alter table public.post_flags enable row level security;

drop policy if exists "Friends see posts" on public.feed_posts;
create policy "Friends see posts" on public.feed_posts for select to authenticated
  using (public.can_see(user_id));
drop policy if exists "Friends see reactions" on public.reactions;
create policy "Friends see reactions" on public.reactions for select to authenticated
  using (exists (select 1 from public.feed_posts p where p.id = post_id and public.can_see(p.user_id)));
drop policy if exists "React to friends' posts" on public.reactions;
create policy "React to friends' posts" on public.reactions for insert to authenticated
  with check ((select auth.uid()) = user_id and exists (select 1 from public.feed_posts p where p.id = post_id and public.can_see(p.user_id)));
drop policy if exists "Remove your own reactions" on public.reactions;
create policy "Remove your own reactions" on public.reactions for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.feed_posts, public.reactions, public.post_flags from anon;
revoke insert, update, delete on public.feed_posts, public.post_flags from authenticated;
revoke update on public.reactions from authenticated;
revoke select on public.post_flags from authenticated;

-- ── Posts follow the task ─────────────────────────────────────────────────

/** Creates or removes the post for a task as completion and sharing change. */
create or replace function public.tasks_sync_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.completed_at is not null and new.is_shared then
    insert into public.feed_posts (user_id, task_id, title, created_at)
    values (new.user_id, new.id, new.title, new.completed_at)
    on conflict (task_id) do update set title = excluded.title;
  else
    delete from public.feed_posts where task_id = new.id; -- Un-ticked or made private.
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_sync_post on public.tasks;
create trigger tasks_sync_post
  after insert or update of completed_at, is_shared, title on public.tasks
  for each row execute function public.tasks_sync_post();

-- Flagged posts keep their points removed until proof arrives, however the task changes.
create or replace function public.award_task_points(p_task uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  d date;
  base integer;
  bonus integer;
  used integer;
  room integer;
begin
  select * into t from public.tasks where id = p_task;
  delete from public.point_events where task_id = p_task and type in ('task', 'on_time');
  if t.id is null or t.completed_at is null then
    return;
  end if;
  if t.completed_at < t.created_at + interval '10 minutes' then
    return; -- Still counts for the streak, but earns nothing.
  end if;
  if exists (select 1 from public.feed_posts where task_id = p_task and points_removed) then
    return;
  end if;

  d := public.local_day(t.user_id, t.completed_at);
  base := case coalesce(t.difficulty, 2) when 1 then 5 when 2 then 10 when 3 then 20 when 4 then 35 else 50 end;
  bonus := case when t.due_on is not null and d <= t.due_on then round(base * 0.2)::int else 0 end;

  select coalesce(sum(amount), 0) into used
    from public.point_events
    where user_id = t.user_id and day = d and type in ('task', 'on_time');
  room := greatest(300 - used, 0);
  base := least(base, room);
  bonus := least(bonus, room - base);

  if base > 0 then
    insert into public.point_events (user_id, task_id, type, amount, day, week_start)
    values (t.user_id, t.id, 'task', base, d, public.week_start_of(d));
  end if;
  if bonus > 0 then
    insert into public.point_events (user_id, task_id, type, amount, day, week_start)
    values (t.user_id, t.id, 'on_time', bonus, d, public.week_start_of(d));
  end if;
end;
$$;

-- ── Feed ──────────────────────────────────────────────────────────────────

/** Your and your friends' shared wins, newest first, 20 at a time. */
create or replace function public.my_feed(p_before timestamptz default null)
returns table (
  id uuid, user_id uuid, display_name text, username text, accent text, is_me boolean,
  title text, points integer, photo_path text, verified boolean, points_removed boolean,
  flags_count integer, i_flagged boolean, created_at timestamptz, reactions jsonb, my_reactions text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.user_id, pr.display_name, pr.username, pr.accent, p.user_id = auth.uid(),
         p.title,
         coalesce((select sum(amount) from public.point_events e where e.task_id = p.task_id and e.type in ('task', 'on_time')), 0)::int
           + case when p.verified then 10 else 0 end,
         p.photo_path, p.verified, p.points_removed, p.flags_count,
         exists (select 1 from public.post_flags f where f.post_id = p.id and f.user_id = auth.uid()),
         p.created_at,
         coalesce((select jsonb_object_agg(emoji, n) from (select emoji, count(*) n from public.reactions r where r.post_id = p.id group by emoji) x), '{}'::jsonb),
         coalesce((select array_agg(emoji) from public.reactions r where r.post_id = p.id and r.user_id = auth.uid()), '{}')
  from public.feed_posts p
  join public.profiles pr on pr.id = p.user_id
  where public.can_see(p.user_id)
    and (p_before is null or p.created_at < p_before)
    and p.created_at > now() - interval '30 days'
  order by p.created_at desc
  limit 20;
$$;

/**
 * Flags a friend's post as sus (once each). At 2 flags its points are removed
 * until the owner adds photo proof. Returns the post's flag count.
 */
create or replace function public.flag_post(p_post uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.feed_posts;
begin
  select * into p from public.feed_posts where id = p_post for update;
  if p.id is null or p.user_id = auth.uid() or not public.can_see(p.user_id) then
    raise exception 'unavailable';
  end if;
  insert into public.post_flags (post_id, user_id) values (p_post, auth.uid()) on conflict do nothing;
  if not found then
    return p.flags_count;
  end if;
  update public.feed_posts set flags_count = flags_count + 1 where id = p_post returning * into p;
  if p.flags_count >= 2 and not p.verified and not p.points_removed then
    update public.feed_posts set points_removed = true where id = p_post;
    delete from public.point_events where task_id = p.task_id and type in ('task', 'on_time');
  end if;
  return p.flags_count;
end;
$$;

/**
 * Attaches photo proof to your post after uploading it to the proofs bucket:
 * +10 points (once), the verified tick, and any sus-removed points back.
 */
create or replace function public.attach_proof(p_post uuid, p_path text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.feed_posts;
  d date;
begin
  select * into p from public.feed_posts where id = p_post and user_id = auth.uid() for update;
  if p.id is null then
    return 'unavailable';
  end if;
  if p_path is null or p_path not like auth.uid()::text || '/%' then
    return 'bad_path';
  end if;
  update public.feed_posts set photo_path = p_path, verified = true, points_removed = false where id = p_post;
  if not p.verified then
    d := public.local_day(p.user_id, now());
    insert into public.point_events (user_id, task_id, type, amount, day, week_start)
    values (p.user_id, p.task_id, 'photo', 10, d, public.week_start_of(d));
  end if;
  if p.points_removed then
    perform public.award_task_points(p.task_id);
  end if;
  return 'verified';
end;
$$;

revoke execute on function public.can_see(uuid), public.tasks_sync_post() from public, anon;
revoke execute on function public.my_feed(timestamptz), public.flag_post(uuid), public.attach_proof(uuid, text) from public, anon;
grant execute on function public.can_see(uuid), public.my_feed(timestamptz), public.flag_post(uuid), public.attach_proof(uuid, text) to authenticated;

-- ── Photo storage ─────────────────────────────────────────────────────────
-- Private bucket, 1 MB max. Files live at <user id>/<post id>.webp; friends can
-- read them through short-lived signed URLs. A daily job deletes them after 7 days.
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('proofs', 'proofs', false, 1048576, array['image/webp', 'image/jpeg'])
  on conflict (id) do update set public = false, file_size_limit = 1048576, allowed_mime_types = array['image/webp', 'image/jpeg'];

  execute 'drop policy if exists "Upload your own proof" on storage.objects';
  execute $p$create policy "Upload your own proof" on storage.objects for insert to authenticated
    with check (bucket_id = 'proofs' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
  execute 'drop policy if exists "Replace your own proof" on storage.objects';
  execute $p$create policy "Replace your own proof" on storage.objects for update to authenticated
    using (bucket_id = 'proofs' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
  execute 'drop policy if exists "Friends see proofs" on storage.objects';
  execute $p$create policy "Friends see proofs" on storage.objects for select to authenticated
    using (bucket_id = 'proofs' and public.can_see(((storage.foldername(name))[1])::uuid))$p$;
exception when others then
  raise notice 'Storage not set up (%). Photo proof needs the proofs bucket; everything else works.', sqlerrm;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.reactions;
exception when others then
  raise notice 'Realtime publication not updated (%). Reactions refresh when the feed reloads.', sqlerrm;
end;
$$;

-- Photos whose post was deleted (un-ticked or made private), for the cleanup job.
create table if not exists public.proof_trash (
  path text primary key,
  created_at timestamptz not null default now()
);
alter table public.proof_trash enable row level security;
revoke all on public.proof_trash from anon, authenticated;

create or replace function public.feed_posts_trash_photo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.photo_path is not null then
    insert into public.proof_trash (path) values (old.photo_path) on conflict do nothing;
  end if;
  return old;
end;
$$;

drop trigger if exists feed_posts_trash_photo on public.feed_posts;
create trigger feed_posts_trash_photo
  after delete on public.feed_posts
  for each row execute function public.feed_posts_trash_photo();


-- ═══ 20261024800000_coach.sql ═══

-- Rivl build step 9: nudges and the coach's daily recap.
-- A nudge is a one-line poke to a friend (a preset or AI-written in the
-- sender's coach style), at most 3 per friend per day. The recap is a 2–3
-- sentence end-of-day message, written once per day by the server.

create table if not exists public.nudges (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  message text not null check (char_length(message) between 1 and 120),
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  check (from_id <> to_id)
);

create index if not exists nudges_to_idx on public.nudges (to_id, created_at desc);
create index if not exists nudges_from_idx on public.nudges (from_id, to_id, created_at desc);

alter table public.nudges enable row level security;
drop policy if exists "See nudges you sent or received" on public.nudges;
create policy "See nudges you sent or received" on public.nudges for select to authenticated
  using ((select auth.uid()) in (from_id, to_id));
revoke all on public.nudges from anon;
revoke insert, update, delete on public.nudges from authenticated;

/** Nudges you can still send this friend today (your local day). */
create or replace function public.nudges_left(p_to uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(3 - count(*)::int, 0)
  from public.nudges
  where from_id = auth.uid() and to_id = p_to
    and public.local_day(auth.uid(), created_at) = public.local_day(auth.uid(), now());
$$;

/** Sends a nudge to a friend. Returns how many more you can send them today. */
create or replace function public.send_nudge(p_to uuid, p_message text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  msg text := btrim(regexp_replace(coalesce(p_message, ''), '\s+', ' ', 'g'));
  left_today integer;
begin
  if auth.uid() is null or p_to = auth.uid() or not public.can_see(p_to) then
    raise exception 'not_friends';
  end if;
  if char_length(msg) = 0 or char_length(msg) > 120 then
    raise exception 'bad_message';
  end if;
  -- One sender at a time, so double taps can't slip past the limit.
  perform 1 from public.profiles where id = auth.uid() for update;
  left_today := public.nudges_left(p_to);
  if left_today = 0 then
    raise exception 'limit';
  end if;
  insert into public.nudges (from_id, to_id, message) values (auth.uid(), p_to, msg);
  return left_today - 1;
end;
$$;

/** Nudges you received in the last 2 days, newest first, from people who are still friends. */
create or replace function public.my_nudges()
returns table (id uuid, from_id uuid, display_name text, username text, accent text, message text, seen boolean, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.from_id, p.display_name, p.username, p.accent, n.message, n.seen_at is not null, n.created_at
  from public.nudges n
  join public.profiles p on p.id = n.from_id
  where n.to_id = auth.uid()
    and n.created_at > now() - interval '2 days'
    and public.can_see(n.from_id)
  order by n.created_at desc
  limit 20;
$$;

create or replace function public.mark_nudges_seen()
returns integer
language sql
security definer
set search_path = ''
as $$
  with done as (
    update public.nudges set seen_at = now()
    where to_id = auth.uid() and seen_at is null
    returning 1
  )
  select count(*)::int from done;
$$;

revoke execute on function public.nudges_left(uuid), public.send_nudge(uuid, text), public.my_nudges(), public.mark_nudges_seen() from public, anon;
grant execute on function public.nudges_left(uuid), public.send_nudge(uuid, text), public.my_nudges(), public.mark_nudges_seen() to authenticated;

-- ── Coach recap ───────────────────────────────────────────────────────────
-- Written by /api/ai with the service key, once per user per local day.

create table if not exists public.coach_recaps (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  message text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.coach_recaps enable row level security;
drop policy if exists "Read your own recaps" on public.coach_recaps;
create policy "Read your own recaps" on public.coach_recaps for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.coach_recaps from anon;
revoke insert, update, delete on public.coach_recaps from authenticated;

do $$
begin
  alter publication supabase_realtime add table public.nudges;
exception when others then
  raise notice 'Realtime publication not updated (%). Nudges show when the app refreshes.', sqlerrm;
end;
$$;

-- Old nudges and recaps aren't shown anywhere, so clear them out nightly.
do $$
begin
  perform cron.schedule('rivl-coach-cleanup', '23 4 * * *',
    $c$delete from public.nudges where created_at < now() - interval '30 days';
       delete from public.coach_recaps where day < current_date - 30$c$);
exception when others then
  raise notice 'pg_cron not available (%). Old nudges stay until cleaned up by hand.', sqlerrm;
end;
$$;


-- If you can see this line, you copied the whole file.
select 'catch-up complete';
