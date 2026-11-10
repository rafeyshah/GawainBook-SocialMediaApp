# D8: Hosting on Render, Neon Postgres and Neon object storage

- **Status:** Accepted
- **Date:** 2026-11-10

## Context
Today the app is one Render web service (Express serving the API and the built React app) plus MongoDB Atlas. Uploaded images are written to the server's disk, which Render wipes on every deploy and restart, so photos disappear. Phase 3 needs a background worker for reminders and indexing.

## Options
1. **Keep Render for compute; Neon for Postgres and object storage.** Fewest vendors (database and files in the same Neon project and its branches), one deploy pipeline that already works.
2. **Render + Neon Postgres + Cloudflare R2 or AWS S3 for images.** Proven storage, but one more vendor, account and set of keys.
3. **Move to a cloud provider (AWS/GCP) or Kubernetes.** Much more setup and operating work, for no benefit at this size.

## Decision
- **Compute:** keep the **Render web service**; add a **Render background worker** in Phase 3.
- **Database:** **Neon Postgres** (D1).
- **Images and files:** **Neon object storage** in the same Neon project, replacing the server disk.

## Why
- Uploads survive deploys and restarts.
- Database and storage are provisioned together by `neon deploy`, with env vars pulled automatically, so there are fewer keys to manage.
- No Kubernetes, no multi-cloud: the smallest setup that does the job.

## Consequences
- The upload route writes to object storage and stores only the object key; images are served through the API or a public URL.
- Existing files on the Render disk are migrated once (most are already lost to redeploys).
- Render's free web service still sleeps when idle; acceptable through the alpha.
- Revisit if Neon object storage limits or pricing don't fit, falling back to option 2 (S3-compatible, so the code change is small).
