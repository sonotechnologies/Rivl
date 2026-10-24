# Rivl

Get it done. Beat your friends. A free, AI-powered to-do PWA where friends compete on a weekly leaderboard.

Stack: Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind CSS v4 · Supabase (Postgres, Auth) · Vercel.

## Status

Build steps 1–3 of 12 from the build brief.

**1. Foundation**
- [x] Next.js + Tailwind + theme tokens (dark/light, six accents, coach tints), brand components
- [x] `/brand`: the brand and theme system sheet from the Claude Design handoff
- [x] Supabase clients, session-refreshing `proxy.ts`, email magic link sign-in (Google behind a flag)
- [x] `profiles` table with RLS and a sign-up trigger; settings for theme, accent, coach, username, bio
- [x] PWA manifest, icons, install prompt (Android/desktop button, iPhone instructions)

**2. Tasks**
- [x] `tasks` and `subtasks` tables with RLS, column grants and server-owned timestamps
- [x] Today screen from the design: points card, coach bubble, Overdue · Today · Upcoming · Done
- [x] Quick add sheet (centre +, or `/add`), task options sheet, swipe right to complete and left for options
- [x] Win moment: checkbox pop, floating +pts, confetti on difficulty 4–5, haptics, reduced-motion fallback
- [x] Task detail (`/task/[id]`): title, difficulty, date and time, repeat, category, notes, steps, share toggle, delete
- [x] Repeating tasks and daily habits: the database schedules the next one when you finish (overdue habits skip ahead)
- [x] Offline: tasks live in IndexedDB with an outbox that syncs when you're back; a service worker keeps screens available

**3. AI**
- [x] One server route, `/api/ai`: verifies the user, enforces 10 AI actions a day (reset at local midnight), JSON-only model calls
- [x] Difficulty scoring: automatic, free, cached by a hash of title + steps; users can no longer set difficulty themselves
- [x] Anti-farming: a same-day duplicate scores 1; tasks are rescored at most 5 times
- [x] Task breakdown (quick add toggle or task detail): 3–8 steps with minute estimates
- [x] Plan my day: time blocks between your wake and wind-down times, a tip in your coach's voice, "Use this plan" sets the times
- [x] Gemini Flash first, Groq as fallback, falling through retired model ids; if both fail, difficulty defaults to 2 and actions are refunded
- [x] Guardrails: no medical, legal or financial advice, unsafe tasks refused, emails/phones/links stripped before sending

Not yet: real points with caps and streaks (step 4), board, feed, friends, coach recap and nudges.
Until step 4, the points on Today are the base points of what you've finished; the server will apply bonuses and caps.

## Getting started

1. Create a Supabase project and run each file in `supabase/migrations/` in order (SQL editor, or `supabase db push`).
2. In Supabase → Authentication:
   - URL configuration: set the Site URL and add `http://localhost:3000/auth/callback` and your production `https://…/auth/callback` to the redirect URLs.
   - Providers: enable Email. Google is optional for now: enable it in Supabase, then set `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true` to show the button.
3. `cp .env.example .env.local` and fill in the project URL and publishable key, plus `SUPABASE_SECRET_KEY` and `GEMINI_API_KEY` (and optionally `GROQ_API_KEY`) for AI. In Vercel, add the same as environment variables.
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
app/            routes: / · /login · /auth/* · (app)/ today, add, task/[id], board, feed, me · /settings · /brand
components/     brand/ (Logo, AppIcon, CoachBubble) · ui/ (Button) · install prompt · theme sync
lib/            theme, dates, auth data access, Supabase clients, tasks/ (offline store, types, points), ai/ (providers, prompts, redaction)
public/sw.js    service worker (app shell and visited screens; task data syncs via lib/tasks/store.ts)
supabase/       SQL migrations
design/         Claude Design handoff bundle (prototypes, chats, design brief)
```
