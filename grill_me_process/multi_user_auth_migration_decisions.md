# Multi-User Auth Migration — Decision Log

Recorded from /grilling session before implementation.

---

## Q1: Which auth provider?

**Why asked:** Several options exist (Supabase Auth, NextAuth, custom JWT). The choice affects complexity, maintenance burden, and how sessions integrate with the DB.

**How decided:** Supabase Auth is already the database layer. Using it keeps everything in one platform — no extra service, no token bridging. NextAuth or custom JWT would require maintaining a separate user table and writing token validation middleware.

**Decision:** Supabase Auth (email + password).

---

## Q2: Email verification flow — link or OTP?

**Why asked:** Supabase supports both "magic link" (user clicks a URL) and "OTP" (user types a 6-digit code). OTP keeps the user inside the app without needing a URL redirect.

**How decided:** OTP (in-app `verifyOtp`) keeps the signup flow fully contained in the app. No redirect URLs to configure per environment.

**Decision:** 6-digit OTP; Supabase "Confirm email" enabled; app uses `supabase.auth.verifyOtp({ type: 'email' })`.

---

## Q3: How is data isolation enforced?

**Why asked:** Options: (a) check user_id in every API route, (b) RLS in the DB, (c) both. Using only API-layer checks leaves a gap if the DB is accessed directly or if a bug leaks a service-role query.

**How decided:** RLS is the authoritative enforcement layer — it works at the DB level and cannot be bypassed by a buggy API route. API routes also check auth (defense-in-depth), but RLS is the hard boundary. Service-role (Edge Function) bypasses RLS intentionally since it needs to see all users' data for push routing.

**Decision:** RLS on all four tables (`events`, `reminders`, `subscriptions`, `settings`) with `auth.uid() = user_id` policies. API routes use user-scoped `@supabase/ssr` client (anon key + session cookie). Edge Function retains service-role.

---

## Q4: Schema changes — how to handle existing data?

**Why asked:** Adding `user_id NOT NULL` to existing rows is impossible without a value. Options: backfill with a dummy user, make it nullable at first, or truncate.

**How decided:** The app currently has no real users (single-tenant personal use). Truncating and starting fresh is the safest approach — no dirty data, no nullable transitional state.

**Decision:** Migration 005 truncates `events`, `reminders`, `subscriptions` and drops/recreates `settings`. All tables start clean with `user_id NOT NULL`.

---

## Q5: Settings table — singleton vs per-user?

**Why asked:** The current `settings` table has a single row (`id = true`). Keeping it as a per-app singleton conflicts with multi-user goals. Options: add a `user_id` FK, or redesign the PK.

**How decided:** The singleton design was only a stopgap for single-tenant. For multi-user, each user needs independent `user_name`, `butler_name`, and `timezone`. The cleanest change is to make `user_id` the primary key — one row per user, auto-created by a trigger on `auth.users` insert.

**Decision:** `settings.user_id uuid primary key references auth.users(id) on delete cascade`. Trigger `handle_new_user()` inserts a default row on new user registration.

---

## Q6: Old data handling?

**Why asked:** Should we migrate existing reminder data to a "system" user, or discard it?

**How decided:** There is only one current user (personal app). Discarding is simpler and avoids a dummy-user hack. The real user will re-add their data after logging in.

**Decision:** Clean slate. Truncate all tables. No data migration.

---

## Q7: Push subscription lifecycle — what happens on logout/login?

**Why asked:** Push subscriptions are device-specific. On logout, the old subscription should not receive notifications for the now-logged-out user. On login, the user should automatically receive notifications if push was previously enabled.

**How decided:** On logout: SW `pushManager.getSubscription().unsubscribe()` + `DELETE /api/subscribe` removes the endpoint from the DB. On login (page load): if `Notification.permission === 'granted'`, `enableNotifications()` is called automatically to re-register the subscription.

**Decision:** Sign-out clears the push subscription. Page load re-subscribes if permission is already granted.

---

## Q8: Auth UI — separate page or modal?

**Why asked:** A modal requires the main page to be partially visible, which is odd when the user isn't authenticated. A dedicated `/login` page is cleaner.

**How decided:** Dedicated `/login` page. Middleware redirects unauthenticated users there. The login page has tab-based UI: Sign In / Create Account, with sub-views for OTP verification and forgot-password flow.

**Decision:** `/login` page with `view` state machine: `signin | signup | verify | forgot | reset-password`.

---

## Q9: Forgot password — OTP or magic link?

**Why asked:** Supabase's `resetPasswordForEmail` sends a magic link (URL-based) by default. To do in-app OTP for recovery requires additional configuration.

**How decided:** Magic link is simpler to implement and is what Supabase sends by default. The user clicks the link in the email, which redirects to `/login` with a session token in the URL fragment. The app listens for the `PASSWORD_RECOVERY` auth event and shows the "set new password" form.

**Decision:** `resetPasswordForEmail(email, { redirectTo: origin + '/login' })`. App handles `PASSWORD_RECOVERY` event via `onAuthStateChange`.

---

## Q10: BYO API key?

**Why asked:** With multiple users, the shared OpenAI key gets expensive. Options: require each user to provide their own key, or keep sharing.

**How decided:** Deferred to a future milestone. For now, `/api/parse` is protected by login (only registered users can call it), which limits abuse. A to_do.md note documents that BYO key is the next step before broad user acquisition.

**Decision:** Not implemented now. Note added to `to_do.md`.
