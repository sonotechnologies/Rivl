-- Rivl build step 7: head-to-head challenges.
--   points: most points between start and end
--   tasks:  first to N tasks (that earned points), or most tasks by the end
-- Progress only counts point events after the challenge starts, so it can't be
-- padded with old work. Winners get +50 and the Rival badge.

create table public.challenges (
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

create index challenges_creator_idx on public.challenges (creator_id, status);
create index challenges_opponent_idx on public.challenges (opponent_id, status);
create index challenges_open_idx on public.challenges (ends_at) where status = 'active';

alter table public.challenges enable row level security;
create policy "Players read their challenges" on public.challenges for select to authenticated
  using ((select auth.uid()) in (creator_id, opponent_id));
revoke all on public.challenges from anon;
revoke insert, update, delete on public.challenges from authenticated;

/** One player's score in a challenge so far. */
create function public.challenge_score(c public.challenges, p_user uuid)
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
create function public.settle_challenge(p_id uuid)
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
create function public.settle_challenges()
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
create function public.challenges_after_points()
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

create trigger challenges_after_points
  after insert on public.point_events
  for each row execute function public.challenges_after_points();

-- ── Player actions ────────────────────────────────────────────────────────

/**
 * Challenges a friend. Ends between 1 hour and 14 days from now; at most 5 open
 * challenges each. Returns the new id, or raises a short reason.
 */
create function public.create_challenge(p_opponent uuid, p_type text, p_target integer, p_ends_at timestamptz)
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
create function public.respond_challenge(p_id uuid, p_accept boolean)
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
create function public.cancel_challenge(p_id uuid)
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
create function public.my_challenges()
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
