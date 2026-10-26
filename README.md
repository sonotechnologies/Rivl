# Rivl

Get it done. Beat your friends. A free, AI-powered to-do PWA where friends compete on a weekly leaderboard.

Stack: Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind CSS v4 · Supabase (Postgres, Auth) · Vercel.

## Status

Build steps 1–7 of 12 from the build brief, plus onboarding (pulled forward from step 12).

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

**4. Points, streaks and badges**
- [x] `point_events` written only by database triggers: 5/10/20/35/50 by AI difficulty, +20% on or before the due date
- [x] Anti-cheat: nothing for tasks under 10 minutes old, max 300 task points a day, un-ticking or deleting removes points
- [x] Daily streaks with +5 × tier streak points, a freeze earned every 7 days (covers one missed day), undo if the day's only tick is removed
- [x] 8 badges from the design (6 unlockable now; Rival and Giant Slayer arrive with challenges and the board), with the flip-in "Badge earned" moment
- [x] Today: live points with the weekly goal, streak badge (glowing, or dashed "at risk"), real points on finished tasks
- [x] Me: total points, best streak, 18-week streak calendar, badge grid

**Onboarding**
- [x] New accounts go through 5 steps from the design: name and username, coach, colour and dark/light, when the day starts, weekly goal; then a WhatsApp invite
- [x] Theme previews live; everything saves in one go; "Replay onboarding" on Me

**5. Friends**
- [x] Invite links (`/invite/[code]`, works signed out, joins after sign-in), WhatsApp, share sheet and an on-demand QR code
- [x] +100 points each when a new account (under 7 days old) joins with your link, once per person
- [x] Username search, friend requests (20 a day), accept/decline/cancel, remove, block (hides you both ways) and report
- [x] Other people's data is only reachable through security-definer functions that return public fields

**6. Leaderboard**
- [x] `weekly_board()`: you and your friends ranked by this week's points (ties share a rank); resets Monday 00:00 local
- [x] Board from the design: reset countdown, podium with gold/silver/bronze rings and #1 glow, ranked list, your row pinned when off screen
- [x] Live: Realtime on friends' point events (30-second polling fallback); rows glide to new places and arrows flash on rank changes
- [x] Today's rank strip ("#3 this week · 45 pts behind Ada"); board beside the app at 1024 px and up
- [x] `close_weeks()` hourly via pg_cron records each finished week and awards Giant Slayer for finishing #1

**7. Challenges**
- [x] Head-to-head: "first to N tasks" (ends the moment someone gets there) or "most points" by an end time (1 hour to 14 days)
- [x] Only points earned after the challenge starts count; +50 and the Rival badge for the winner; ties are a draw
- [x] Settled by trigger (first to N), when either player opens the app, and every 5 minutes via pg_cron
- [x] Board carousel from the design (scores, VS, progress bars, time left, accept/decline/cancel), `/challenge/new`, and the full-screen trophy moment

**8. Feed**
- [x] Finishing a task marked Shared posts it for your friends (title and points only; notes and steps stay private). Quick add has a Shared/Private toggle; "Share wins by default" lives in Settings → Privacy
- [x] 🔥 👏 😂 💪 reactions, toggled optimistically
- [x] Photo proof from the feed or the task screen: compressed to WebP under 1 MB, stored in the private `proofs` bucket, +10 points and a verified tick
- [x] "Looks sus": two flags put a post's points on hold until the owner adds a photo
- [x] `/api/cron/cleanup-proofs` runs daily (vercel.json) and deletes photos older than 7 days; the tick and points stay

**9. Coach and nudges**
- [x] Tap a friend on the board (or "Nudge back" on the feed) to nudge them: four preset lines, or one the AI writes in your coach's voice (1 AI action)
- [x] 3 nudges per friend per day, friends only, max 120 characters (`send_nudge`)
- [x] Nudges you receive: a toast with the sender's avatar shaking, a dot on the Feed tab, and a strip at the top of the feed
- [x] From 6 pm, the coach bubble on Today becomes an AI recap of your day (written once per day, saved in `coach_recaps`); the static lines are the fallback

**10. Notifications**
- [x] Web push for nudges, challenge invites/accepts/results, friend requests/accepts, the Monday result (9 am) and "streak at risk" (8 pm, via pg_cron)
- [x] Max 5 a day, held back during your sleep hours, and each kind can be switched off (Settings → Notifications); a one-time "Turn on" card on Today
- [x] Queued in the database (`push_queue`), sent by `/api/push/flush`: right after the action, when anyone opens the app, and every minute from Supabase (`supabase/push-schedule.sql`)
- [x] Dead devices are removed automatically; on iPhone, push works once Rivl is added to the Home Screen

Not yet: focus timer and weekly recap card.

## Getting started

1. Create a Supabase project and run each file in `supabase/migrations/` in order (SQL editor, or `supabase db push`). If you're not sure which have run, paste `supabase/catch-up.sql` into the SQL editor instead: it applies everything that's missing and is safe to run any number of times. Regenerate it after adding a migration.
2. In Supabase → Authentication:
   - URL configuration: set the Site URL and add `http://localhost:3000/auth/callback` and your production `https://…/auth/callback` to the redirect URLs.
   - Providers: enable Email. Google is optional for now: enable it in Supabase, then set `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true` to show the button.
3. `cp .env.example .env.local` and fill in the project URL and publishable key, plus `SUPABASE_SECRET_KEY` and `GEMINI_API_KEY` (and optionally `GROQ_API_KEY`) for AI, `CRON_SECRET` (any long random string) for the daily photo cleanup and push schedule, and the VAPID keys for push (`npx web-push generate-vapid-keys`). After deploying, fill in and run `supabase/push-schedule.sql` once. In Vercel, add the same as environment variables.
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
