-- Rivl build step 6: the weekly leaderboard.
-- The board is a live sum of point_events for the current week, so it "resets"
-- on its own at Monday 00:00 in each person's time zone. A job closes each
-- finished week into weekly_results (for the recap card and Giant Slayer).

-- Friends can see each other's point events: the board shows these totals
-- anyway, and it lets Realtime push friends' points to the board live.
create policy "Friends read each other's points"
  on public.point_events for select to authenticated
  using (exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = (select auth.uid()) and f.addressee_id = point_events.user_id)
        or (f.addressee_id = (select auth.uid()) and f.requester_id = point_events.user_id))
  ));

/** You and your friends for the week (default: your current week), ranked by points. */
create function public.weekly_board(p_week date default null)
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
create table public.weekly_results (
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  points integer not null,
  rank integer not null,
  rivals integer not null, -- How many friends were on the board.
  created_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

alter table public.weekly_results enable row level security;
create policy "Users read their own results" on public.weekly_results for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.weekly_results from anon;
revoke insert, update, delete on public.weekly_results from authenticated;

/**
 * For everyone whose local week has rolled over, records last week's points and
 * rank among their friends. Finishing #1 against at least one friend who scored
 * earns Giant Slayer. Idempotent; run it hourly.
 */
create function public.close_weeks()
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
