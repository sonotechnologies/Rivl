# Rivl

Get it done. Beat your friends. A free, AI-powered to-do PWA where friends compete on a weekly leaderboard.

Stack: Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind CSS v4 · Supabase (Postgres, Auth) · Vercel.

## Status

Build step 1 of 12 (**Foundation**) from the build brief:

- [x] Next.js + Tailwind + theme tokens (dark/light, six accents, coach tints), brand components
- [x] `/brand`: the brand and theme system sheet from the Claude Design handoff
- [x] Supabase clients, session-refreshing `proxy.ts`, Google + email magic link sign-in
- [x] `profiles` table with RLS and a sign-up trigger; settings for theme, accent, coach, username, bio
- [x] PWA manifest, icons, install prompt (Android/desktop button, iPhone instructions)
- [ ] Service worker and offline cache (Serwist), which comes with step 2, Tasks

## Getting started

1. Create a Supabase project and run `supabase/migrations/20261024000000_profiles.sql` (SQL editor, or `supabase db push`).
2. In Supabase → Authentication:
   - URL configuration: set the Site URL and add `http://localhost:3000/auth/callback` and your production `https://…/auth/callback` to the redirect URLs.
   - Providers: enable Email. Google is optional for now: enable it in Supabase, then set `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true` to show the button.
3. `cp .env.example .env.local` and fill in the project URL and publishable key.
4. `npm install`, then `npm run dev`.

`/` and `/brand` work without Supabase; sign-in shows a setup note until the env vars are set.

## Theme system

Tokens live in `app/globals.css` as CSS variables, switched by `data-theme` and `data-accent` on `<html>`. An inline script in `app/layout.tsx` applies the saved cookie before first paint. The profile is the source of truth across devices (`components/theme-sync.tsx`).

| Tailwind | Token | Use |
| --- | --- | --- |
| `bg-bg` `bg-surface` `bg-surface-2` | `--bg` `--surface` `--surface-2` | Grounds, by depth |
| `border-line` | `--border` | 1 px borders |
| `text-ink` `text-muted` | `--text` `--text-muted` | Text |
| `bg-accent` + `text-on-accent` | `--accent` `--on-accent` | Filled buttons and pills |
| `text-accent-text` | `--accent-text` | Accent-coloured text (darker in light mode) |
| `shadow-glow` | `--accent-glow` | Only on #1 and an active streak |
| `font-display` `font-sans` `font-mono` | Space Grotesk · Inter · JetBrains Mono | |
| `text-caption` … `text-celebration` | 12 → 64 px, in rem | Type scale |
| `rounded-chip` `rounded-card` `rounded-sheet` | 12 · 16 · 24 px | Radius |

Accent-coloured text in dark mode uses each accent's base hex, except Nova, which uses `#AE7BFF`: base Nova is only 3.9:1 in a coach bubble and 4.2:1 on `surface-2`.

## Layout

```
app/            routes: / · /login · /auth/* · /today · /settings · /brand · manifest
components/     brand/ (Logo, AppIcon, CoachBubble) · ui/ (Button) · install prompt · theme sync
lib/            theme constants, contrast maths, auth data access, Supabase clients
supabase/       SQL migrations
design/         Claude Design handoff bundle (prototypes, chats, design brief)
```
