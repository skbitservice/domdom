# DOMDOM Code Review Report

**Date:** 2026-10-06
**Status:** Typecheck ✅ | Build ✅ | Tests: Not run

---

## Executive Summary

The codebase is well-structured with a clean monorepo architecture, strong TypeScript usage, and solid security practices (RLS everywhere, SECURITY DEFINER functions for admin actions, file signature validation for stories/reels). However, several bugs and security gaps exist that should be addressed.

---

## 🔴 Critical Issues (Security)

### 1. Missing File Signature Validation in Post Creation
**Files:** `apps/web/src/components/CreatePostModal.tsx`, `packages/api/src/posts.ts`
**Risk:** Malicious files (executables renamed as images) can bypass client-side validation and reach Supabase Storage.
**Fix:** Add `checkMediaSignature` validation to both the modal and API layer (defense in depth).

### 2. SQL Injection in Migration Script
**File:** `scripts/apply-migrations.mjs:97`
```javascript
// VULNERABLE: direct interpolation
`insert into public.domdom_migrations (filename) values ('${file}')`
```
**Risk:** Migration filename containing `'` could break query or inject SQL.
**Fix:** Use parameterized queries or escape the filename.

### 3. Path Traversal in Static Server
**File:** `server.js:10-11`
```javascript
const file = path.join(root, url === '/' ? 'profile.html' : url);
if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
```
**Risk:** On Windows, `startsWith` can be bypassed with symlinks or certain path formats.
**Fix:** Use `path.resolve()` and compare resolved paths.

---

## 🟠 High Priority Bugs

### 4. Memory Leak in Reel Video Probing
**File:** `apps/web/src/components/reels/NewReel.tsx:46-94`
The `probeVideo` function creates a `<video>` element but never cleans it up if:
- Component unmounts during probing
- An error occurs before `loadeddata` fires

### 5. Race Condition in Post Like Count
**File:** `apps/web/src/components/PostCard.tsx:119-121`
```typescript
onLikeChange?.(next, likeCount + (next ? 1 : -1));
```
`likeCount` state may be stale when callback fires due to async state updates.

### 6. Story Feed Limited to 399 Followed Accounts
**File:** `packages/api/src/stories.ts:68`
```typescript
.limit(MAX_FEED_IDS - 1)  // MAX_FEED_IDS = 400
```
Users following 400+ accounts won't see stories from the 400th+ account.

### 7. PostgREST Embedded Filter Syntax Bug
**File:** `packages/api/src/discovery.ts:196`
```typescript
.eq('followers.status', 'accepted')  // May not work on embedded count
```
The `followers` embed is a count aggregate, not a filterable relation.

---

## 🟡 Medium Priority Issues

### 8. Inconsistent Auth User Fetching
**File:** `packages/api/src/reels.ts:108-109`
```typescript
const { data: authData } = await client.auth.getUser();
const myId = authData.user?.id;
```
Should use shared `getCurrentUserId` from `social.ts` for consistency and error handling.

### 9. Username Validation Missing in Profile Update
**File:** `packages/api/src/profiles.ts:49-66`
`updateProfile` accepts username without validating format (lowercase, 3-30 chars, no `..`, etc.)

### 10. "Follows You" Badge Silently Fails
**File:** `packages/api/src/discovery.ts:123-142`
`fetchIncomingIds` catches all errors and returns empty set — no logging, no retry, badge just disappears.

### 11. Story Viewer StepBack at Start Restarts First Story
**File:** `apps/web/src/components/stories/StoryViewer.tsx:114-132`
When at first story of first group, `stepBack` resets progress to 0 instead of closing viewer or staying put.

### 12. Reel Player Doesn't Verify Auth for Report
**File:** `apps/web/src/components/reels/ReelPlayer.tsx:227-245`
Report button rendered for non-owners without checking if user is signed in.

---

## 🟢 Low Priority / Code Quality

### 13. Missing Error Boundaries
No React error boundaries anywhere — a single component crash breaks the entire app.

### 14. Duplicate `currentUserId` Implementations
- `packages/api/src/posts.ts:107-112`
- `packages/api/src/stories.ts:45-50`
- `packages/api/src/reports.ts:66-71`
Should all use `getCurrentUserId` from `social.ts`.

### 15. `server.js` Uses Hardcoded Port and Serves `profile.html` as Index
Not a bug but odd default behavior for a React app.

### 16. `useAdminAccess` Hook Missing `supabase` Dependency
**File:** `apps/web/src/hooks/useAdminAccess.ts:16-32`
Effect doesn't re-run if `supabase` client changes (unlikely but possible).

### 17. Typing Indicator Interval Not Cleared on Unmount in Chat
**File:** `apps/web/src/components/chat/ChatThread.tsx:173-187`
Interval cleanup exists but typing state sent to other clients isn't explicitly cleared on unmount.

---

## Suggested Fixes Priority Order

1. **Fix 1, 2, 3** (Security) — Deploy immediately
2. **Fix 4, 5, 6, 7** (Data integrity / UX bugs)
3. **Fix 8, 9, 10, 11, 12** (Consistency / edge cases)
4. **Fix 13, 14, 15, 16, 17** (Code quality)

---

## Files That Should Be Created/Modified

### New Files Needed:
- `apps/web/src/components/ErrorBoundary.tsx` — React error boundary
- `apps/web/src/hooks/useReelProbe.ts` — Extract probeVideo with cleanup

### Files to Modify (Priority):
1. `apps/web/src/components/CreatePostModal.tsx` — Add file signature check
2. `packages/api/src/posts.ts` — Add file signature check in createPost
3. `scripts/apply-migrations.mjs` — Fix SQL injection
4. `server.js` — Fix path traversal
5. `apps/web/src/components/reels/NewReel.tsx` — Fix probeVideo cleanup
6. `packages/api/src/stories.ts` — Increase/remove follow limit
7. `packages/api/src/discovery.ts` — Fix PostgREST filter
8. `packages/api/src/profiles.ts` — Add username validation
9. `apps/web/src/components/PostCard.tsx` — Fix like count race
10. `apps/web/src/components/stories/StoryViewer.tsx` — Fix stepBack behavior