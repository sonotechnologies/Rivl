-- Rivl build step 2: tasks and subtasks.
-- Ids are generated on the device so tasks can be created offline and synced later.

create table public.tasks (
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

create index tasks_user_open_idx on public.tasks (user_id, due_on) where completed_at is null;
create index tasks_user_completed_idx on public.tasks (user_id, completed_at) where completed_at is not null;
create index tasks_series_idx on public.tasks (series_id, due_on) where series_id is not null;

create table public.subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 140),
  est_minutes smallint check (est_minutes between 1 and 600),
  done boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index subtasks_task_idx on public.subtasks (task_id, position);

-- Server-owned fields: timestamps, and completion times that can't be in the future
-- or before the task existed.
create function public.tasks_before_write()
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

create trigger tasks_before_write
  before insert or update on public.tasks
  for each row execute function public.tasks_before_write();

-- When a repeating task is completed, schedule its next occurrence (with fresh subtasks).
-- Overdue habits skip ahead, so finishing one late never creates a backlog.
create function public.tasks_schedule_next()
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

create trigger tasks_schedule_next
  after update of completed_at on public.tasks
  for each row execute function public.tasks_schedule_next();

-- Row-level security: tasks are private to their owner.
-- Friends will only ever see shared wins, through feed views (build step 8).
alter table public.tasks enable row level security;
alter table public.subtasks enable row level security;

create policy "Users manage their own tasks"
  on public.tasks for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

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
