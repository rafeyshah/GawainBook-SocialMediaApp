# GawainBook: Plan from Today to Launch

**Companion to:** [`docs/research/GawainBook_B2C_Startup_Concept.md`](../research/GawainBook_B2C_Startup_Concept.md)
**Written:** Tuesday, 10 November 2026
**Planning assumption:** one founder working about **20 focused hours per week**, applying for jobs in parallel. At full-time pace, divide the build durations by roughly 1.7. Discovery and retention phases don't shrink with extra hours, because they depend on real weeks of reader behaviour.

> Dates, targets and gates in this plan are proposals. Each one is a decision point, not a forecast. Change them when the evidence says so, and write down why.

---

## 0. The plan on one page

| # | Phase | Dates (2026–27) | Outcome | Gate to move on |
|---|---|---|---|---|
| W1 | **Foundation week** | 10 – 16 Nov | Secure auth, decisions made, first book chosen, interviews started | Auth tests pass; decision log written; 3+ interviews booked |
| 1 | **Core circle journey (MVP-1)** | 17 Nov – 7 Dec | Join a circle → record progress → discuss a chapter safely | Access-control test suite passes; demo journey works end to end |
| 2 | **AI vertical slice** | 8 – 28 Dec | Spoiler-aware assistant for one book, with references | Evaluation v1 published with real counts |
| 3 | **Reliability + portfolio release** | 29 Dec – 17 Jan | Worker, reminders, monitoring, case studies, demo video | Live app holds up; reviewer can understand it in 5 minutes |
| 4 | **Private alpha** | 18 Jan – 28 Feb | 3–5 real circles reading weekly | Circles keep talking without founder prompting |
| 5 | **Public beta (go to market)** | 1 Mar – 11 Apr | Open signup, creator/university pilots | Activation and D28 retention hold for new cohorts |
| 6 | **Organizer assistant + matching** | 12 Apr – 23 May | Bounded tool-using agent; explainable matching | Organizers use drafts; matching beats the genre-only baseline |
| 7 | **Monetization test** | 24 May – 4 Jul | Paid organizer plan tested with real organizers | Explicit, repeated willingness to pay for a specific benefit |

**When to market:**
- **Quiet marketing starts in Week 1:** interviews, a waitlist and build-in-public posts.
- **Invite-only outreach starts in Phase 4.**
- **Open, public marketing waits for the Phase 5 gate.** Don't announce publicly until existing circles return on their own. An empty or one-off community wastes the attention a launch brings.

---

## 1. Where the code is today (audit, 10 Nov 2026)

What exists in this repo now, compared with the concept's MVP:

| Area | Status | Notes |
|---|---|---|
| Sign-up / sign-in UI | ✅ Complete | Combined page, light/dark themes, inline errors, tests |
| **Real authentication** | ❌ **Missing** | The API trusts `userId` from the request body, so anyone can act as anyone. **Fix this first.** |
| Profiles | 🟡 Partial | Bio, city, follow counts. No genres, pace, language or favourite books |
| Follow / unfollow | ✅ Complete | Validated, tested |
| Posts, likes, feed | ✅ Complete | General feed. Note: the concept defers a "complex public feed" |
| Image upload | 🟡 Partial | Safe and validated, but stored on the server disk, which Render wipes on every deploy and restart |
| Shelves (want / reading / read) | ❌ Missing | |
| Books, editions, chapters | ❌ Missing | |
| Reading circles, membership, invitations | ❌ Missing | Core of the product |
| Chapter progress + spoiler-safe threads | ❌ Missing | Core of the product |
| Reporting, blocking, moderation | ❌ Missing | Required before inviting real readers |
| Notifications / reminders | ❌ Missing | |
| AI reading assistant | ❌ Missing | |
| Tests | ✅ Good base | 71 backend tests, 113 frontend tests |
| Deploy | ✅ Works | Render single service + MongoDB Atlas; auto-deploys on every push to `master` |
| TypeScript | ❌ Not started | |
| Observability | 🟡 Minimal | `/api/health` only |

**Bottom line:** about 20% of the MVP exists. The visual design, the deploy pipeline and the testing habit are done. The product's core (circles, progress, spoiler rules) and its security base (auth) are not.

---

## 2. Decisions to make in Week 1

Write each one in `docs/decisions/` (one short file per decision: context, options, choice, reason). Interviewers ask about these, and writing them down is cheap.

| # | Decision | Recommendation | Why | Done |
|---|---|---|---|:---:|
| D1 | **Database** | **Move to PostgreSQL now** (managed, e.g. Neon or Supabase) with `pgvector` | Circles, members, progress and permissions are relational and need constraints. The AI layer needs vector search next to the same permission data. Production data is tiny today, so the move costs almost nothing now and much more later. | ✅ [record](../decisions/0001-database-postgresql.md) |
| D2 | **Auth method** | Session cookie (httpOnly, Secure, SameSite=Lax) with a signed session or a short-lived JWT, plus CSRF protection on state-changing routes | Keeps tokens out of JavaScript and localStorage; easy to explain in an interview. | ✅ [record](../decisions/0002-auth-session-cookies.md) |
| D3 | **TypeScript** | Adopt it incrementally: **all new files in TypeScript**; convert old files only when you touch them | Matches the target role without stopping work for a big rewrite. | ✅ [record](../decisions/0003-typescript-incremental.md) |
| D4 | **Data access** | A typed query builder or ORM (e.g. Drizzle or Prisma) with migrations | Parameterized queries, migrations under version control, typed results. | ✅ [record](../decisions/0004-data-access-drizzle.md) |
| D5 | **First book** | ***Pride and Prejudice*** (Jane Austen, 61 chapters) as book #1. Optional book #2: *The Wonderful Wizard of Oz* (L. Frank Baum) for the fantasy audience | Both authors died more than 70 years ago and both books were first published before 1929, so they should be public domain in Germany and the US. Romance fits the target niche. **Verify the edition and source licence yourself before processing (see §8).** | ✅ [record](../decisions/0005-first-book.md) |
| D6 | **AI provider** | **One provider: Anthropic Claude.** A small, fast model for routine answers; a larger model only if the evaluation shows it's needed | One integration and one cost model. Check current model names and prices in the provider docs when implementing. | ✅ [record](../decisions/0006-ai-provider-claude.md) |
| D7 | **Embeddings** | A dedicated embeddings provider (e.g. Voyage AI) or an open-source embedding model; choose after a small prototype | Claude doesn't generate embeddings. Keep the choice reversible: store the model name with each vector. | ✅ [record](../decisions/0007-embeddings.md) |
| D8 | **Hosting** | Keep Render for the web service; add a Render background worker in Phase 3; managed Postgres; object storage (e.g. Cloudflare R2 or S3) for images | Fewest moving parts. No Kubernetes or multiple clouds. | ✅ [record](../decisions/0008-hosting.md) |
| D9 | **Existing posts feed** | Keep it, but **demote** it: circles become the home screen | Matches the concept's "relationships are the core value" and the deferral of a complex public feed. | ✅ [record](../decisions/0009-demote-posts-feed.md) |
---

## 3. Week 1: Foundation (Tue 10 – Mon 16 Nov)

Goal: make the existing app safe to build on, lock the decisions, and start talking to readers. **No circle features yet.**

### Build track (~14 h)

| Day | Work | Done when |
|---|---|---|
| **Tue 10** | Commit and push the current redesign. Create `docs/decisions/` and write D1–D9. Turn on GitHub Actions to run both test suites on every push. | CI is green on GitHub |
| **Wed 11** | **Auth, part 1:** login issues an httpOnly session cookie; add `requireAuth` middleware; `req.user` comes from the session, never from the body | Middleware tests: no cookie → 401; tampered cookie → 401 |
| **Thu 12** | **Auth, part 2:** move every route to `req.user.id`; remove `userId` from request bodies; add logout and `GET /api/auth/me`; frontend uses `/me` instead of trusting localStorage | Tests prove user A can't edit, like or post as user B |
| **Fri 13** | Rate limiting on login, register and upload. Request validation with a schema library (e.g. zod). Security headers review. | Brute-force test gets 429 responses |
| **Sat 14** | Set up Postgres + migration tool + TypeScript in the backend. Port `users` and `follows` tables; run both databases side by side behind a flag | New tests pass against Postgres |
| **Sun 15** | Port posts and likes to Postgres; write a one-off Mongo → Postgres migration script; move image uploads to object storage | Staging runs fully on Postgres |
| **Mon 16** | Switch production to Postgres. Remove Mongo code. Update README. Retro: what slipped? | Live site works; old data migrated; tests green |

### Product track (~6 h)

- [x] Write the **interview script** (§11.1) and a one-paragraph recruiting post. ✅ [script](../discovery/interview-script.md) · [posts](../discovery/recruiting-post.md)
- [ ] Book **at least 3 interviews** with fantasy, romantasy or romance readers and **at least 1 with a book-club organizer** for next week.
- [ ] 🟡 Built, not yet open: put up a **waitlist page** (a simple form; collect email, favourite genre, and "Do you organize a book club?"). Add the privacy notice and German legal notice (Impressum) before collecting any email (§12).
- [ ] Download the chosen book's source text; record its source URL, licence text and date in `docs/corpus/pride-and-prejudice/SOURCE.md`.

### Week 1 exit checklist

- [x] Nobody can act as another user (proved by tests) ✅ (session cookies + CSRF, [D2](../decisions/0002-auth-session-cookies.md); `tests/security.test.ts`)
- [x] Production runs on Postgres; MongoDB retired ✅ (Neon, verified live 10 Nov)
- [x] Uploads survive a redeploy ✅ (Neon object storage)
- [x] Decisions D1–D9 written ✅ ([decision log](../decisions/README.md))
- [ ] CI runs on every push. Workflow added (`.github/workflows/ci.yml`); tick when the first run on GitHub is green
- [ ] 3+ interviews booked; waitlist live. Script, posts and waitlist page are ready ([discovery](../discovery/README.md)); waiting on bookings and the Impressum details

**If the week slips:** auth is non-negotiable. The database move can spill into Week 2. Don't start circles on MongoDB "temporarily".

---

## 4. Phase 1: Core circle journey, the MVP (17 Nov – 7 Dec, weeks 2–4)

Goal: the first complete, safe social journey. A reader joins a circle, records their chapter, and discusses that chapter without seeing later spoilers through **any** route.

### 4.1 Data model (Postgres)

Create only what this phase needs:

```
books(id, title, author, ol_work_id, cover_url)
editions(id, book_id, label, language, source_url, licence_note)
chapters(id, edition_id, seq, label)            -- seq is the canonical order; prologue = 0
user_books(user_id, edition_id, shelf)          -- shelf: want | reading | finished
reading_progress(user_id, edition_id, chapter_seq, updated_at)
reading_circles(id, name, edition_id, visibility, owner_id, schedule_json, created_at)
circle_members(circle_id, user_id, role)        -- role: owner | moderator | member
invitations(id, circle_id, code, created_by, expires_at, max_uses, uses)
discussion_threads(id, circle_id, chapter_seq, author_id, title, created_at)
comments(id, thread_id, author_id, body, created_at, deleted_at)
blocks(blocker_id, blocked_id)
reports(id, reporter_id, target_type, target_id, reason, status, created_at)
```

### 4.2 One access rule, enforced in one place

Put **one** function, `canReadThread(user, thread)`, in a single policy module. It returns true only if the user is a member of the circle (or the circle is public), the user's progress has reached `thread.chapter_seq`, and the user isn't blocked by the author.

**Every** route that returns thread or comment content must call it, and the list queries must apply the same rule in SQL (`WHERE chapter_seq <= :progress`). That includes thread lists, single threads, comments, search, notifications, and later the AI.

> Why: the concept's example. Alice is on chapter 4 and Bob opens a chapter 9 thread. Alice must not see it through the API, search, notifications or later the AI. A rule in one place is easy to test and easy to explain.

### 4.3 Week-by-week

**Week 2 (17 – 23 Nov): books, shelves, progress**
- Book search: Open Library API proxied through the backend, cached, with only a few verified editions marked "chapters available".
- Seed `Pride and Prejudice` edition + 61 chapters (from your verified source).
- Shelves UI on the profile; "Currently reading" with a chapter picker.
- Profile additions: favourite genres, reading language, pace (chapters per week). Every field optional; nothing blocks sign-up.
- Tests: progress can only move for your own account; chapter numbers outside the edition's range are rejected.

**Week 3 (24 – 30 Nov): circles + invitations**
- Create a circle (name, edition, public or private, weekly schedule).
- Invite links (expiring, use-limited codes); join and leave; owner and moderator roles.
- Circle page: members, current week's chapters, threads list.
- **Circles become the signed-in home screen;** the posts feed moves to a tab.
- Tests: private circles are invisible to non-members in lists, search and direct URLs; expired or used-up codes fail; only owners and moderators can manage members.

**Week 4 (1 – 7 Dec): chapter discussions + safety**
- Threads scoped to a chapter; comments; edit and delete your own.
- Locked-thread placeholder: "Chapter 9 discussion. Reach chapter 9 to read." The server returns no title or body text for it.
- Report a comment; block a reader; moderators hide content; rate limits on posting.
- Basic in-app notifications (a reply to your thread), filtered by the same access rule.
- **Playwright** end-to-end test: sign up → join via invite → set chapter 4 → see the chapter 1–4 threads → chapter 9 thread locked → reply → second user sees the reply.

### 4.4 The test matrix that proves the core promise

| # | Case | Expected |
|---|---|---|
| 1 | Non-member requests a private circle's threads (list, single, comments) | 404 on all three (don't reveal the circle exists) |
| 2 | Member at chapter 4 requests a chapter 9 thread by id | 403 with no title or body |
| 3 | Thread list for a chapter-4 reader | Contains only `chapter_seq <= 4` |
| 4 | Search for a word that appears only in a chapter 9 comment | No result for the chapter-4 reader |
| 5 | Notification about a chapter 9 reply | Not delivered (or delivered with no preview) to the chapter-4 reader |
| 6 | Blocked user's comments | Hidden from the blocker everywhere |
| 7 | Member removed from a circle | Loses access immediately |
| 8 | Progress moves backwards | Previously visible later threads become locked again |
| 9 | Prologue / epilogue chapters | Correct order using `seq` |
| 10 | Moderator vs member actions | Role checks enforced on the server |

### Phase 1 exit gate (target 7 Dec)

- [ ] The full journey works on the live site with two test accounts at different chapters
- [ ] The test matrix in §4.4 passes in CI
- [ ] Reporting and blocking work
- [ ] 8+ interviews done; notes summarised (§11)

---

## 5. Phase 2: AI vertical slice (8 – 28 Dec, weeks 5–7)

Goal: a reading assistant for **one** book that answers from eligible passages only, cites them, and declines when unsure, with a measured evaluation.

> Holiday weeks: plan for ~12 h/week here instead of 20. Week 7 is a buffer.

### 5.1 Corpus preparation (week 5)
- Clean the source text: remove the distributor's header and footer, normalise the text, and split it into chapters that match `chapters.seq`. Check the chapter count by hand against a printed table of contents.
- Split each chapter into passages (~150–300 words, on paragraph boundaries). Store `passage_id, edition_id, chapter_seq, ordinal, text`.
- Embed the passages and store the vectors in `source_passages` (pgvector) with the embedding model name.
- Tests: every passage belongs to exactly one chapter; no passage crosses a chapter boundary.

### 5.2 Answer pipeline (week 6)
Implement exactly the concept's order, so eligibility is applied **before** the model sees anything:

1. Authenticate the reader. Resolve the edition from the circle or book page.
2. Read the reader's `chapter_seq` from the database. Never take it from the request.
3. Retrieve only from `source_passages WHERE edition_id = :e AND chapter_seq <= :progress`, combining vector similarity with keyword search.
4. If the top results fall below a relevance threshold, **decline** or ask a clarifying question.
5. Ask the model to answer only from the supplied passages, citing passage ids, and to say so when they don't contain the answer. Treat passage text as untrusted data inside clearly marked blocks.
6. Check that every cited id was in the supplied set. Unknown ids → regenerate once, then withhold the answer.
7. Stream the answer to the user, with expandable source quotes. Add 👍/👎 feedback buttons.
8. Log: latency, tokens, cost estimate, refusal flag and model/prompt/index versions, **not** the question text by default.

Limits: per-user daily question quota, request timeout, max context size, a monthly spend alert at the provider, and a clear message when the quota is reached.

### 5.3 Evaluation v1 (week 7)
- Write **60–100 reviewed cases** in `eval/cases.v1.jsonl`. Each case has: question, reader chapter, expected supported answer or "should refuse", and acceptable passage ids.
  - About 40% supported questions; 20% later-chapter traps ("Does Elizabeth marry Darcy?" asked at chapter 5); 15% unanswerable questions; 10% prompt-injection attempts; 15% edition and chapter-boundary cases.
- Script `npm run eval` produces a report with these columns: version, dataset size, answer correctness, reference correctness, observed spoiler leaks, appropriate refusals, p50/p95 latency and estimated cost per answer.
- Run a **baseline** (no chapter filter, no threshold) against **v1** (filter + threshold) on the same cases. Review at least 30 answers by hand; don't rely only on an LLM grader.
- Write the results up honestly in `docs/eval/v1.md`, including the failures.

> Remember the concept's warning: the model may already know the plot. Filtering stops retrieval leaks, not model memory. The trap cases measure exactly that. If leaks show up, tighten the prompt, answer more extractively (closer to quoting the passages), or refuse more often, then re-run the evaluation and record what changed.

### Phase 2 exit gate (target 28 Dec)
- [ ] The assistant works live for one edition, in a circle and on the book page
- [ ] `docs/eval/v1.md` published with counts and denominators
- [ ] Spend cap and quota verified by testing

---

## 6. Phase 3: Reliability + portfolio release (29 Dec – 17 Jan, weeks 8–10)

Goal: something you can show employers and give to real readers without worrying.

### Build
- **Background worker** (Render worker): reading reminders, emails and corpus indexing. Start with a Postgres-backed job table; switch to BullMQ/Redis only if needed. Retries with backoff; a **deduplication key** on every reminder, with a test proving a retry doesn't send twice.
- **Emails:** a transactional provider; verify the sending domain; no protected content in previews; per-user preferences and one-click unsubscribe.
- **Observability:** structured JSON logs, error tracking (e.g. Sentry), and a small admin page for failed jobs and AI cost per day.
- **Account deletion and export**, covering posts, comments, uploads, progress and AI logs, with a test that proves it.
- Accessibility pass: keyboard-only journey, labels, contrast in both themes.
- Docker setup for local development; CI runs lint, type-check, unit, integration, Playwright and a small eval smoke test.

### Presentation (the "portfolio release")
- README update: architecture diagram, demo accounts (clearly labelled *sample accounts* at chapters 3, 15 and 61), limitations.
- **90-second video:** a useful answer with a source, then the same question rejected for a chapter-3 reader.
- Two case studies (one page each):
  1. *One authorization rule across every read path* (§4.2)
  2. *An AI failure I found and how the evaluation changed* (§5.3)
- CV bullet points, written **only from shipped work** (concept §20).

### Phase 3 exit gate (target 17 Jan) = **portfolio release**
- [ ] Live, monitored, with a backup and restore tested once
- [ ] Video, case studies and README published
- [ ] Privacy notice, Impressum and AI disclosure live (§12)
- [ ] At least 3 organizers have agreed to run an alpha circle

---

## 7. Phase 4: Private alpha (18 Jan – 28 Feb, 6 weeks)

Goal: find out whether real circles keep talking.

### Recruiting (start in Phase 3)
- **3–5 circles**, each with a **real organizer** who already runs a group (from interviews, the waitlist, university reading societies, or small bookstagram/BookTok creators).
- Each circle: 5–15 members, one book with chapters available, and a weekly schedule.
- Offer a hands-on onboarding call; you set up the circle *with* them.

### Running it
- **Weekly loop:** check metrics on Monday → have a short check-in with each organizer → ship one fix per week.
- Don't seed fake conversations. Prompts written by the organizer are fine; posts written by you as members are not.
- Keep a *rough-edges log*: every confusion and complaint, with a date.

### Measure (instrumented in `analytics_events`)
| Metric | Definition |
|---|---|
| **Activation** (primary) | % of new readers who take part in a **two-way human conversation** within 7 days (AI replies don't count) |
| Weekly human participants | Distinct readers posting or replying, per week |
| Circle health | Circles with discussion activity in at least 3 of the last 4 scheduled weeks |
| D7 / D28 retention | By signup cohort |
| Organizer retention | Organizers still active after 4 weeks |
| AI | 👍 rate, refusals, observed spoiler reports, cost per active reader |

### Phase 4 gate (target 28 Feb) → decide what comes next
Pick the target numbers **before** the alpha starts and write them in the decision log. Suggested shape:
- **Go to public beta** if most alpha circles still meet the "circle health" bar in weeks 4–6 **and** organizers say they'd keep going without you.
- **Iterate for 4 more weeks** if circles are active but need constant prompting from you.
- **Pivot or narrow** if circles stop after 2–3 weeks despite fixes. Revisit the interview notes: is the pain about matching, scheduling or spoilers?

---

## 8. Corpus and rights checklist (before any processing)

- [ ] The author died more than 70 years ago (EU) and the work was first published before 1929 (US)
- [ ] The **specific source file's** terms allow processing and redistribution of excerpts (read the distributor's licence; follow its trademark and header rules when stripping them)
- [ ] Any modern introduction, translation or footnotes are removed or rights-checked separately
- [ ] Cover images and metadata come from sources whose terms allow display (check Open Library and Google Books terms separately)
- [ ] The source URL, licence text and retrieval date are recorded in `SOURCE.md`

> This checklist isn't legal advice. If you ever add copyrighted books, get written permission or a licence first.

---

## 9. Phase 5: Public beta, the market launch (1 Mar – 11 Apr)

Only start this phase if the Phase 4 gate is met.

### Product
- Open signup with onboarding: genres → pick or start a circle → chapter → first thread.
- **Curated circle directory:** list only circles with a real organizer and activity in the past 7 days. Never list empty circles.
- Add 2–4 more verified public-domain books, chosen by alpha demand.
- Shareable milestone cards ("Finished *Pride and Prejudice* with The Netherfield Circle") that never expose private progress or content.

### Go-to-market (in this order)
1. **Organizer-led invites:** each alpha organizer starts a second circle or brings a friend's group.
2. **Creator readalongs:** 2–3 small book creators run one readalong each, with hands-on support from you. Track invite acceptance per creator.
3. **University reading groups:** pilot with 1–2 student societies (start of the spring semester).
4. **Community participation:** share build updates and ask for feedback in reader communities **according to each community's self-promotion rules**. Read the rules first; contribute before posting links.
5. **Launch posts:** after the above are working, post on Product Hunt, Hacker News (Show HN, focused on the technical case study) and LinkedIn (aimed at the job search).

**No paid ads** until there's evidence that people return (concept §18).

### Phase 5 gate (target 11 Apr)
- [ ] New signup cohorts activate and retain at a similar or better rate than the alpha
- [ ] The cost per activated reader is known and acceptable
- [ ] Moderation load is manageable (time per week logged)

---

## 10. Phases 6 and 7: Grow the value, then test revenue

### Phase 6: Organizer assistant + Reading Chemistry (12 Apr – 23 May)
- **Organizer assistant:** a bounded workflow with the five tools from concept §9 (read preferences, read shared availability, draft schedule, draft prompts, save approved sessions).
  - Every draft is stored and must be **approved** before saving.
  - Permissions are rechecked when an approved action runs.
  - Step and cost limits.
  - An idempotency key so a retry never creates duplicate sessions, proved by a test.
- **Reading Chemistry:** a weighted, explainable match score ("You both enjoy fantasy, read in English, ~3 chapters/week"). Compare it with a genre-only baseline using thumbs-up/down feedback on suggestions. Exclude inactive circles.
- Organizer dashboard with aggregate activity: unanswered threads, upcoming sessions, active members.

### Phase 7: Monetization test (24 May – 4 Jul)
- Interview 8–10 active organizers specifically about paid value.
- Test a **Creator Pro** offer (illustrative €14.99/month from the concept). Start with a "founding organizer" pre-order or manual invoice before building billing.
- Keep circles, discussions and spoiler controls **free**.
- Before charging anyone in Germany, set up: a registered business (Gewerbe), VAT handling, terms of service, withdrawal-right (Widerrufsrecht) text and payment-provider compliance (§12).
- Gate: several organizers pay, or explicitly commit to pay, for one specific benefit. If not, keep it free and focus on the portfolio and job-search outcome.

### Deferred (from concept §12)
Native mobile apps, a built-in ebook reader, direct messages, a marketplace, custom model training, multi-agent systems, microservices and Kubernetes. Revisit only with evidence.

---

## 11. Product discovery (runs alongside every phase)

### 11.1 Interview script (30 min, recorded only with consent)
1. Tell me about the last book you discussed with someone. Where did that happen?
2. How do you find people to read with? What's frustrating about it?
3. Tell me about the last time a book was spoiled for you. What happened next?
4. (Organizers) Walk me through how you run a session. What takes the most time?
5. What tools do you use today? What do you wish they did?
6. If a group like this existed, what would make you come back every week?

Don't pitch until the last 5 minutes. Look for **specific past behaviour**, not opinions about the future.

### 11.2 Cadence and targets
| Phase | Interviews | Focus |
|---|---|---|
| W1 – Phase 1 | 15–30 readers, 5+ organizers | Pain points, current tools, spoiler habits |
| Phase 2–3 | 5 organizers | Alpha commitment, schedule needs |
| Phase 4 | Weekly organizer check-ins | Friction, retention drivers |
| Phase 7 | 8–10 active organizers | Willingness to pay |

Keep notes in `docs/discovery/` as one file per interview, plus a running "patterns" summary. Remove personal identifiers.

---

## 12. Legal and trust checklist for Germany and the EU (before collecting any data)

| Item | When | Note |
|---|---|---|
| **Impressum** (legal notice) | Before the waitlist goes live | Required for most public German websites |
| **Privacy notice** (Datenschutzerklärung) | Before the waitlist | List the processors: hosting, database, email, AI provider, analytics |
| Data processing agreements (AVV/DPA) | Before the alpha | Accept each provider's DPA; prefer EU regions where offered |
| Cookie / analytics consent | Before analytics | Prefer cookieless, privacy-friendly analytics to avoid a consent banner where possible |
| **AI disclosure** | With the assistant | Explain what's sent to the AI provider and that answers can be wrong |
| Age requirement | Before the alpha | Sign-up states a minimum age (e.g. 16+) |
| Moderation and reporting policy | Before the alpha | Clear rules, reporting route, response time |
| Data export and deletion | Phase 3 | Covered by tests |
| Business registration, VAT, terms, withdrawal right | Before any payment | Phase 7 |

> This is a checklist, not legal advice. Have a professional review it before the public launch, or at least use a reputable German generator for the Impressum and privacy notice.

---

## 13. Budget guardrails

Prices change, so set **caps**, not estimates:

| Item | Approach |
|---|---|
| Hosting, database, storage, email | Free or hobby tiers through Phase 4; review monthly |
| AI | Hard monthly spend limit at the provider + per-user daily quota in the app; alert at 50% and 80% |
| Domain | One `.com` or `.app` + email forwarding |
| Total | Pick a monthly ceiling now and write it in the decision log. If a phase would exceed it, cut scope before spending more |

Track **cost per activated reader** from Phase 4 onwards.

---

## 14. Job-search track (parallel, time-boxed)

The concept is clear that the project must not replace job applications.

| Phase | Job-search action |
|---|---|
| W1 | Keep applying weekly. Update your LinkedIn headline to *"Full-stack developer building reliable AI-enabled products with React, TypeScript and Node.js"* |
| Phase 1 | Mention "chapter-scoped, server-enforced permissions" in applications and link the repo |
| Phase 2 | Add the evaluation report link to applications for AI-focused roles |
| Phase 3 | **Portfolio release:** pin the repo, add the video to LinkedIn and Xing, and send it to recruiters with a 3-line summary |
| Phase 4+ | Add real user evidence only when it exists ("3 alpha circles, N weekly participants"), using honest numbers |

**Interview preparation (concept §20):** be able to explain, without notes, why Express was kept, how progress maps to editions, why access checks happen before generation, how retries avoid duplicates, and how evaluation cases were reviewed. Be ready to change and debug the access-policy module live.

---

## 15. Risks to watch weekly

| Risk | Early warning sign | Response |
|---|---|---|
| Scope creep delays the core journey | Phase 1 not done by 14 Dec | Cut book search and invitations polish; keep the access rule and tests |
| Empty circles | Fewer than 3 organizers committed by 10 Jan | Delay the alpha; keep recruiting; don't open signup |
| AI leaks later-chapter events | Any trap case leaks | Fix, re-evaluate, document; disable for affected books if needed |
| Corpus prep takes longer than planned | Chapter split not verified by 15 Dec | Use one shorter book; cut book #2 |
| Costs spike | AI alert hits 80% | Lower the quota; use the smaller model; cache answers to repeated questions |
| Burnout or job-search neglect | Fewer than 3 applications in a week | Cut build hours, not applications |
| Holiday slowdown | Phase 2 slips | Week 7 is the buffer; then push all later dates by one week |

---

## 16. Weekly operating rhythm

- **Monday (30 min):** review last week's metrics and checklist; choose this week's 3 outcomes.
- **Daily:** small commits, CI green, and a one-line work log in `docs/log.md`.
- **Friday:** demo to yourself on the live site; write down one thing that broke.
- **Sunday (15 min):** update this plan's checkboxes; move slipped items deliberately and note why.

---

## 17. Definition of "live" per phase

| Milestone | "Live" means |
|---|---|
| Week 1 | Secure auth and Postgres in production |
| MVP-1 (end of Phase 1) | A stranger can join a circle by invite and discuss a chapter without spoilers, and the tests prove it |
| Portfolio release (end of Phase 3) | Reviewers see a working demo, a video, an evaluation and case studies within 5 minutes |
| Alpha (Phase 4) | Real organizers run real circles; you're not the one keeping them alive |
| Public launch (Phase 5) | Anyone can join, the directory only shows active circles, and the launch posts have gone out |
| Business test (Phase 7) | Someone has paid, or committed to pay, for a specific organizer benefit |

---

**Next action today:** commit and push the current redesign, then write decision records D1 and D2. Tomorrow: auth, part 1.
