-- Rivl build step 9: nudges and the coach's daily recap.
-- A nudge is a one-line poke to a friend (a preset or AI-written in the
-- sender's coach style), at most 3 per friend per day. The recap is a 2–3
-- sentence end-of-day message, written once per day by the server.

create table public.nudges (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  message text not null check (char_length(message) between 1 and 120),
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  check (from_id <> to_id)
);

create index nudges_to_idx on public.nudges (to_id, created_at desc);
create index nudges_from_idx on public.nudges (from_id, to_id, created_at desc);

alter table public.nudges enable row level security;
create policy "See nudges you sent or received" on public.nudges for select to authenticated
  using ((select auth.uid()) in (from_id, to_id));
revoke all on public.nudges from anon;
revoke insert, update, delete on public.nudges from authenticated;

/** Nudges you can still send this friend today (your local day). */
create function public.nudges_left(p_to uuid)
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
create function public.send_nudge(p_to uuid, p_message text)
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
create function public.my_nudges()
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

create function public.mark_nudges_seen()
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

create table public.coach_recaps (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  message text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.coach_recaps enable row level security;
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
