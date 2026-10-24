-- Rivl build step 4: points, streaks, badges, plus onboarding and the weekly goal.
-- Every point change is written here, by the database, never by the client.

-- ── Profile additions ─────────────────────────────────────────────────────
alter table public.profiles
  add column streak_last_on date,
  add column streak_best integer not null default 0,
  -- One level of undo, so un-ticking the day's only task takes the streak back.
  add column streak_prev_count integer,
  add column streak_prev_on date,
  add column streak_prev_freezes integer,
  add column weekly_goal integer not null default 500 check (weekly_goal between 50 and 5000),
  add column onboarded_at timestamptz;

grant update (weekly_goal, onboarded_at) on public.profiles to authenticated;

-- ── Point events ──────────────────────────────────────────────────────────
create table public.point_events (
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

create index point_events_user_week_idx on public.point_events (user_id, week_start);
create index point_events_user_day_idx on public.point_events (user_id, day);
create index point_events_task_idx on public.point_events (task_id) where task_id is not null;

alter table public.point_events enable row level security;
create policy "Users read their own points"
  on public.point_events for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.point_events from anon;
revoke insert, update, delete on public.point_events from authenticated;

-- ── Badges ────────────────────────────────────────────────────────────────
create table public.achievements (
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
  ('cent', 'Centurion', 'Finish 100 tasks', 'military_tech', 8);

create table public.user_achievements (
  user_id uuid not null references public.profiles (id) on delete cascade,
  achievement_id text not null references public.achievements (id),
  earned_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;
create policy "Anyone signed in can read badge definitions"
  on public.achievements for select to authenticated using (true);
create policy "Users read their own badges"
  on public.user_achievements for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.achievements, public.user_achievements from anon;
revoke insert, update, delete on public.achievements, public.user_achievements from authenticated;

-- ── Scoring ───────────────────────────────────────────────────────────────

create function public.local_day(p_user uuid, p_at timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select (p_at at time zone coalesce((select timezone from public.profiles where id = p_user), 'UTC'))::date;
$$;

create function public.week_start_of(p_day date)
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
create function public.award_task_points(p_task uuid)
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
create function public.streak_on_complete(p_user uuid, p_day date)
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
create function public.streak_on_undo(p_user uuid, p_day date)
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

create function public.grant_badge(p_user uuid, p_badge text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.user_achievements (user_id, achievement_id) values (p_user, p_badge)
  on conflict do nothing;
$$;

/** Checks the badges a completion can unlock. */
create function public.check_badges(p_user uuid, p_task uuid)
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

create function public.tasks_after_points()
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

create trigger tasks_after_points
  after insert or update of completed_at, difficulty, due_on or delete on public.tasks
  for each row execute function public.tasks_after_points();

revoke execute on function public.award_task_points(uuid), public.streak_on_complete(uuid, date), public.streak_on_undo(uuid, date),
  public.grant_badge(uuid, text), public.check_badges(uuid, uuid) from public, anon, authenticated;

-- ── Stats for the profile screen ──────────────────────────────────────────
/** Lifetime points, tasks done and an 18-week activity calendar for the signed-in user. */
create function public.my_stats()
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
