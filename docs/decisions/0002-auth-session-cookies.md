# D2: Authentication with httpOnly session cookies and CSRF protection

- **Status:** Accepted, implemented 2026-11-10
- **Date:** 2026-11-10

## Context
The API currently trusts a `userId` sent in the request body, so anyone can post, like, follow or edit as anyone else. The frontend keeps the signed-in user in `localStorage`. This is the most urgent problem in the app: no real reader can be invited until it's fixed.

The frontend and API are served from the **same origin** (one Render service), which simplifies cookie handling.

## Options
1. **JWT in `localStorage`, sent as a `Bearer` header.** Simple, but any XSS bug can steal the token, and logout can't revoke it before it expires.
2. **httpOnly session cookie** pointing to a server-side session row (or a short-lived signed token). JavaScript can't read it; the server can revoke sessions; works with same-origin requests out of the box. Needs CSRF protection.
3. **A hosted auth provider** (e.g. Neon Auth, Auth0, Clerk). Less code, but it adds a vendor, and hand-built auth is part of what this project should demonstrate.

## Decision
Login sets an **httpOnly, `Secure`, `SameSite=Lax` cookie** holding an opaque session id stored (hashed) in a Postgres `sessions` table with an expiry. A `requireAuth` middleware loads `req.user` from the session. **No route accepts a user id from the body any more.** State-changing routes also require a CSRF token (double-submit: a readable `csrf` cookie echoed in an `X-CSRF-Token` header).

## Why
- Tokens never touch JavaScript or `localStorage`, so an XSS bug can't steal them.
- Server-side sessions make logout and "sign out everywhere" real.
- `SameSite=Lax` already blocks most cross-site requests; the CSRF header covers the rest.
- Easy to explain in an interview, and easy to test: no cookie → 401; tampered cookie → 401; user A can't act as user B.

## Consequences
- Add `GET /api/auth/me` and `POST /api/auth/logout`. The frontend asks `/me` on load instead of trusting `localStorage`.
- Rate-limit login, register and upload (Friday's task in Week 1).
- Session rows need cleanup of expired entries (a Phase 3 worker job).
- Revisit if a native mobile app is ever built (cookies are awkward there).

## Implementation (2026-11-10)
- `Node-Rest-API/src/auth.ts`: `gb_session` cookie (32 random bytes, httpOnly, `SameSite=Lax`, `Secure` in production, 30 days); only its SHA-256 hash is stored in `sessions`. `requireAuth` loads `req.user` from it.
- CSRF: double-submit `gb_csrf` cookie echoed in `X-CSRF-Token` on every non-GET `/api` request, including login (blocks login CSRF). Rotated on sign-in.
- Every route takes the user from the session; `userId` in a request body is ignored. Changing the password ends all other sessions; deleting the account ends all sessions.
- `POST /api/auth/logout` deletes the session row; `GET /api/auth/me` replaces the frontend's `localStorage` copy of the user.
- Rate limits: 10 sign-in/sign-up attempts per 15 minutes, 30 uploads per hour, 5 waitlist sign-ups per hour, per IP.
- Tests: `tests/security.test.ts` (no cookie → 401 on every protected route; tampered or expired token → 401; user A can't post, like, follow, edit or delete as user B; CSRF cases) plus the frontend `http.test.js` and `AuthContext.test.jsx`.
