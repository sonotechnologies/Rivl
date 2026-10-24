-- Rivl build step 3: AI scoring, breakdown and Plan my day.
-- All AI work runs in the /api/ai route with the service key; nothing here is callable by users.

-- Daily AI allowance and the user's day, for Plan my day.
alter table public.profiles
  add column ai_actions_on date,
  add column wake_time time not null default '07:00',
  add column sleep_time time not null default '23:00';

grant update (wake_time, sleep_time) on public.profiles to authenticated;

-- Difficulty is now judged by the AI, not picked by the user, so it can't be farmed.
alter table public.tasks
  add column difficulty_input_hash text,
  add column ai_score_count smallint not null default 0;

revoke insert, update on public.tasks from authenticated;
grant insert (id, user_id, title, notes, due_on, due_time, category, recurrence_rule, is_shared, completed_at),
  update (title, notes, due_on, due_time, category, recurrence_rule, is_shared, completed_at)
  on public.tasks to authenticated;

/**
 * Uses one of the user's daily AI actions. Resets at midnight in their time zone.
 * Returns how many are left after this one, or -1 if the limit was already reached.
 */
create function public.consume_ai_action(p_user uuid, p_limit integer default 10)
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
create function public.ai_actions_left(p_user uuid, p_limit integer default 10)
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
