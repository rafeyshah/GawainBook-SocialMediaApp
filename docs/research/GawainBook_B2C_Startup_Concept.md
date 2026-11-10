# GawainBook — Read Together. Belong Somewhere.

**Product:** Social reading platform with spoiler-aware AI assistance  
**Document:** Revised startup concept and implementation roadmap  
**Updated:** 10 November 2026  
**Current implementation:** React.js frontend and Express.js backend, as reported by the founder  
**Status:** Product hypothesis and proposed feature plan; implementation details below are not claims of completed work.

## 1. Executive summary

GawainBook helps readers build friendships and lasting communities through books. Its central experience is a small reading circle where people share progress, discuss chapters safely, and return for meaningful conversations.

The initial audience is English-speaking fantasy, romantasy, and romance readers. The product combines reader profiles, personal shelves, reading circles, chapter-based discussions, and explainable circle recommendations.

A focused AI extension adds a reading assistant that answers questions using permitted source material, provides references, and attempts to respect the reader's chapter progress. A later organizer assistant helps plan reading sessions through controlled tool use.

The project has two objectives:

1. **Product objective:** Validate whether compatible circles produce recurring conversations and reader retention.
2. **Engineering objective:** Demonstrate credible full-stack and applied AI skills through a deployed application, meaningful tests, evaluation results, and documented technical decisions.

Commercial success and recruiting value are separate outcomes. A project may demonstrate strong engineering before finding product-market fit. Neither adding AI nor shipping the project guarantees interviews, employment, or investment.

## 2. Problem and opportunity

Readers often use separate services for discovery, tracking, discussion, and community. GawainBook's hypothesis is that a focused small-group experience can make it easier to form ongoing reading relationships.

| Reader need | GawainBook response |
|---|---|
| Find people with compatible tastes | Explainable reader and circle matching |
| Discuss a book without unwanted spoilers | Chapter-scoped discussions and progress-based access |
| Understand a confusing passage | Source-grounded reading assistance |
| Keep a group active | Reading schedules, prompts, reminders, and organizer tools |
| Share reading identity | Profiles, shelves, and milestone cards |

This is not an empty market. Established reading platforms already provide tracking, social discovery, clubs, buddy reads, and spoiler-related features. The opportunity must be demonstrated through better group experiences rather than assumed from a feature list.

## 3. Initial audience

### Primary niche

English-speaking fantasy, romantasy, and romance readers who already participate in book communities. Ages 18–34 are an initial audience hypothesis, not an eligibility restriction or validated market finding.

### Early adopters

- Organizers of small book clubs.
- University reading groups.
- Book creators running readalongs.
- Readers seeking consistent discussion partners.

### Initial geography and language

Launch the product in English with a small set of communities. Germany is relevant for founder access, local validation, and employment positioning; it does not automatically need to be the exclusive consumer market.

Add German localization when actual users need it. A translated interface does not establish demand by itself.

## 4. Positioning and differentiation

**Product pitch:** GawainBook helps you find your reading circle and discuss books at your own pace, with spoiler-conscious conversations and source-grounded reading support.

| Competitor | Established strength | Candidate opening to validate |
|---|---|---|
| Goodreads | Catalog, reviews, existing network | More focused small-group relationships |
| The StoryGraph | Tracking, statistics, buddy reads, readalongs | Compatibility and sustained circle participation |
| Fable | Social reading and book clubs | Specific underserved group workflows |
| Hardcover | Book tracking and discovery | Reader relationships and organizer support |
| Discord / Reddit | Active communities and conversation | Structured progress-aware discussion |
| TikTok / Instagram | Discovery and creator reach | Persistent reading groups after discovery |

The original concept identifies these competitors; this revision does not claim a fresh exhaustive competitor audit. Recheck current capabilities before making marketing comparisons.

**Potential advantage:** The combination of group compatibility, useful organizer workflows, and trustworthy progress-aware interactions. These remain hypotheses until users show a preference and return.

## 5. Product principles

1. Relationships are the core value.
2. Backend rules enforce access; hiding content in the interface is insufficient.
3. AI must be useful, observable, and evaluated.
4. Source references should help readers verify answers.
5. Publishing actions remain under user control.
6. Start with understandable matching rules and a small architecture.
7. Measure actual behavior and report failures honestly.
8. Keep ordinary discussion and spoiler controls available without payment.

## 6. Core social features

### 6.1 Reader profiles and shelves

Profiles include favorite books, genres, reading language, pace, discussion preferences, and currently reading titles. Shelves cover want-to-read, reading, and finished states.

Collect only information needed for the experience. Avoid asking users to complete a lengthy profile before they receive value.

### 6.2 Reading circles

Small public or private groups, initially around 5–20 participants, with an owner, moderators, and members. Circles include a selected book, schedule, membership rules, discussion threads, and invitations.

A private circle should provide value even when the wider network is small.

### 6.3 Progress-aware discussions

Readers record chapter progress. Threads have a chapter scope. The server decides whether each reader can retrieve a thread or comment.

Example: Alice has completed chapter 4. Bob creates a chapter 9 discussion. Alice must not receive its protected contents through API responses, search, notifications, realtime events, or AI retrieval.

Do not assume chapter numbers map across editions. Bind progress and passages to an edition and a canonical chapter sequence; handle prologues and appendices explicitly. Start with a small verified catalog.

User-assigned chapter labels can be wrong. Reporting and moderation are still necessary: authorization cannot prove that a chapter 4 comment contains no later spoilers.

### 6.4 Safety and moderation

Provide reporting, blocking, moderator review, membership controls, and rate limits. Automated moderation may assist triage later, with humans able to review decisions.

### 6.5 Invitations and shareable moments

Allow circle invitations and shareable milestone cards. Do not expose private reading progress or private-circle content in public previews.

## 7. Priority AI feature: spoiler-aware reading assistant

### User experience

A reader asks: “Why does this character distrust the king? I have finished chapter 4.”

The assistant searches eligible material, answers with references, and declines or limits the answer when evidence is insufficient.

### Initial scope

- One or a few permitted books with verified chapter boundaries.
- Questions about passages, characters, and events within completed chapters.
- Short answers with chapter or passage references.
- Clear handling of unsupported questions.
- Streaming responses and feedback controls.

Use public-domain works or material the project has permission to process. Verify the relevant rights for the edition and intended use; do not assume every edition of an old work is unrestricted. Check metadata and cover-image terms separately.

### Retrieval and answer workflow

1. Authenticate the reader and resolve the selected book edition.
2. Read the reader's allowed progress from trusted server state.
3. Select only eligible, authorized source passages.
4. Retrieve relevant passages within that eligible collection.
5. Generate an answer grounded in the retrieved evidence.
6. Validate reference identifiers and return permitted source excerpts.
7. Record operational metrics without unnecessarily logging personal content.

Do not retrieve unrestricted passages and filter only after generation. Apply eligibility before passages are sent to the model.

### Important limitation

A model may already know later plot events. Retrieval filtering therefore does not guarantee spoiler-free output. Treat “spoiler-aware” as a tested behavior, not an absolute promise. Evaluate adversarial questions and consider conservative refusal or more extractive answers when the system is uncertain.

### Content boundaries

Start with the book corpus. Add circle discussions only after private membership, blocking, deletion, and indexing behavior are tested. Clearly distinguish original book evidence from reader interpretations.

### Failure handling

- No supporting passage: decline or ask a focused clarification.
- Provider timeout: preserve the question and offer retry.
- Invalid reference: withhold or regenerate the unsupported response.
- Budget limit reached: show a clear temporary limit.
- Unavailable indexing: keep ordinary social features usable.

## 8. AI evaluation and evidence

Maintain a versioned dataset, initially around 60–100 reviewed cases. This is a proposed starting scope, not a quality certification.

| Category | What to check |
|---|---|
| Supported questions | Accuracy against permitted source material |
| References | Whether each reference supports the associated claim |
| Later-chapter requests | Spoiler leakage and appropriate refusal |
| Unanswerable questions | Whether the system avoids inventing answers |
| Prompt injection | Whether untrusted passages alter access or tool behavior |
| Private discussions, if enabled | Cross-circle and blocked-content leakage |
| Edition boundaries | Correct mapping of progress to eligible passages |
| Operations | Latency, failure rate, token usage, and cost |

Compare a simple baseline with improvements such as chapter filtering and alternative retrieval strategies. Use the same cases and record corpus, model, prompt, and retrieval versions.

Report counts and denominators, not unsupported percentages. A result of zero leaks in a small benchmark means zero observed leaks in those cases; it does not establish universal safety. Review a sample manually and do not rely exclusively on an LLM judge.

Suggested report columns: version, dataset size, answer correctness, reference correctness, observed spoiler leaks, appropriate refusals, p50/p95 latency, and estimated cost per answer.

## 9. Later feature: organizer assistant with tools

### Example request

“Plan a four-week readalong, suggest meeting times, and draft discussion prompts.”

### Controlled tools

| Tool | Purpose | Restriction |
|---|---|---|
| Read circle preferences | Gather planning context | Authorized circle only |
| Read shared availability | Suggest meeting times | Only explicitly shared availability |
| Draft reading schedule | Produce a structured proposal | No immediate publication |
| Draft prompts | Suggest chapter-scoped discussion | Eligible source content only |
| Save approved sessions | Create final events | Organizer approval and server permission check |

Implement a bounded workflow with a small number of tools. A general autonomous multi-agent system is unnecessary for the initial use case.

Validate tool arguments on the server. Store draft state, impose step and cost limits, and record tool outcomes. Approval should apply to the exact proposed action; recheck authorization when it executes.

Test retries: a timeout followed by a retry must not create duplicate sessions. Keep the ordinary manual planning interface available.

External calendar integrations and automatic invitations are later scope.

## 10. Reading Chemistry: explainable matching

Start with a weighted score based on shared genres and books, language, timezone compatibility, reading pace, availability, and discussion preferences.

Explain matches: “You both enjoy fantasy, prefer English discussions, and read about three chapters per week.”

Handle new readers with stated preferences and curated active circles. Avoid recommending empty or inactive circles merely because their genre score is high.

Compare the weighted model with a genre-only baseline through explicit relevance feedback. Add semantic representations or learned ranking only when enough evidence shows a benefit. Do not claim improved retention without a suitable measurement design.

## 11. Reliability and organizer analytics

### Background work

Use asynchronous workers for reminder delivery, source indexing, and other work that should not block requests. Add retries, backoff, deduplication, and a way to inspect failed jobs.

### Notifications

Support user preferences and timezone-aware reminders. Prevent duplicate delivery when a job retries. Avoid exposing protected content in emails or notification previews.

### Organizer dashboard

Show active participants, unanswered threads, scheduled sessions, and recurring discussion activity. Use aggregate information where possible and avoid unnecessary member surveillance.

## 12. MVP scope and explicit deferrals

### First release

- Authentication, profiles, and personal shelves.
- Book search with a small verified corpus for AI.
- Circles, membership, and invitations.
- Chapter progress and backend-enforced discussions.
- Reporting, blocking, and basic notifications.
- A deployed reading assistant with references and an evaluation report.
- Meaningful tests and basic operational visibility.

### After the first release

- Explainable matching improvements.
- Organizer agent and richer analytics.
- German localization based on user demand.
- Shareable milestone cards.

### Defer

- Native mobile applications and integrated ebook reader.
- Complex public feed and direct messaging.
- Marketplace, payments, and elaborate subscription infrastructure.
- Custom model training without evidence of need.
- Multiple agents, Kubernetes, or many microservices without operational justification.

## 13. Technical architecture

Preserve the current React.js and Express.js implementation. Introduce TypeScript incrementally if the application currently uses JavaScript. A framework migration is not a prerequisite for a credible release.

| Layer | Proposed choice | Purpose |
|---|---|---|
| Frontend | React + TypeScript | Accessible application and streaming AI interface |
| Backend | Express + TypeScript | API, authorization, validation, and workflow control |
| Database | PostgreSQL | Relational application data and constraints |
| Vector retrieval | pgvector, if selected after a small prototype | Passage similarity search |
| Worker | Node worker; BullMQ/Redis when queue needs justify it | Reminders and indexing |
| Storage | Object storage | Avatars and permitted assets |
| AI | One provider initially | Reduce integration complexity |
| Delivery | Docker + CI | Repeatable checks and deployment |
| Observability | Structured logs, error reporting, basic metrics | Diagnose failures and cost |

If an existing database already works, evaluate migration cost before replacing it. PostgreSQL is a proposal, not a report of the current database.

Keep one backend and a worker initially. Add Python only for a concrete workload or a deliberate target-role requirement. Select hosting according to cost, operational simplicity, data handling, and deployment needs rather than adding multiple clouds.

### Request flow

The React client calls Express. Express authenticates requests, applies access rules, and queries PostgreSQL. AI requests retrieve permitted passages and call the model through server-side code. Workers handle indexing and reminders. Provider credentials never belong in frontend code.

### Proposed entities

`users`, `books`, `editions`, `chapters`, `source_passages`, `user_books`, `reading_circles`, `circle_members`, `reading_progress`, `discussion_threads`, `comments`, `invitations`, `notifications`, `reports`, `scheduled_sessions`, `agent_drafts`, `tool_executions`, `ai_feedback`, `analytics_events`.

Create entities as their features become necessary. Avoid implementing the entire list before the first usable journey.

## 14. Security, privacy, and accessibility

- Enforce membership and progress checks on the server.
- Validate request bodies and use parameterized database access.
- Protect sessions and manage secrets outside source control.
- Rate-limit costly and abuse-prone endpoints.
- Design deletion and export to account for database records, uploaded assets, and derived AI indexes.
- Disclose relevant AI processing and minimize content sent to providers.
- Define retention periods and inspect provider settings before deployment.
- Treat user content and retrieved passages as untrusted data.
- Support keyboard use, meaningful labels, readable contrast, and clear loading/error states.

These are implementation requirements to investigate and verify, not a claim that the application is legally compliant or secure by default.

## 15. Testing and performance

Prioritize tests that protect consequential behavior:

1. Members cannot retrieve another private circle's contents.
2. Later-chapter content is excluded from permitted retrieval paths.
3. Moderator and organizer actions enforce role permissions.
4. Session creation and reminder retries do not create duplicates.
5. Account deletion removes or schedules removal of derived content.
6. Core signup, joining, discussion, and assistant journeys work end to end.

Use integration tests for API/database behavior and Playwright for a few important user journeys. Keep nondeterministic AI evaluation separate from ordinary deterministic tests.

For performance evidence, record dataset size, concurrency, environment, and measurement method. Describe synthetic load as synthetic. Measure before optimizing and avoid claiming production scale from a local benchmark.

## 16. User journey and success metrics

1. Choose genres, favorite books, and reading preferences.
2. Join a curated circle with a real organizer and recent activity.
3. Record progress and reply to a permitted chapter discussion.
4. Receive a meaningful response from another reader.
5. Ask the assistant a source-grounded question when useful.
6. Return for a session or continuing conversation.
7. Invite a friend after receiving value.

**Primary activation metric:** Percentage of new readers participating in a two-way human conversation within seven days. AI exchanges do not count toward this metric.

Track D7/D28 retention by signup cohort, weekly human participants, circles with recurring discussions, invitation acceptance, organizer retention, and cost per activated reader.

Track assistant usefulness feedback, supported-answer quality, observed spoiler incidents, latency, and cost separately. More AI messages do not automatically mean a healthier community.

## 17. Build and validation roadmap

### Focused portfolio release: approximately 4–6 weeks

This estimate assumes part of the social application already works. It is not a commitment to complete a full startup MVP in that period.

| Stage | Deliverable | Acceptance evidence |
|---|---|---|
| 1: Core journey | Join a circle, record progress, discuss | Working demo and access tests |
| 2: AI vertical slice | One permitted book, filtered retrieval, references | Repeatable benchmark and documented failures |
| 3: Reliability | Worker, retries, monitoring, deployment | Tested duplicate prevention and usable live app |
| 4: Presentation | README, short demo, technical case studies | A reviewer can understand the project quickly |

Add the organizer agent only after this release is stable. Reduce scope if corpus preparation or the existing application requires more work.

### Product validation stages

| Stage | Proposed activity | Decision evidence |
|---|---|---|
| Discovery | Interview roughly 15–30 readers and several organizers | Repeated pain points and willingness to trial |
| Private alpha | Recruit a few real circles | Actual conversations and organizer feedback |
| Retention | Observe several weekly reading cycles | Members return without constant founder prompting |
| AI usefulness | Offer the assistant to willing testers | Helpful answers and acceptable failure/cost profile |
| Monetization | Test willingness to pay with organizers | Explicit demand for a specific paid benefit |

These are proposed experiments, not market benchmarks. Record outcomes and adjust the plan rather than treating targets as forecasts.

## 18. Growth strategy

### Circle invitations

Organizers invite existing members. A useful group experience creates opportunities for members to start additional circles.

### Creator partnerships

Offer a small number of book creators hands-on support for a readalong. Learn what saves organizers time before building a large creator dashboard.

### University communities

Pilot with accessible student reading groups. Focus on repeated participation rather than registration totals.

### Community participation

Ask for feedback in relevant reader communities while respecting promotion rules. Do not treat forum membership as permission to advertise.

Measure invitation acceptance and activated participants by channel. Avoid paid acquisition before there is evidence that people return.

## 19. Business model

Keep profiles, shelves, circles, ordinary discussions, and spoiler controls free initially. Consider charging for organizer convenience or advanced personal insights only after validating demand.

| Possible plan | Illustrative price | Candidate value |
|---|---:|---|
| Free | €0 | Core reading community |
| Plus | €4.99/month | Advanced insights and customization |
| Creator Pro | €14.99/month | Organizer workflows and analytics |

AI usage requires cost controls; an unlimited low-price plan may be uneconomic. Test actual usage before setting allowances or margins.

Illustration only: 300 subscriptions at €4.99 produce €1,497 monthly gross subscription revenue before VAT, processing, refunds, churn, AI, hosting, support, and acquisition costs. This is arithmetic, not a forecast.

Affiliate sales and events are later possibilities, not launch requirements.

## 20. Engineering portfolio and German hiring relevance

### Recommended positioning

**Full-stack developer building reliable AI-enabled products with React, TypeScript, and Node.js.**

This connects the existing stack to applied AI work without claiming research-level ML expertise or changing the entire application architecture.

A small sample of employer postings reviewed on 10 November 2026 supports the relevance of these skills:

| Employer example | Observed emphasis |
|---|---|
| SAP Signavio Next, Berlin | TypeScript, React, backend development, tool-using LLM workflows, and explaining personally written code |
| Invertix, Munich | Published code, Python or TypeScript, RAG evaluation, agent interfaces, and data quality |
| connic | Python or TypeScript side projects and effective review of AI-assisted work |

These examples do not measure market-wide prevalence, establish hiring odds, or guarantee that the roles remain open.

### Evidence package

- Live demo with clearly labeled sample accounts at different chapter positions.
- A 90-second video showing one useful answer, a reference, and a rejected spoiler request.
- README with setup, architecture, demo instructions, and limitations.
- Versioned AI evaluation report with actual results.
- Short case study on consistent authorization across retrieval paths.
- Short case study on an AI failure and the change made after investigation.
- Meaningful tests and a reproducible deployment process.
- Real user feedback when available, distinguished from seeded activity.

### Interview preparation

Be ready to explain why Express was retained, how progress maps to editions, why access checks occur before generation, how retries avoid duplicates, and how evaluation cases were reviewed.

Explain your own contributions and how AI coding tools were used. Be able to modify and debug the important code without depending on generated explanations.

### CV wording after implementation

Only use statements that match completed work. Suitable factual descriptions may include:

- Built a React/Express reading platform with chapter-scoped discussions and server-enforced circle permissions.
- Implemented a source-grounded reading assistant with progress-filtered retrieval and passage references.
- Evaluated answer support, reference accuracy, and spoiler leakage using a versioned benchmark.

Add measured numbers only after collecting them. Do not describe proposed features as shipped or seed accounts as real users.

## 21. Risks and decisions

| Risk | Response |
|---|---|
| Strong competing products | Validate a narrow group workflow before expanding |
| Empty circles | Recruit organizers before public signup |
| AI reveals later events | Conservative behavior, filtered retrieval, adversarial evaluation, incident feedback |
| Incorrect chapter labels | Verified corpus mapping and moderator tools |
| Private content leaks | Shared authorization policy and cross-path tests |
| AI or infrastructure cost grows | Quotas, monitoring, constrained context, limited initial corpus |
| Excessive scope delays launch | One complete social journey and one AI feature first |
| Portfolio receives little attention | Clear CV bullets, short demo, role-specific presentation |
| Project displaces job applications | Time-box development and keep applying in parallel |

## 22. Immediate next steps

1. Audit the existing React/Express implementation and mark features as complete, partial, or missing.
2. Select one book with verified processing rights and chapter boundaries.
3. Finish a real circle journey and its access-control tests.
4. Build the smallest referenced, chapter-filtered assistant.
5. Create and review the initial evaluation set.
6. Deploy, invite a few readers, and collect feedback.
7. Publish the demo and technical evidence.
8. Add the organizer agent only if the core experience and available time justify it.

## 23. Research and reference links

### Employer examples reviewed for this revision

- SAP: https://careers.sap.com/job/Berlin-Working-Student-(fmd)-Signavio-Next-Full-Stack-Development-&-Engineering-Automation-10557/1415673633/
- Invertix: https://www.invertix.ai/de/careers
- connic: https://connic.co/careers/working-student-software-engineering

### Community discussions reviewed

- Portfolio screening discussion: https://www.reddit.com/r/cscareerquestions/comments/1t4gswl/employers_be_honest_does_a_portfolio_matter_2026/
- European junior-development discussion: https://www.reddit.com/r/cscareerquestionsEU/comments/1rbzq66/juniors_in_the_age_of_ai_what_to_focus_on/

Forum participants express conflicting experiences; their identities and hiring authority are not independently verified. Treat these threads as qualitative context rather than hiring statistics.

### Competitor and implementation starting points

- Goodreads: https://www.goodreads.com/
- The StoryGraph: https://app.thestorygraph.com/
- Fable: https://fable.co/
- Hardcover: https://hardcover.app/
- Open Library API: https://openlibrary.org/developers/api
- Google Books API: https://developers.google.com/books
- React: https://react.dev/
- Express: https://expressjs.com/
- PostgreSQL: https://www.postgresql.org/docs/
- pgvector: https://github.com/pgvector/pgvector
- Playwright: https://playwright.dev/docs/intro

Implementation links are starting points, not evidence that all configurations or current package versions have been validated. Consult current documentation while implementing.

---

**Decision:** Build a narrow, dependable social reading experience and one evaluated AI assistant. Use the resulting evidence to validate reader value and strengthen relevant job applications. All future features, timelines, prices, and validation targets in this document are proposals until demonstrated.
