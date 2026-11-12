# Launch readiness

What a public launch needs, what's done in code, and what only the operator can do.
Reviewed 12 Nov 2026.

## Done in code (tested)

| Area | What's there | Tests |
|---|---|---|
| Password reset | Email link, 1 hour, single use, only the newest link works, signs out everywhere, same answer whether or not the account exists (no account discovery), rate-limited, one email a minute | `tests/account.test.ts`, e2e `account-and-safety` |
| Email confirmation | Sent on sign-up, 48 h link, works signed in or out, resend with cooldown, banner until confirmed | same |
| Password change | Needs the current password; signs out other devices. The old "change password via profile update" hole is closed | `account.test.ts`, `users.test.ts` |
| Sign-up consent | Terms + privacy notice and minimum age 16 (GDPR Art. 8) required; version and time stored | `auth.test.ts`, `Auth.test.jsx` |
| Terms of use | `/terms`, versioned (`TERMS_VERSION`) | `Legal.test.jsx` |
| Privacy notice | Covers accounts, reading progress, emails, minimum age, Resend, Open Library, self-service rights | `Legal.test.jsx` |
| Data export (GDPR Art. 15/20) | Settings → Download my data (JSON, no password hash, no other people's private data) | `account.test.ts`, e2e |
| Account deletion | Settings → needs username + password; circles pass to a moderator or the longest-standing member | `account.test.ts`, e2e |
| Site-wide moderation | Report posts and profiles; `/admin`: review, delete posts, suspend/unsuspend; suspended readers are signed out and hidden | `admin.test.ts`, `Admin.test.jsx`, e2e |
| No Google Fonts | Inter is self-hosted (LG München, 3 O 17493/20) | checked in a real browser: 0 requests |
| Sample photos | Template photos of unknown licence replaced with CC0 avatars (DiceBear Lorelei) | `seed.test.ts` |
| Site basics | Title, description, link previews (`og-image.png`), favicon, app manifest, `robots.txt` | served and checked |

## Only you can do these

1. **Email (Resend).** Create a Resend account, verify a domain you own, then set
   `RESEND_API_KEY` and `MAIL_FROM` (e.g. `GawainBook <hello@yourdomain.com>`) on Render.
   Until then emails only go to the server log, so readers can't reset passwords.
   `GET /api/health` shows `"email": "resend"` once it's live.
2. **Impressum.** Set `LEGAL_NAME`, `LEGAL_ADDRESS`, `LEGAL_EMAIL` on Render.
   The Terms and Privacy pages show them too.
3. **Render plan.** The free plan sleeps after 15 minutes (first visit then takes 30–60 s).
   The Starter plan keeps it awake.
4. **Make yourself admin:** `npm --prefix Node-Rest-API run admin -- --grant=<your username>`.
5. **Refresh demo data** (switches sample readers to the CC0 avatars and marks them confirmed):
   `npm --prefix Node-Rest-API run seed:demo -- --member=<your username>`.
6. **Your own photo.** Your current avatar and cover are template images of unknown licence;
   replace them with your own photos in your profile.
7. **Backups.** Check Neon's restore window for your plan and try one restore on a branch.

## Worth doing soon (not blockers for an invite-only beta)

- Error tracking (e.g. Sentry) and an uptime check.
- Rate limits are kept in the server's memory: fine for one server, reset on each deploy.
- Clean-up of uploaded images that were never used (Phase 3).
- Reading reminders by email (uses the same email setup).
- A screen-reader pass and a dark-mode contrast audit.
