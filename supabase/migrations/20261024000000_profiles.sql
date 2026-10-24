-- Rivl foundation: profiles.
-- One row per auth user, created by trigger on sign-up.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique
    check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text check (char_length(display_name) <= 40),
  avatar_url text,
  bio text check (char_length(bio) <= 120),
  timezone text not null default 'UTC',
  coach_style text not null default 'hype'
    check (coach_style in ('hype', 'calm', 'roast')),
  theme text not null default 'dark'
    check (theme in ('dark', 'light')),
  accent text not null default 'volt'
    check (accent in ('volt', 'pulse', 'ice', 'blaze', 'nova', 'gold')),
  -- Game state below is written only by server-side database functions.
  streak_count integer not null default 0 check (streak_count >= 0),
  streak_freezes integer not null default 0 check (streak_freezes >= 0),
  ai_actions_today integer not null default 0 check (ai_actions_today >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Public profile and preferences for each Rivl user.';

-- Keep updated_at fresh.
create function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Create a profile when someone signs up (Google or magic link).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)), 40),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row-level security: users read and edit only their own row for now.
-- Friends will read each other through views once friendships exist (build step 5).
alter table public.profiles enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Clients may only change these columns; streaks and AI quota are server-owned.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (username, display_name, avatar_url, bio, timezone, coach_style, theme, accent)
  on public.profiles to authenticated;
