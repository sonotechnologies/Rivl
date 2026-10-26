-- Rivl build step 11: the focus timer and the weekly recap card.
-- Focus: a 25-minute session timed by the server earns +5, at most 8 a day.
-- Recap: my_recap() gathers what the shareable card shows for a week.

create table public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  completed boolean not null default false
);
create index focus_sessions_user_idx on public.focus_sessions (user_id, started_at desc);
-- At most one running session each.
create unique index focus_sessions_open_idx on public.focus_sessions (user_id) where ended_at is null;

alter table public.focus_sessions enable row level security;
create policy "See your own focus sessions" on public.focus_sessions for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.focus_sessions from anon;
revoke insert, update, delete on public.focus_sessions from authenticated;

/** Starts a session (ending any you left running). The server's clock is the one that counts, so it's returned too. */
create function public.start_focus(p_task uuid default null)
returns table (id uuid, started_at timestamptz, server_now timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if p_task is not null and not exists (select 1 from public.tasks t where t.id = p_task and t.user_id = auth.uid()) then
    p_task := null;
  end if;
  update public.focus_sessions f set ended_at = now() where f.user_id = auth.uid() and f.ended_at is null;
  return query
    insert into public.focus_sessions (user_id, task_id) values (auth.uid(), p_task)
    returning focus_sessions.id, focus_sessions.started_at, now();
end;
$$;

/**
 * Finishes a session. 25 minutes or more (with 30 s grace for slow phones)
 * earns +5, up to 8 sessions a day. Returns the points and today's count.
 */
create function public.finish_focus(p_id uuid)
returns table (points integer, sessions_today integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.focus_sessions;
  d date;
  done integer;
begin
  select * into f from public.focus_sessions s where s.id = p_id and s.user_id = auth.uid() for update;
  if f.id is null or f.ended_at is not null then
    raise exception 'not_running';
  end if;
  if now() - f.started_at < interval '24 minutes 30 seconds' then
    raise exception 'too_soon';
  end if;
  update public.focus_sessions s set ended_at = now(), completed = true where s.id = p_id;
  d := public.local_day(auth.uid(), now());
  select count(*)::int into done from public.focus_sessions s
    where s.user_id = auth.uid() and s.completed and public.local_day(auth.uid(), s.ended_at) = d;
  points := case when done <= 8 then 5 else 0 end;
  if points > 0 then
    insert into public.point_events (user_id, task_id, type, amount, day, week_start)
    values (auth.uid(), f.task_id, 'focus', points, d, public.week_start_of(d));
  end if;
  sessions_today := done;
  return next;
end;
$$;

create function public.cancel_focus(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.focus_sessions set ended_at = now() where id = p_id and user_id = auth.uid() and ended_at is null;
$$;

/** Your running session (if any), how many you've finished today, and the server's clock (phones drift). */
create function public.my_focus()
returns table (id uuid, task_id uuid, started_at timestamptz, sessions_today integer, server_now timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.task_id, o.started_at,
         (select count(*)::int from public.focus_sessions s
           where s.user_id = auth.uid() and s.completed
             and public.local_day(auth.uid(), s.ended_at) = public.local_day(auth.uid(), now())),
         now()
  from (select 1) one
  left join public.focus_sessions o on o.user_id = auth.uid() and o.ended_at is null
  where auth.uid() is not null;
$$;

revoke execute on function public.start_focus(uuid), public.finish_focus(uuid), public.cancel_focus(uuid), public.my_focus() from public, anon;
grant execute on function public.start_focus(uuid), public.finish_focus(uuid), public.cancel_focus(uuid), public.my_focus() to authenticated;

-- ── Weekly recap ──────────────────────────────────────────────────────────

/**
 * What the recap card shows. With no week given: last week if it was
 * recorded, otherwise this week so far. The top task is your highest-scoring
 * one that week; top_shared says whether it was a shared task.
 */
create function public.my_recap(p_week date default null)
returns table (
  week_start date, finished boolean, rank integer, people integer, points integer, streak integer,
  top_task text, top_points integer, top_shared boolean, display_name text, username text, accent text, theme text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  this_week date := public.week_start_of(public.local_day(me, now()));
  r public.weekly_results;
  pr public.profiles;
begin
  if me is null then
    return;
  end if;
  week_start := coalesce(p_week, this_week - 7);
  select * into r from public.weekly_results w where w.user_id = me and w.week_start = my_recap.week_start;
  if r.user_id is not null then
    rank := r.rank; points := r.points; people := r.rivals + 1; finished := true;
  else
    if p_week is null then
      week_start := this_week;
    end if;
    select b.rank, b.points into rank, points from public.weekly_board(week_start) b where b.is_me;
    select count(*)::int into people from public.weekly_board(week_start);
    finished := week_start < this_week;
  end if;

  select t.title, sum(e.amount)::int, t.is_shared into top_task, top_points, top_shared
  from public.point_events e
  join public.tasks t on t.id = e.task_id
  where e.user_id = me and e.week_start = my_recap.week_start
  group by t.id, t.title, t.is_shared
  order by sum(e.amount) desc, max(e.created_at)
  limit 1;

  select * into pr from public.profiles where id = me;
  streak := pr.streak_count; display_name := pr.display_name; username := pr.username; accent := pr.accent; theme := pr.theme;
  return next;
end;
$$;

revoke execute on function public.my_recap(date) from public, anon;
grant execute on function public.my_recap(date) to authenticated;

-- Monday's result push now opens the recap card.
create or replace function public.weekly_results_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text := coalesce((select timezone from public.profiles where id = new.user_id), 'UTC');
  nine timestamptz := ((now() at time zone tz)::date + time '09:00') at time zone tz;
begin
  if new.rivals < 1 then
    return new;
  end if;
  perform public.queue_push(new.user_id, 'weekly',
    case when new.rank = 1 then 'You won the week 👑' else 'Last week: #' || new.rank || ' of ' || (new.rivals + 1) end,
    new.points || ' pts last week. Share your recap, then get on the new board.', '/recap',
    'weekly:' || new.week_start, greatest(nine, now()));
  return new;
end;
$$;
