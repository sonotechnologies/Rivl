-- Rivl build step 10: web push.
-- Events queue a notification here (nudges, challenges, friends, the weekly
-- result, and the 8 pm streak reminder). /api/push/flush sends them with the
-- VAPID keys. Quiet hours (sleep → wake) delay a push until morning, each kind
-- can be switched off in Settings, and nobody gets more than 5 a day.

alter table public.profiles add column push_prefs jsonb not null default '{}';
grant update (push_prefs) on public.profiles to authenticated;

create table public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
create policy "See your own devices" on public.push_subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.push_subscriptions from anon;
revoke insert, update, delete on public.push_subscriptions from authenticated;

create table public.push_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('nudge', 'challenge', 'friend', 'streak', 'weekly')),
  title text not null,
  body text not null,
  url text not null default '/today',
  dedupe text, -- One push per user per key (e.g. one streak reminder a day).
  send_after timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '12 hours',
  sent_at timestamptz,
  skipped text, -- 'cap' or 'expired'.
  created_at timestamptz not null default now()
);
create index push_queue_due_idx on public.push_queue (send_after) where sent_at is null and skipped is null;
create index push_queue_sent_idx on public.push_queue (user_id, sent_at) where sent_at is not null;
create unique index push_queue_dedupe_idx on public.push_queue (user_id, dedupe) where dedupe is not null;

alter table public.push_queue enable row level security;
revoke all on public.push_queue from anon, authenticated;

-- ── Devices ───────────────────────────────────────────────────────────────

/** Saves this browser's push subscription for you (taking it over if someone else signed in here before). */
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or p_endpoint !~ '^https://' or length(p_endpoint) > 1000 then
    raise exception 'bad_subscription';
  end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth) values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end;
$$;

create function public.remove_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

revoke execute on function public.save_push_subscription(text, text, text), public.remove_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text), public.remove_push_subscription(text) to authenticated;

-- ── Queueing ──────────────────────────────────────────────────────────────

/**
 * Queues a push if the user has a device and hasn't switched this kind off.
 * During their sleep hours it waits until their wake time.
 */
create function public.queue_push(
  p_user uuid, p_kind text, p_title text, p_body text, p_url text,
  p_dedupe text default null, p_after timestamptz default null, p_expires timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pr public.profiles;
  tz text;
  after timestamptz := coalesce(p_after, now());
  lt timestamp;
  t time;
begin
  select * into pr from public.profiles where id = p_user;
  if pr.id is null
    or not coalesce((pr.push_prefs ->> p_kind)::boolean, true)
    or not exists (select 1 from public.push_subscriptions where user_id = p_user) then
    return;
  end if;

  tz := coalesce(pr.timezone, 'UTC');
  lt := after at time zone tz;
  t := lt::time;
  if pr.sleep_time is not null and pr.wake_time is not null and pr.sleep_time <> pr.wake_time and (
       (pr.sleep_time > pr.wake_time and (t >= pr.sleep_time or t < pr.wake_time))
    or (pr.sleep_time < pr.wake_time and t >= pr.sleep_time and t < pr.wake_time)) then
    lt := (lt::date + case when t >= pr.wake_time then 1 else 0 end) + pr.wake_time;
    after := lt at time zone tz;
  end if;

  insert into public.push_queue (user_id, kind, title, body, url, dedupe, send_after, expires_at)
  values (p_user, p_kind, left(p_title, 80), left(p_body, 180), p_url, p_dedupe, after, coalesce(p_expires, after + interval '12 hours'))
  on conflict (user_id, dedupe) where dedupe is not null do nothing;
end;
$$;

create function public.first_name(p_user uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(split_part(display_name, ' ', 1), username, 'A friend') from public.profiles where id = p_user;
$$;

/** Nudges: straight to the friend. */
create function public.nudges_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.queue_push(new.to_id, 'nudge', public.first_name(new.from_id) || ' nudged you', new.message, '/feed');
  return new;
end;
$$;
create trigger nudges_push after insert on public.nudges
  for each row execute function public.nudges_push();

/** Friend requests, accepted requests, and friends who joined from your invite. */
create function public.friendships_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.queue_push(new.addressee_id, 'friend', public.first_name(new.requester_id) || ' wants to be rivals',
      'Accept and you''ll race each other on the weekly board.', '/friends', 'friend:' || new.id);
  elsif tg_op = 'INSERT' and new.status = 'accepted' then
    perform public.queue_push(new.requester_id, 'friend', public.first_name(new.addressee_id) || ' joined from your invite',
      'You''re rivals now. Time to pull ahead.', '/board', 'friend:' || new.id);
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    perform public.queue_push(new.requester_id, 'friend', public.first_name(new.addressee_id) || ' accepted your request',
      'You''re rivals now. Time to pull ahead.', '/board', 'friend:' || new.id);
  end if;
  return new;
end;
$$;
create trigger friendships_push after insert or update of status on public.friendships
  for each row execute function public.friendships_push();

/** Challenge invites, acceptances and results. */
create function public.challenges_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  what text := case when new.type = 'tasks' then 'first to ' || new.target || ' tasks' else 'most points' end;
  p uuid;
  other uuid;
  mine integer;
  theirs integer;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.queue_push(new.opponent_id, 'challenge', public.first_name(new.creator_id) || ' challenged you',
      'Head to head: ' || what || '. Accept before it expires.', '/board', 'challenge:' || new.id || ':invite');
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'active' then
    perform public.queue_push(new.creator_id, 'challenge', public.first_name(new.opponent_id) || ' accepted your challenge',
      'It''s on: ' || what || '. Go get the first point.', '/board', 'challenge:' || new.id || ':on');
  elsif tg_op = 'UPDATE' and old.status <> 'finished' and new.status = 'finished' then
    foreach p in array array[new.creator_id, new.opponent_id] loop
      other := case when p = new.creator_id then new.opponent_id else new.creator_id end;
      mine := case when p = new.creator_id then new.creator_score else new.opponent_score end;
      theirs := case when p = new.creator_id then new.opponent_score else new.creator_score end;
      perform public.queue_push(p, 'challenge',
        case when new.winner_id is null then 'Draw with ' || public.first_name(other)
             when new.winner_id = p then 'You beat ' || public.first_name(other) || ' 🏆'
             else public.first_name(other) || ' won this one' end,
        coalesce(mine, 0) || '–' || coalesce(theirs, 0) || case when new.winner_id = p then '. +50 pts and bragging rights.' when new.winner_id is null then '. Rematch?' else '. Rematch?' end,
        '/board', 'challenge:' || new.id || ':result');
    end loop;
  end if;
  return new;
end;
$$;
create trigger challenges_push after insert or update of status on public.challenges
  for each row execute function public.challenges_push();

/** Monday: last week's result, sent at 9 am local (close_weeks runs just after midnight). */
create function public.weekly_results_push()
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
    new.points || ' pts last week. New week, fresh board: get on it early.', '/board',
    'weekly:' || new.week_start, greatest(nine, now()));
  return new;
end;
$$;
create trigger weekly_results_push after insert on public.weekly_results
  for each row execute function public.weekly_results_push();

/** Hourly: at 8 pm local, warn anyone whose streak ends at midnight. */
create function public.queue_streak_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
  n integer := 0;
  today date;
begin
  for p in
    select pr.id, pr.streak_count, coalesce(pr.timezone, 'UTC') tz
    from public.profiles pr
    where pr.streak_count > 0
      and extract(hour from now() at time zone coalesce(pr.timezone, 'UTC')) = 20
      and exists (select 1 from public.push_subscriptions s where s.user_id = pr.id)
  loop
    today := (now() at time zone p.tz)::date;
    if (select streak_last_on from public.profiles where id = p.id) = today - 1 then
      perform public.queue_push(p.id, 'streak', 'Your ' || p.streak_count || '-day streak ends at midnight',
        'One task keeps it alive. Even a small one counts.', '/today', 'streak:' || today,
        null, ((today + 1)::timestamp) at time zone p.tz);
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- ── Sending ───────────────────────────────────────────────────────────────

/**
 * For /api/push/flush (service key): claims due pushes, skipping expired ones
 * and anything over 5 a day for that user. Marked sent on claim, so two
 * flushes at once never send the same push twice.
 */
create function public.claim_pushes(p_limit integer default 50)
returns table (id uuid, user_id uuid, kind text, title text, body text, url text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.push_queue;
begin
  for r in
    select * from public.push_queue q
    where q.sent_at is null and q.skipped is null and q.send_after <= now()
    order by q.send_after
    limit p_limit
    for update skip locked
  loop
    if r.expires_at < now() then
      update public.push_queue set skipped = 'expired' where push_queue.id = r.id;
    elsif (select count(*) from public.push_queue s
           where s.user_id = r.user_id and s.sent_at is not null
             and public.local_day(r.user_id, s.sent_at) = public.local_day(r.user_id, now())) >= 5 then
      update public.push_queue set skipped = 'cap' where push_queue.id = r.id;
    else
      update public.push_queue set sent_at = now() where push_queue.id = r.id;
      id := r.id; user_id := r.user_id; kind := r.kind; title := r.title; body := r.body; url := r.url;
      return next;
    end if;
  end loop;
end;
$$;

revoke execute on function public.queue_push(uuid, text, text, text, text, text, timestamptz, timestamptz), public.first_name(uuid),
  public.nudges_push(), public.friendships_push(), public.challenges_push(), public.weekly_results_push(),
  public.queue_streak_reminders(), public.claim_pushes(integer) from public, anon, authenticated;

do $$
begin
  perform cron.schedule('rivl-streak-reminders', '3 * * * *', 'select public.queue_streak_reminders()');
  perform cron.schedule('rivl-push-cleanup', '41 4 * * *', $c$delete from public.push_queue where created_at < now() - interval '14 days'$c$);
exception when others then
  raise notice 'pg_cron not available (%). Streak reminders need it: enable pg_cron under Database → Extensions and run this file again.', sqlerrm;
end;
$$;
