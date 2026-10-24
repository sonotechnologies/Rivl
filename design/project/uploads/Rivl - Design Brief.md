# Rivl — Design Brief

Oct 23, 2026 · @Sono Technologies

## Brand

Rivl should feel like a game lobby for getting things done: competitive, energetic, a little cheeky, never childish.

- **Personality:** confident, playful, fair. Rivalry between friends, not hostility
- **Voice:** short, punchy, second person. "You're 40 pts behind Tobi. Fix that." Not "Great job completing your task!"
- **Tagline options:** "Get it done. Beat your friends." / "Productivity, but make it competitive."
- **Logo direction:** lowercase "rivl" wordmark in a heavy geometric sans, with the dot-less "i" replaced by an upward chevron or lightning slash. App icon = that mark on the accent colour
- **Mascot:** none in v1; the coach personalities carry the character

## Theme system

Dark mode is the default, light mode is one toggle away, and users pick their own accent; everything is driven by CSS variables.

**Neutral tokens**

| Token | Dark (default) | Light |
| --- | --- | --- |
| --bg | #0B0B10 | #F6F6F9 |
| --surface | #15151D | #FFFFFF |
| --surface-2 | #1E1E29 | #EDEDF3 |
| --border | #2A2A38 | #DCDCE6 |
| --text | #F4F4F8 | #111118 |
| --text-muted | #9A9AB0 | #5E5E72 |

**Accent options (free)** — each sets --accent and a readable --on-accent text colour

| Name | Hex | Notes |
| --- | --- | --- |
| Volt (default) | #C6FF3D | Electric lime; dark text on top |
| Pulse | #FF3D8B | Hot pink |
| Ice | #3DE1FF | Cyan |
| Blaze | #FF7A1A | Orange |
| Nova | #9B5CFF | Purple |
| Gold | #FFC93D | Warm yellow |

**Fixed semantic colours:** success #2ED47A, danger #FF4D4F, streak flame gradient #FF7A1A → #FFC93D. In light mode, darken accents by about 15% for text use so they pass contrast.

**Pro later:** full themes (e.g. Midnight Gold, Lagos Sunset, Matrix) that change surfaces and accents together.

## Typography, spacing, shape

Two free Google Fonts: a bold display face for numbers and headings, a clean sans for everything else.

- **Display:** Space Grotesk 700 (or Clash Display from Fontshare) for headings, points, ranks, streak counts
- **Body:** Inter 400/500/600
- **Numbers:** tabular figures everywhere scores change, so digits don't jump
- **Scale (px):** 12 caption · 14 body-small · 16 body · 20 title · 28 heading · 40 hero number · 64 rank/points celebration
- **Spacing:** 4 px base grid; 16 px screen gutter; 12 px between cards
- **Radius:** 12 px inputs and chips, 16 px cards, 24 px bottom sheets, full pill for buttons
- **Depth:** no heavy shadows in dark mode; use surface steps and a 1 px border. Accent glow (soft blur of --accent at 30%) only on the #1 rank and active streak

## Core components

Build these once and reuse them on every screen.

| Component | Look and behaviour |
| --- | --- |
| Task row | Large round checkbox left, title, small difficulty pips (1–5) and points value right; swipe right to complete, left for options |
| Checkbox | Fills with accent and bounces on tap; points float up "+20" |
| Points pill | Accent background, bold tabular number, used in rows, feed, and headers |
| Streak badge | Flame icon + count; gradient flame when active, grey when at risk |
| Leaderboard row | Rank number, avatar, name, points; your row highlighted with accent border; top 3 get gold/silver/bronze rings |
| Podium | Top 3 friends as raised blocks on the board screen |
| Challenge card | Two avatars facing off, VS divider, dual progress bars, countdown |
| Feed card | Avatar, "completed" line, task title, points pill, optional photo, reaction bar |
| Coach bubble | Speech bubble with coach icon, tinted per personality |
| Bottom sheet | Quick add, task options, nudge picker |
| Bottom nav | 4 icons + raised centre "+" button in accent |
| Toast | Short top toast for points, badges, nudges |
| Empty state | Simple line illustration + one action button and a coach line |

## Key screens

Mobile-first at 375 px wide; on desktop, centre the app in a 480 px column with the board as a side panel at 1024 px+.

**Today**

- Header: greeting, date, streak badge, today's points
- Coach bubble with the morning message
- "Plan my day" button (accent outline)
- Task list grouped: Overdue · Today · Done (collapsed)
- Mini rank strip at bottom: "#3 this week · 45 pts behind Ada"

**Leaderboard**

- Countdown to Monday reset at top
- Podium for top 3, then ranked list
- Your row pinned to the bottom if you're off-screen
- Active challenges carousel below

**Feed**

- Vertical list of feed cards, newest first
- Nudges received shown as a strip at the top

**Profile**

- Avatar, username, bio, big stats (total pts, best streak, wins)
- Streak calendar heatmap in accent tones
- Badge grid, locked badges greyed out

**Onboarding**

- 5 short steps, one question per screen, progress dots; ends on an invite-a-friend screen with WhatsApp as the primary button

**Weekly recap card (1080 × 1920)**

- Bold rank number, points, streak, top task, "rivl.app" footer in accent, sized for WhatsApp Status and Instagram Stories

## Motion and feedback

Every win should feel rewarding within 300 ms, but keep motion short so the app stays fast.

| Moment | Animation | Haptic |
| --- | --- | --- |
| Complete task | Checkbox pop (spring), "+pts" floats up and fades, row slides to Done | Light tap |
| Hard task (difficulty 4–5) | Small confetti burst in accent colour | Medium |
| Streak +1 | Flame flickers and count ticks up | Light |
| Rank change | Row slides to new position, arrow up/down flash | — |
| Challenge won | Full-screen trophy moment, 1.5 s, tap to dismiss | Success |
| Badge earned | Badge flips in from centre, then toast | Success |
| Nudge received | Avatar shakes once in toast | Light |

- Use Framer Motion; durations 150–300 ms, springs for pops, ease-out for slides
- Respect "reduce motion": swap to simple fades, no confetti
- Optional sound effects, off by default

## Coach personalities

Each coach has its own icon, bubble tint, and voice, so users feel the difference at a glance.

| Coach | Icon | Bubble tint | Sample line |
| --- | --- | --- | --- |
| Hype Man | Megaphone | Accent at 15% | "THREE tasks before noon?! You're cooking. Keep going!" |
| Calm Mentor | Leaf | Soft teal at 12% | "One step at a time. Start with the smallest task and build from there." |
| Savage Roaster | Flame with eyes | Hot pink at 12% | "Zero tasks and it's 6 pm. Even your to-do list is bored." |

- Coach lines are short: 1–3 sentences, max 1 emoji
- Roaster stays playful: roast the procrastination, never the person

## Accessibility and performance

Rivl must feel fast on mid-range Android phones and patchy mobile data.

- Text contrast at least 4.5:1 in both modes and every accent; check each accent against --bg and --surface
- Tap targets at least 44 × 44 px; primary actions within thumb reach at the bottom
- Never use colour alone for meaning: rank arrows and status have icons or labels too
- Font sizes in rem so system text size works
- First load under 200 KB of JS on the Today screen; lazy-load board, feed, and confetti
- Skeleton loaders instead of spinners; optimistic updates on task completion
- Avatars and photos as WebP, compressed before upload
- App works offline for viewing and completing tasks
