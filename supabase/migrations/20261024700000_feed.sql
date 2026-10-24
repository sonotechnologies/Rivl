-- Rivl build step 8: the feed of shared wins.
-- A post appears when a task marked "shared" is finished. Friends see the title,
-- points and an optional photo; notes and steps stay private. Reactions are
-- 🔥 👏 😂 💪. Two "sus" flags remove a post's points until the owner adds photo
-- proof. Photos earn +10, live in a private bucket and are deleted after 7 days.

alter table public.profiles add column share_by_default boolean not null default false;
grant update (share_by_default) on public.profiles to authenticated;

create table public.feed_posts (
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

create index feed_posts_user_idx on public.feed_posts (user_id, created_at desc);
create index feed_posts_recent_idx on public.feed_posts (created_at desc);

create table public.reactions (
  post_id uuid not null references public.feed_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (emoji in ('🔥', '👏', '😂', '💪')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, emoji)
);

create table public.post_flags (
  post_id uuid not null references public.feed_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

/** True when the caller is the user or an accepted friend of theirs. */
create function public.can_see(p_user uuid)
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

create policy "Friends see posts" on public.feed_posts for select to authenticated
  using (public.can_see(user_id));
create policy "Friends see reactions" on public.reactions for select to authenticated
  using (exists (select 1 from public.feed_posts p where p.id = post_id and public.can_see(p.user_id)));
create policy "React to friends' posts" on public.reactions for insert to authenticated
  with check ((select auth.uid()) = user_id and exists (select 1 from public.feed_posts p where p.id = post_id and public.can_see(p.user_id)));
create policy "Remove your own reactions" on public.reactions for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.feed_posts, public.reactions, public.post_flags from anon;
revoke insert, update, delete on public.feed_posts, public.post_flags from authenticated;
revoke update on public.reactions from authenticated;
revoke select on public.post_flags from authenticated;

-- ── Posts follow the task ─────────────────────────────────────────────────

/** Creates or removes the post for a task as completion and sharing change. */
create function public.tasks_sync_post()
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
create function public.my_feed(p_before timestamptz default null)
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
create function public.flag_post(p_post uuid)
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
create function public.attach_proof(p_post uuid, p_path text)
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
create table public.proof_trash (
  path text primary key,
  created_at timestamptz not null default now()
);
alter table public.proof_trash enable row level security;
revoke all on public.proof_trash from anon, authenticated;

create function public.feed_posts_trash_photo()
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

create trigger feed_posts_trash_photo
  after delete on public.feed_posts
  for each row execute function public.feed_posts_trash_photo();
