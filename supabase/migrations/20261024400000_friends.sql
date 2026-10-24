-- Rivl build step 5: friends, invite links, requests, block and report.
-- Users never read other profiles directly. Everything goes through the
-- functions below, which return only public fields (name, username, colour, streak).

-- ── Tables ────────────────────────────────────────────────────────────────
create table public.invites (
  code text primary key check (code ~ '^[a-z0-9]{8}$'),
  inviter_id uuid not null unique references public.profiles (id) on delete cascade,
  uses integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.invite_redemptions (
  -- Each account can be brought in by one invite, once.
  invitee_id uuid primary key references public.profiles (id) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  code text not null,
  created_at timestamptz not null default now()
);

create table public.friendships (
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
create unique index friendships_pair_idx on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee_idx on public.friendships (addressee_id, status);
create index friendships_requester_idx on public.friendships (requester_id, status);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_user_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default now()
);

create index profiles_username_prefix_idx on public.profiles (username text_pattern_ops);

alter table public.invites enable row level security;
alter table public.invite_redemptions enable row level security;
alter table public.friendships enable row level security;
alter table public.reports enable row level security;

create policy "Users read their own invite" on public.invites for select to authenticated
  using ((select auth.uid()) = inviter_id);
create policy "Users read their own friendships" on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

revoke all on public.invites, public.invite_redemptions, public.friendships, public.reports from anon;
revoke insert, update, delete on public.invites, public.invite_redemptions, public.friendships, public.reports from authenticated;
revoke select on public.invite_redemptions, public.reports from authenticated;

-- ── Helpers ───────────────────────────────────────────────────────────────

/** The friendship row between the caller and another user, if any. */
create function public.friendship_with(p_other uuid)
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
create function public.relation_to(p_other uuid)
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
create function public.my_invite_code()
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
create function public.invite_lookup(p_code text)
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
create function public.redeem_invite(p_code text)
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
create function public.search_profiles(p_query text)
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
create function public.my_friends()
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
create function public.my_friend_requests()
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
create function public.send_friend_request(p_other uuid)
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
create function public.respond_friend_request(p_friendship uuid, p_accept boolean)
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
create function public.remove_friend(p_other uuid)
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
create function public.block_user(p_other uuid)
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
create function public.report_user(p_other uuid, p_reason text)
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
