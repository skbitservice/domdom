# DOMDOM

A social platform (Instagram + Facebook style) built to run on a **₹0/month**
free tier, with an architecture that can scale later.

**Latest — Step 9 (Search & Explore):** people search and a post grid at
`/app/explore` — debounced username / name / bio search showing your real
follow states, follower-ranked suggestions that skip people you already
follow, block-aware filtering via the SECURITY DEFINER `is_blocked()`
helper, and an RLS-driven "Recent posts" grid. Earlier steps: project
structure, Supabase client, environment handling, authentication
(register / login / password reset), theming and navigation, posts, stories,
reels, chat, notifications, reports/moderation and the admin dashboard.
Nothing is faked: if Supabase is not configured, the app says so.

## Stack

| Layer       | Technology           | Cost initially |
| ----------- | -------------------- | -------------- |
| Web         | React + Vite + TS    | ₹0             |
| Styling     | Tailwind CSS v4      | ₹0             |
| Database    | Supabase PostgreSQL  | ₹0             |
| Auth        | Supabase Auth        | ₹0             |
| Realtime    | Supabase Realtime    | ₹0             |
| Media (now) | Supabase Storage     | ₹0             |
| Media (later) | Cloudflare R2      | Free tier      |
| Hosting     | Netlify              | ₹0             |

## Project structure

```text
domdom/
├── apps/
│   └── web/            React + Vite + Tailwind web app
├── packages/
│   ├── api/            Shared business logic (takes Supabase client as argument)
│   ├── types/          Shared TypeScript domain types
│   ├── ui/             Shared UI primitives (Button, TextField, Spinner)
│   └── utils/          Validation and formatting helpers
├── supabase/
│   ├── config.toml     Supabase CLI config (local dev)
│   ├── migrations/     SQL migrations (Step 2+)
│   ├── functions/      Edge functions (server-side only code)
│   └── seed/           Development seed data
├── tsconfig.base.json  Strict compiler settings shared by every package
└── package.json        npm workspaces root
```

Why a monorepo: web and (later) other clients must share one definition of
business logic and types, otherwise they drift apart. `@domdom/api` functions
accept the Supabase client as a parameter, so each app creates its client from
its own environment variables and the logic stays identical.

## Getting started

```bash
npm install
npm run dev:web                          # http://localhost:5173
```

`apps/web/.env` already contains this project's public configuration
(`VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`). `.env` is gitignored —
never commit it, and never put a `SUPABASE_SECRET_KEY` / service-role key
anywhere in this repo.

## Database

Schema lives in `supabase/migrations/` — one file per domain, applied in order:

| File | Contents |
| ---- | -------- |
| `00001_profiles.sql` | profiles, admin_users, signup trigger, column-protection trigger |
| `00002_follows.sql` | follows (private-account requests), blocked_users, helpers |
| `00003_posts.sql` | posts, post_media, likes, comments + visibility policies |
| `00004_stories.sql` | stories (24h expiry), story_views |
| `00005_reels.sql` | reels, reel_likes, reel_comments |
| `00006_chat.sql` | conversations, conversation_members, messages |
| `00007_notifications_reports.sql` | notifications, reports + admin workflow |
| `00008_storage.sql` | 5 storage buckets with size/MIME limits + object policies |
| `00009_notifications_cleanup.sql` | DELETE policy: actor can withdraw own notifications |
| `00010_follow_notification_cleanup.sql` | SECURITY DEFINER trigger: removing a follow row withdraws its notification |
| `00011_reel_views.sql` | SECURITY DEFINER `increment_reel_view()`: a viewer counts a view without getting UPDATE rights |
| `00011_reports_guardrails.sql` | No self-reports, one open report per target, finalize trigger stamps resolver + time |
| `00014_reel_like_notifications.sql` | SECURITY DEFINER trigger: unliking a reel withdraws its `reel_like` notification |
| `00013_realtime_notifications.sql` | `notifications` added to the `supabase_realtime` publication (live inbox) |
| `00014_admin_dashboard.sql` | SECURITY DEFINER `admin_set_ban()` / `admin_set_verified()` — the only client path to moderation flags |
| `00012_chat_realtime.sql` | Chat realtime: `messages`/`conversation_members` in the `supabase_realtime` publication, `realtime.messages` policies, the four chat RPCs, block guard + first-message notification triggers |
| `00015_chat_group_membership_fix.sql` | `create_group_chat()` adds the creator to their own group + repairs groups left creator-less |

Apply them to the hosted project with the Management API (no CLI/Docker):

```powershell
$env:SUPABASE_ACCESS_TOKEN = "<personal access token>"   # supabase.com/dashboard/account/tokens
npm run db:push
```

Revoke the token afterwards — it is read from the environment only and never
written to disk.

### Security model (verified 2026-10-06)

- RLS enabled on all 18 application tables; every policy explicit (no
  `USING (true)` on user data — the only open reads are profiles, follow
  relationships and like counts, which are public by design on a social network).
- Anonymous: can read public profiles ✓, sees zero messages ✓, inserts rejected
  with `42501` ✓.
- Authenticated: cannot self-grant `is_verified`/`is_banned` (trigger reverts) ✓,
  cannot edit another user's profile (0 rows) ✓, cannot read another user's
  notifications (empty) ✓.
- Signup trigger auto-creates a username from the email local part and keeps
  it unique; account deletion cascades profile + content.
- `is_admin()` is SECURITY DEFINER and is the only path to admin powers —
  frontend checks are cosmetic by comparison.
- Applied migrations are tracked in `public.domdom_migrations`, so re-running
  `npm run db:push` only executes files that have not been applied yet.

### Follow system (verified 2026-10-06)

Two accounts exercised end-to-end in the browser (`domdom.probe.20261006` →
`domdom.follow.test`):

- Follow a **public** account → row is `accepted` immediately, `follow`
  notification created; unfollow deletes both (row + notification) ✓.
- Follow a **private** account → row becomes `pending` (decided by a DB
  trigger, never by the client), UI shows "Requested", recipient gets a
  `follow_request` notification ✓.
- Requests are managed from a "Follow requests" card on your own profile:
  Accept → status `accepted` and the notification is upgraded to `follow`;
  Decline → row and notification both removed ✓.
- The requester **cannot approve their own request**: the update is rejected
  by a DB trigger (`400 P0001: Only the follow recipient can change the
  request status`) even though the RLS UPDATE policy would allow it ✓.
- Block removes all follow rows in both directions, withdraws their
  notifications, and afterwards the blocked user's follow attempt is refused
  with `42501` (surfaced in the UI as "You can't follow this account") ✓;
  Unblock restores the ability to follow ✓.
- Followers / Following lists open in a modal from the clickable profile
  stats and link to each profile ✓.

**PostgreSQL gotcha found while testing:** a `DELETE` target must pass the
table's **SELECT** policy as well as its DELETE policy. Because
notifications are readable by the recipient only, the actor could never
delete the rows they generated — client-side cleanup silently matched 0
rows (PostgREST still returns `204`). That lifecycle now lives in the
`follows_cleanup_notifications` trigger (`SECURITY DEFINER`, migration
00010), so unfollow / decline / block always clean up regardless of who
removes the follow row.

## Posts, likes & comments (Step 4)

Schema was already in place from migration 00003 (`posts`, `post_media`,
`likes`, `comments` + RLS); Step 4 adds the app layer and UI.

- **Creating a post** — `components/CreatePostModal.tsx` (from Home or your
  profile): pick an image, add a caption (≤ 2200 chars), Share. The upload
  validates type (JPEG/PNG/WebP) and size (**8 MB**, the plan's limit) *before*
  anything is sent, then writes to the public `post-media` bucket under the
  owner's folder (`{uid}/{uuid}.{ext}` — storage RLS requires the first path
  segment to be `auth.uid()`), inserts the `posts` row and its `post_media`
  row. Any later failure rolls back earlier artefacts (orphan object or orphan
  post are cleaned up best-effort).
- **Home feed** — own posts plus posts from accounts you follow
  (`getFeed` → `getFollowing` → `posts.user_id IN (…)`), newest first. RLS
  still filters server-side: private-profile / follower-only / blocked
  visibility never reaches the client to strip.
- **Profile grids** — `PostGrid` on your profile and on public profiles;
  hover shows ♥ / 💬 counts; click opens the post.
- **Post detail** — public route `/post/:id` (RLS decides visibility; hidden
  posts render an honest 404). Like toggle (optimistic, reverted on error),
  comment list + form, and a **Delete** button for the owner that removes the
  post rows (media cascades) and then the storage objects.
- **Counts** come from PostgREST embedded aggregates (`likes(count)`,
  `comments(count)`) plus one query for "which of these did I like" — no
  client-side counting.

Verified end-to-end 2026-10-06 (probe ↔ follow.test, live Supabase):

- Create → row + media row + storage object exist, profile grid and stats
  update, own feed shows the post ✓.
- Cross-account: accepted follower sees a **private** account's post in feed
  and profile ✓; logged-out `GET /posts?id=…` on that post returns `[]` ✓;
  while a **public** account's post *is* visible logged-out ✓.
- Logged-out like insert → `401 / 42501` (RLS) ✓.
- Like + comment from the second account landed in `likes` / `comments` with
  correct counts (2 likes, comment rendered in detail) ✓.
- Delete lifecycle: post row, media row and the storage object are all gone,
  UI redirects to the author's profile ✓.
- Oversize image (9 MB) is rejected in the modal with *"Images must be 8 MB
  or smaller."* — no upload attempted ✓.

Note: `like` / `comment` **notification producers are not wired yet** — the
Step 8 inbox already renders those types, so adding inserts (plus an
unlike-cleanup trigger mirroring `follows_cleanup_notifications`) is a small
follow-up whenever we want them.

## Stories (Step 5)

24-hour media (`stories` + `story_views`, migration 00004), rendered as a
strip above the home feed.

- **Bar**: "Your story" first, then the accounts you follow whose stories are
  still active (newest first). Unwatched groups wear the gradient ring,
  watched ones turn grey. Loading / error / empty states are explicit — no
  fake stories, ever.
- **Viewer**: full screen, one progress segment per story, 5 s per image
  (video length once metadata arrives, clamped 3–60 s), auto-advance, tap
  left/right or ←/→ to move, Esc to close, hold to pause — and a long hold
  deliberately does **not** advance to the next story.
- **View tracking**: opening someone else's story inserts a `story_views` row —
  deduplicated by the `(story_id, viewer_id)` constraint, never recorded for
  your own stories, and best effort (a failed insert can never block
  playback). Only the author can read the whole list (RLS) → the "N views"
  sheet.
- **Owner controls**: delete (row first, then the storage object, best effort)
  and an expiry hint. Expired rows stay visible to their author only —
  `expires_at > now()` is part of the SELECT policy, so bulk cleanup is an
  optimisation, not a correctness requirement.
- **Expiry is server-side**: nothing trusts the client clock; the database
  filter decides what is still watchable.

### Upload validation (security rule 4, live since Step 5)

`story-media` accepts 25 MB of JPEG/PNG/WEBP or MP4/MOV/WEBM, in the caller's
own folder only (storage policy). The client runs three checks before the
bytes leave the device — `validateStoryFile` (MIME allow-list + size), then
`checkMediaSignature` (magic bytes: JPEG `FF D8 FF`, the PNG signature,
`RIFF….WEBP`, `ftyp` / QuickTime atoms, EBML `1A 45 DF A3`) — so a renamed
executable or an HTML file dressed up as a `.jpg` is rejected with a readable
message instead of reaching storage. The bucket repeats type and size limits
server-side, so a tampered client can bypass *our* JavaScript but never the
database.

Every story upload gets a unique `{userId}/{timestamp}-{random}.{ext}` name
(avatars `upsert`, stories must not overwrite each other) and deleting the
story removes the file — stories have to stay off the 1 GB free-tier budget.

### Verified in the browser (2026-10-06)

- A text file renamed to `.jpg` is rejected with *"The file contents do not
  match its type — it may be renamed or corrupted."* before anything is
  uploaded, and Share stays disabled ✓.
- A real PNG uploads → story row + storage object created → the viewer opens
  on the new story automatically ✓.
- Auto-advance runs 1/2 → 2/2 → closes at the end of the group ✓; the
  Previous / Next tap zones move between segments (the same handlers ←/→
  call) ✓; Escape closes the views sheet without closing the viewer ✓.
- Opening the "N views" sheet freezes playback for 7+ s and playback resumes
  when it closes, finishing the group ✓.
- Delete (confirm → "Deleting…") removes the row **and** its storage object,
  while the other story's file is left alone ✓.
- **Still untested** (needs a second signed-in account): the `story_views`
  insert from another viewer, the owner's live view count, the viewed-ring
  dimming, and private / blocked visibility — all RLS-policy behaviour.

## Reels (Step 6)

Short vertical video on the `reels` / `reel_likes` / `reel_comments` tables
(migration 00005), served from the public `reel-media` bucket (50 MB, MP4 /
MOV / WEBM). The page lives at `/app/reels`.

- **Feed**: one reel per screen in a snap-scroll column. An
  `IntersectionObserver` decides which reel is snapped in — only that video
  plays, it loops, and it starts **muted** (browsers block audible autoplay;
  the mute toggle is in the corner). Tapping pauses; the poster frame comes
  from a thumbnail captured at upload time so nothing flashes black.
- **Visibility is 100 % the database**: the query is a plain select and the
  `reels` SELECT policy does the rest — private accounts are shown to
  followers only, blocked pairs never see each other, anonymous visitors get
  the same rules as a signed-in stranger.
- **Composer** (`NewReel.tsx`): pick a file → `validateVideoFile` (MIME
  allow-list + 50 MB) → `checkMediaSignature` (magic bytes, security rule 4)
  → duration read from the video element and rejected above `300 s` (the
  `reels.duration` check) → preview → caption ≤ 500 chars + optional audio
  credit → upload to `{userId}/{uuid}.{ext}` → insert the row. Storage is
  written **before** the row so a reel can never point at a missing file, and
  a failed insert deletes the objects it just created (the 1 GB free tier is
  budget).
- **Engagement**: like / unlike is optimistic and idempotent (the
  `reel_likes` unique constraint makes a double-tap harmless); comment counts
  come from `reel_likes(count)` / `reel_comments(count)` aggregates, so one
  query per page — no N+1.
- **Notifications**: liking somebody else's reel writes a `reel_like`
  notification (best effort, skipped for your own reels — the
  `notifications_no_self` check forbids those), which the inbox already
  renders as "liked your reel." Unliking withdraws it through the
  `reels_cleanup_like_notification` trigger (`00014_reel_like_notifications.sql`)
  because the liker can never delete a row they cannot SELECT — the same
  Postgres gotcha that migration 00010 solved for follows.
- **Comments** open in a dialog: oldest first, author avatar and relative
  time, delete for your own rows (RLS restricts the delete to your own rows
  anyway), and the feed counter moves with every add / remove.
- **Views**: a viewer can never `UPDATE` somebody else's row — the policy
  only allows the author — so counting goes through
  `increment_reel_view()` (migration `00011_reel_views.sql`, `SECURITY
  DEFINER`, reusing the SELECT policy's visibility rules so private reels
  can't be probed through the counter). The call is best effort: once per
  reel per session, and it silently skips if the migration has not been run
  yet.
- **Owner controls**: delete removes the row first, then the storage object
  (best effort), with a confirm dialog before anything happens.
- Loading / error / empty states are explicit — no fake reels, ever.

## Chat (Step 7)

Direct messages and group chats live at `/app/messages` (and
`/app/messages/:conversationId`) — list + thread side by side on desktop, one
pane with a back button on mobile. Schema arrived in Step 3's tables
(`00006_chat.sql`); Step 7 added realtime wiring and the read paths.

- **Inbox assembly is one SQL call.** `list_my_conversations()` returns my
  conversations with the peer (or group name/avatar), the last non-deleted
  message as preview, an unread flag and `last_read_at` — one round trip
  instead of a per-row fetch. `unread_message_count()` feeds the sidebar /
  mobile-tab badges (`useUnreadMessages`), and degrades to the last fetched
  count if realtime is unreachable rather than erroring.
- **Creation is server-side and idempotent.** `start_conversation_with()`
  (SECURITY DEFINER) serialises find-or-create behind an advisory lock so two
  racing clients can't open the same DM twice; `create_group_chat()` re-checks
  every membership rule (real accounts, no self, no blocked pairs, 50 max)
  before writing conversation + members in one statement. Migration `00015`
  repaired the one bug browser verification found here: the creator was never
  inserted into their own group, so the thread they had just opened said
  "This conversation is not available."
- **Live delivery through `postgres_changes`.** `00012` adds `messages` and
  `conversation_members` to the `supabase_realtime` publication and grants
  SELECT/INSERT to role `authenticated` guarded by `realtime.messages`
  policies built on `realtime.topic()` — a channel is only authorised for a
  topic whose conversation you are a member of, so realtime's own RLS check
  can never deliver somebody else's thread. The client subscribes per
  conversation, appends inserts optimistically and dedupes the echo by id.
- **Typing is a broadcast, not a row.** `sendTyping()` broadcasts
  `{conversationId, userId}` on the same private channel — no write, no
  notification spam, and events from your own user id are ignored, so a
  second tab of the same account never shows you "typing…".
- **Read receipts**: opening a thread stamps `conversation_members.last_read_at`
  (bulk upsert), the peer's row arrives as an UPDATE on
  `conversation_members`, and the UI shows "Seen" once their marker is past
  your last message. Unread counts clear on the same event.
- **Delete is a soft delete** (`deleted_at` + content nulled) so the
  `messages_content_or_media` check tolerates empty content for tombstones
  (relaxed in `00012`); both sides render "Message deleted" from the UPDATE
  event, and the inbox preview follows.
- **Safety**: a `messages_block_guard` trigger refuses a send when any member
  pair has a block (UI hiding is not the authority), the first message of a
  new conversation writes a `notifications` row carrying
  `conversation_id`, and every read path goes through RLS membership checks.

### Verified in the browser (2026-10-06)

Two tabs on the same session: message sent in one appeared in the other with
no reload (private channel join + publication + RLS filter), deleting it in
one flipped the other to "Message deleted", "Seen" appeared once the peer's
marker moved, plus inbox search, the unread badge (arrives → clears on open),
DM start against an existing conversation and group creation.

## Notifications (Step 8)

The inbox lives at `/app/notifications`; the schema itself arrived earlier
with migration 00007 (table, indexes, recipient-only RLS).

- **Inbox**: newest first (cap 50), actor avatar + one line per type
  (`follow`, `follow_request`, `like`, `comment`, `mention`, `message`,
  `story_reply`, `reel_like`), relative timestamps, unread rows highlighted,
  All / Unread filter. The empty state is explicit — no fake items, ever.
- **Actions**: tapping a row marks it read and opens its target; per-row
  remove; "Mark all read"; "Clear all" (confirmed). Every action is a plain
  PostgREST write — RLS is the authority (recipient-only UPDATE, and
  recipient-or-actor DELETE per migration 00009), the page never filters by
  user id to "protect" itself.
- **Live badge**: sidebar and mobile tab bar show the unread count from
  `useUnreadNotifications`, kept fresh over a `postgres_changes` channel
  filtered on `recipient_id = eq.<uid>`. Migration 00013 puts
  `notifications` into the `supabase_realtime` publication (idempotent);
  realtime's own RLS check means such a channel can only ever deliver your
  rows. If realtime is unreachable, the badge degrades to the last fetched
  count instead of erroring.
- **Producers today**: the Step 3 follow flows and, since Step 6, reel likes
  write notifications. `like` / `comment` / `message` rows appear on their own
  as Steps 4 and 7 ship — the inbox already renders every type, so nothing
  needs rework then.
- Follow-request rows link to your own profile (where the Accept / Decline
  card lives); deep links to posts arrive with Step 4.

## Search & Explore (Step 9)

`/app/explore` (`pages/app/Explore.tsx`, API in `packages/api/src/discovery.ts`)
— one page, two modes.

- **Idle: suggestions + grid.** "Suggested people" lists accounts the viewer
  does not already follow or follow-request (banned accounts and blocks are
  excluded too), ranked by accepted follower count with newest-first as the
  tie-break, capped at 8. Below it, "Recent posts" renders the shared
  `PostGrid` over `getExplorePosts()` — a plain newest-first query, because
  RLS on `posts` already hides private profiles, follower-only posts and
  blocked users.
- **Typing: people search.** `searchProfiles()` matches username, full name
  and bio (`or=(…ilike…)` over quoted patterns), re-ranks in memory (exact
  username → prefix → substring → name → bio), excludes self and banned
  accounts, and returns my follow status per row so `FollowButton` shows
  Follow / Requested / Following from the database — never a local guess.
  Debounced 250 ms; responses that arrive after newer input are dropped.
- **Both lists share one row** (`PersonRow`): avatar, verified tick,
  name or bio line, a "Follows you" badge and the accepted-follower count,
  with the follow action on the right; following updates the row in place.
- **Blocks are filtered symmetrically** with the SECURITY DEFINER
  `is_blocked(a, b)` helper — one parallel call per displayed row, after the
  shortlist, so accounts blocked in either direction never appear. This is a
  courtesy filter only (profiles are publicly readable by RLS; the database
  refuses every action regardless), so checks fail open and can never hide a
  list the server would have allowed.
- **Input hygiene:** `"` and `\` are stripped before the term enters
  PostgREST's quoted filter grammar, length-capped at 50. LIKE wildcards
  (`%`, `_`) typed by the user are deliberately left alone — they can only
  widen a match, never reach anything RLS does not already expose.

### Verified 2026-10-06

- `npm run typecheck` and `npm run build:web` clean across all workspaces.
- Every query shape probed read-only against the live project first: the
  quoted `or=(…ilike…)` triple, the embedded
  `follows!follows_following_id_fkey(count)` filtered with
  `followers.status=eq.accepted` (bogus status → counts drop to 0, parent
  rows unaffected), the `.neq` / `.not` exclusions, and
  `rpc('is_blocked', { a, b })` with the public key.
- In the browser (fresh test account): idle view listed suggestions ranked
  3 → 2 → 1 followers above the post grid; searching "dom" returned exact
  `domdom` first, private `domdom.follow.test` as **Requested**, the rest as
  **Following**, self excluded; unfollow and follow round-trips flipped the
  row both ways from search and from a suggestion row; after blocking
  `domdom.probe.20261006` it vanished from the same search until the block
  was lifted; and the empty state ("No suggestions right now — everyone
  else here is already followed or blocked.") appeared exactly when the
  data warranted it.

## Reports & moderation (Step 10)

Three pieces, all on the `reports` table from migration 00007:

- **Filing** — every public profile shows a `Report` button next to Block
  (`components/ReportModal.tsx`): pick one of the nine fixed reasons plus an
  optional description (≤ 1000 chars). `fileReport()` inserts the row with
  `reporter_id = auth.uid()` and refuses a second open report for the same
  target; migration 00011 repeats that guarantee as a partial unique index and
  forbids reporting yourself at the database level.
- **Your reports** — `/app/reports`: everything I filed and where it stands.
  RLS narrows it to `reporter_id = auth.uid()` regardless of what the client
  asks for.
- **Moderation queue** — `/app/moderation`: all reports, filterable by status,
  with the workflow actions (`pending` → *Start review* → `under_review` →
  *Resolve* / *Dismiss*, and *Reopen* on closed rows). `resolved_at` /
  `resolved_by` are stamped by the `reports_finalize` trigger, so a closing
  always records who did it and when. Reports are otherwise immutable —
  retargeting or re-reasoning one raises.

Admin rights live in `admin_users` + `is_admin()`, never in the frontend: the
sidebar hides the Moderation link from non-admins for tidiness only, and a
hand-typed URL yields an empty read plus `42501` on every write. Grant access
as the project owner:

```sql
insert into public.admin_users (user_id, role) values ('<profile uuid>', 'admin');
```

Roles: `admin` and `moderator` both pass `is_admin()`; `support` gets nothing
extra. `target_type` already covers `post` / `comment` / `reel` / `story` /
`message` too — those entries render as `Type · 1a2b3c4d` until Steps 4–6
surface their own Report buttons, at which point labels resolve to `@username`
or the content itself.

## Admin dashboard (Step 11)

`/app/admin` — platform overview and account management for moderators, two
tabs in one page.

- **Overview**: live counts — accounts, accounts created in the last 7 days,
  verified / banned, open / resolved / dismissed / total reports, accepted
  follow relationships. Every number is an exact `count: exact` head query
  under RLS: a moderator sees the whole `reports` table, a signed-in stranger
  would only see their own rows.
- **Accounts**: search by username or full name (newest first, cap 30), with
  badges and two actions per row — **Ban / Unban** and **Verify / Unverify**.
  Both buttons are disabled on your own row, and every action asks for
  confirmation first.
- **Gate**: the sidebar shows the Admin link only to moderators and the page
  renders a denial panel otherwise — cosmetic, exactly like `/app/moderation`.
  The authority is `admin_users` + `is_admin()` in the database.
- The report workflow itself stays in Step 10 (`/app/moderation`) — the
  dashboard links there instead of duplicating the queue.

### Why two SECURITY DEFINER functions (migration 00014)

The `profiles` UPDATE policy only lets people edit **their own** row, so a
direct `update profiles … where id = <someone else>` from the dashboard would
match zero rows — while widening that policy to "admins may update any
profile" would hand admins (and, should a policy ever be wrong, everyone)
write access to *every* column: username, bio, avatar, the lot. Instead:

- `admin_set_ban(target uuid, banned boolean)` and
  `admin_set_verified(target uuid, verified boolean)` run with the owner's
  rights but re-check `public.is_admin()` first — a non-admin gets `42501`
  straight from PostgreSQL, whatever the frontend believes.
- They touch exactly one column each: `id` and `created_at` stay immutable,
  `updated_at` still bumps via trigger, and because `auth.uid()` inside a
  SECURITY DEFINER function is still the caller, an admin's flag change sails
  through `protect_profile_columns` while a non-admin's would be reverted.
- Guard rails: you cannot ban your own account, you cannot verify your own
  account, and accounts that hold admin rights are managed only by editing
  `admin_users` by hand — never from the dashboard.

The functions are `create or replace`, so re-running `npm run db:push` after
a rename or tweak is safe.

### Verified 2026-10-06

**Database** (Management API, claims simulated so `auth.uid()` pointed at a
chosen account):

- Non-admin calling either function → `42501: Only admins can change ban
  status` / `…verification` ✓
- Admin banning or verifying their **own** account → refused (P0001) ✓
- Banning an account that holds admin rights → refused, with a pointer back
  to `admin_users` ✓
- Ban → flag flips and `updated_at` bumps; unban / verify / unverify all
  round-trip, persisted on a fresh read ✓
- The old direct path (`update profiles … where id = <someone else>`) still
  touches **0 rows** under RLS — exactly why the functions exist ✓

**Browser** (throwaway account, granted admin then deleted):

- Non-admin opening `/app/admin` → denial panel, and no Admin / Moderation
  links in the sidebar ✓
- Admin → Overview shows live counts matching the database (6 accounts, then
  5 verified / 1 banned mid-test, 3 accepted follows), role chip renders the
  real `admin_users.role` ✓
- Accounts list renders badges; **your own row has both buttons disabled** ✓
- Search `follow` narrows the list to exactly one account ✓
- Ban → confirm dialog → `Banned` chip + button flips to *Unban* + the
  Overview counters refresh; Unverify → Verify → Unban restore the exact
  starting state ✓; browser console clean throughout ✓

## Scripts

| Command             | What it does                              |
| ------------------- | ----------------------------------------- |
| `npm run dev:web`   | Start the web dev server                  |
| `npm run build:web` | Typecheck + production build              |
| `npm run typecheck` | Typecheck every workspace                 |
| `npm run db:push`   | Apply `supabase/migrations/` (needs `SUPABASE_ACCESS_TOKEN`) |

## Auth flow

```text
Register → email verification link → Login → session (persisted) → /app/home
```

- Passwords are handled entirely by Supabase Auth — never stored or hashed here.
- Email confirmation is on by default; in local dev you can disable it in
  Supabase → Authentication → Providers → Email for faster iteration.
- Route protection lives in `ProtectedRoute`, which waits for the real session
  before deciding anything.

## Security rules (applies to every future step)

1. **Only the public/publishable key ever reaches client code.**
   `SUPABASE_SECRET_KEY` / `service_role` belongs exclusively in Supabase Edge
   Functions. It must never appear in `apps/web`, `.env` files committed to
   Git, or any bundle sent to the browser.
2. **RLS everywhere** (Step 2): every application table gets Row Level Security
   with explicit policies. No `USING (true)` on user data.
3. **Admin checks are enforced in the database**, never by frontend JavaScript.
4. **Never trust filenames** — validate MIME type, size and file signature on
   uploads (relevant from Step 5 onward).

## Roadmap (short)

| Step | Scope                          | Status |
| ---- | ------------------------------ | ------ |
| 1    | Structure, Supabase, auth, nav | ✅ done |
| 2    | Database migrations, RLS, profiles | ✅ done |
| 3    | Follow system                  | ✅ done |
| 4    | Posts, likes, comments         | ✅ done |
| 5    | Stories                        | ✅ done |
| 6    | Reels                          | ✅ done |
| 7    | Chat (Realtime)                | ✅ done |
| 8    | Notifications                  | ✅ done |
| 9    | Search & Explore               | ✅ done |
| 10   | Reports & moderation           | ✅ done |
| 11   | Admin dashboard                | ✅ done |
| 12   | Security testing + deployment  | ⬜ |
