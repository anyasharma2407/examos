# ExamOS

Turn your own course material into a study plan.

ExamOS reads the lecture slides, tutorials and past papers you upload, works out
which topics your course actually covers, generates practice questions grounded
in that material, tracks what you keep getting wrong, and answers the only
question that matters the night before an exam:

> **What should I study today?**

It is not a "chat with your PDFs" app. There is no chat box. The product is the
plan.

---

## Status

The application is being built in phases. **Phases 1 to 5 are complete**, plus
the mastery and mistake-tracking half of phase 6: project setup, database
schema, authentication, the landing page, course management, uploading course
material with text extraction, the knowledge map, per-topic study guides with a
spoken tutor, and practice — questions generated from the student's own
material, graded, with mastery updated from every answer.

Still to build: exam readiness and the daily study plan.

| Phase | Scope                                                        | Status |
| ----- | ------------------------------------------------------------ | ------ |
| 1     | Next.js + Prisma + Supabase Auth, schema, landing, app shell  | Done   |
| 2     | Dashboard, course creation, course list                       | Done   |
| 3     | File upload, secure storage, document processing              | Done   |
| 4     | Topic extraction, knowledge map, AI service layer             | Done   |
| 5     | Question generation, practice interface, answer evaluation    | Done   |
| 6     | Mastery algorithm, mistake tracking, exam readiness           | Partly |
| 7     | Daily study planner, dashboard integration                    | Next   |
| 8     | Responsive/loading/empty/error states, a11y, performance      | To do  |

---

## Architecture

```
Browser
  │
  ├─ (marketing)   static landing page, no session read
  ├─ (auth)        login / signup / password reset  ──▶ Supabase Auth
  └─ (app)         dashboard, courses, practice     ──▶ requireUser()
                                                          │
src/proxy.ts ── refreshes the Supabase session cookie      │
                and redirects unauthenticated requests     │
                                                           ▼
                                            ┌──────────────────────────┐
                                            │  Server Actions / RSC    │
                                            │  Zod-validated input     │
                                            └───────┬──────────┬───────┘
                                                    │          │
                                       Prisma 7 ────┘          └──── src/lib/ai
                                          │                            │
                                    PostgreSQL                    OpenAI API
                                                              (server-side only)

Uploaded files ──▶ Supabase Storage (private bucket, per-user prefix)
                     └─▶ text extraction ──▶ MaterialChunk rows ──▶ AI grounding
```

Key decisions:

- **Authorisation lives in the data layer, not the router.** `src/proxy.ts`
  redirects for UX; the real check is `requireUser()` plus a `userId` filter on
  every query. Server Actions accept direct POSTs, so they can never trust an id
  that arrived in a form.
- **One AI service layer.** OpenAI is only ever called from `src/lib/ai/`. Every
  response is JSON-parsed and Zod-validated before it reaches business logic, so
  a malformed completion is a handled error rather than corrupt data.
- **Uploaded documents are data, never instructions.** Course material is passed
  to the model as delimited reference content in its own message, and the system
  prompt states that instructions inside it must be ignored.
- **Scoring is pure.** Mastery, exam readiness and study-plan generation are
  plain functions over plain data, so they are unit-testable and replaceable
  without touching the database or the UI.

### Directory layout

| Path                   | Contents                                                    |
| ---------------------- | ----------------------------------------------------------- |
| `src/app/(marketing)/` | Public landing page                                          |
| `src/app/(auth)/`      | Auth screens and their Server Actions                        |
| `src/app/(app)/`       | Authenticated application; layout calls `requireUser()`      |
| `src/app/auth/confirm/`| Handles Supabase email links (`verifyOtp`)                   |
| `src/components/ui/`   | shadcn/ui primitives (generated — avoid hand edits)          |
| `src/lib/ai/`          | The only place the OpenAI API is called                      |
| `src/lib/supabase/`    | Browser / server / service-role / proxy clients              |
| `src/lib/validation/`  | Zod schemas shared by forms and actions                      |
| `prisma/`              | Schema, migrations, demo seed                                |
| `tests/`               | Vitest suites                                                |

---

## Setup

### Requirements

- Node.js 20.9+ (developed on Node 26)
- Docker, if you want the recommended local setup below
- An OpenAI API key (needed from Phase 4 onward)

You do **not** need a Supabase account to develop: the CLI runs the whole
Supabase stack — Postgres, Auth, Storage and Studio — locally in Docker.

### 1. Install

```bash
npm install
```

`postinstall` runs `prisma generate`, which writes the Prisma client to
`src/generated/prisma` (gitignored).

### 2. Configure the environment

```bash
cp .env.example .env
```

| Variable                        | Required   | Purpose                                                             |
| ------------------------------- | ---------- | ------------------------------------------------------------------- |
| `DATABASE_URL`                  | yes        | Runtime connection. Use the **pooled** URL if your host has a pooler. |
| `DIRECT_URL`                    | yes        | **Unpooled** connection used by `prisma migrate`.                     |
| `NEXT_PUBLIC_SUPABASE_URL`      | yes        | Supabase project URL. Public by design.                              |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes        | Supabase anon key. Public by design; safe only with RLS enabled.     |
| `SUPABASE_SERVICE_ROLE_KEY`     | yes        | **Server only.** Bypasses row-level security.                        |
| `OPENAI_API_KEY`                | from ph. 4 | **Server only.** Never exposed to the browser.                       |
| `OPENAI_MODEL`                  | no         | Defaults to `gpt-5.6-luna`. Change the model without changing code.  |

Never commit `.env`. `SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY` must never
be given a `NEXT_PUBLIC_` prefix — that would ship them to the browser.

### 3. Database and Supabase

**Recommended: run Supabase locally.** With Docker running:

```bash
npx supabase start
```

The first run pulls a few GB of images. When it finishes it prints `API_URL`,
`ANON_KEY`, `SERVICE_ROLE_KEY` and `DB_URL` — copy them into `.env` as
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` and both `DATABASE_URL` / `DIRECT_URL`. Re-print them
any time with `npx supabase status`.

These local keys are the CLI's fixed development keys. They are identical on
every machine and grant access to nothing beyond your laptop, so they are safe
in a local `.env` — and must never be used for a hosted project.

Useful local endpoints:

| Service                      | URL                     |
| ---------------------------- | ----------------------- |
| API / Auth                   | `http://127.0.0.1:54321` |
| Postgres                     | `127.0.0.1:54322`        |
| Studio (browse data & users) | `http://127.0.0.1:54323` |
| Mailpit (all outbound email) | `http://127.0.0.1:54324` |

Email confirmation is **off** locally (`supabase/config.toml`), so sign-up logs
you straight in. Password-reset emails are not delivered to a real inbox — open
Mailpit to click the link.

Stop the stack with `npx supabase stop`; add `--no-backup` to discard the data.

**Alternative: hosted Supabase.** Create a project, then take the two connection
strings from *Project Settings → Database* (pooled into `DATABASE_URL`, direct
into `DIRECT_URL`) and the three API values from *Project Settings → API*.

**Alternative: plain Postgres.** Any PostgreSQL 14+ instance works for
`DATABASE_URL` / `DIRECT_URL`, but Auth and Storage still need Supabase.

### 4. Migrations

```bash
npm run db:migrate      # create + apply a migration in development
npm run db:deploy       # apply existing migrations (CI / production)
npm run db:studio       # browse the data
npm run db:reset        # drop, re-migrate and re-seed (destructive)
```

Connection URLs live in `prisma.config.ts`, not in `schema.prisma` — this is a
Prisma 7 change. After editing `prisma/schema.prisma`, run `npx prisma generate`
(or just `npm run build`, which does it for you).

### 5. Auth redirect configuration

Locally this is already set in `supabase/config.toml` (`site_url` and
`additional_redirect_urls` point at `http://localhost:3100`). If you change the
dev server port, update both values and restart with
`npx supabase stop && npx supabase start`, or password-reset links will point at
the wrong origin.

On a hosted project the same two settings live under *Authentication → URL
Configuration*: add your site URL and allow `<origin>/auth/confirm`.

### 6. Run

```bash
npm run dev             # http://localhost:3100
```

The port is 3100 rather than the Next.js default of 3000, set in the `dev` and
`start` scripts. Changing it means changing `supabase/config.toml` to match, as
above.

---

## Uploads and document processing

Students upload PDF, DOCX, PPTX and TXT files, up to **100MB each** and 25 at a
time. Files are POSTed one per request, so a large selection never buffers
hundreds of megabytes at once and each file starts being read while the next
uploads.

**Three separate ceilings have to agree, and the lowest wins:**

| Ceiling | Where | Current |
| ------- | ----- | ------- |
| Application limit | `MAX_FILE_BYTES` in `src/lib/materials/constants.ts` | 100MB |
| Storage backend | `[storage] file_size_limit` in `supabase/config.toml` | 200MiB |
| Hosted Supabase | project setting, plan-dependent | 50MB on the free plan |

Uploads deliberately go to a Route Handler (`/api/materials/upload`) rather than
a Server Action. Server Actions cap the request body, and Next.js buffers the
body of any request the proxy matches (10MB by default) — either would silently
truncate a large PDF. `src/proxy.ts` excludes the upload path so neither applies;
the route authenticates with `requireUser()` and checks course ownership itself,
so nothing is lost by skipping the proxy.

**If you deploy to hosted Supabase**, raise the project's file size limit or
lower `MAX_FILE_BYTES` to match — otherwise uploads between the two numbers will
be accepted by the app and rejected by storage.

**Storage.** Files go to a private Supabase Storage bucket (`course-material`),
keyed `<userId>/<courseId>/<materialId>-<filename>`. The bucket is never public
and the browser never talks to it: every read and write goes through the server
with the service-role key, after the caller's ownership of the course has been
checked. The user id prefix means a path built for one user can never address
another user's object. The bucket is created on first upload if it is missing.

**Validation.** The filename and the browser-reported MIME type are both
attacker-controlled, so the file's leading bytes are checked too — a renamed
executable is rejected rather than stored. Filenames are stripped of directory
components and control characters before they are used in a storage key.

**Processing** runs after the upload response via `after()`, so a slow PDF never
blocks the page. A material moves through `UPLOADING → PROCESSING → ANALYSING →
READY`, or lands on `FAILED` with a reason the student can act on ("If it is a
scan, it needs to be run through OCR first"). The UI polls only while something
is in flight, and offers a retry on failure. Processing never throws: it runs
detached from any request, so every failure path writes `FAILED` rather than
leaving a file stuck.

**Extraction** is per format — `unpdf` for PDF, `mammoth` for DOCX, direct
OOXML reading for PPTX (slides plus speaker notes), UTF-8 decoding for TXT.
Extracted text is then cleaned (page numbers, running headers, hyphenation
across line breaks, NUL bytes that PostgreSQL rejects) and split into
overlapping chunks on paragraph and sentence boundaries. Chunks are the unit of
grounding: the AI layer only ever sees chunk text, and topics and questions cite
the chunk they came from.

---

## The knowledge map

Once a course has material marked `READY`, **Build knowledge map** on the course
page extracts its topics. Each topic carries a name, a description, an
importance estimate, and the excerpts it was drawn from.

**Which material gets sent.** A semester of uploads is far more than fits in a
prompt, so `src/lib/ai/selection.ts` picks a sample under a character budget.
Two properties matter, and neither comes from simply taking the first N chunks:
every material gets a share of the budget (a 600-page lecture PDF must not crowd
out the two-page course outline), and chunks are spread evenly through each
document so week 12 is represented as well as week 1.

**How hallucination is prevented.** Every topic must cite the excerpt it came
from, by a label that only exists in this request. Citations are resolved back
against the excerpts that were actually supplied, and a topic whose citations
all fail to resolve is discarded rather than stored. A citation pointing at
material we never sent is the clearest available signal that a topic came from
general knowledge rather than from this course — which is exactly what would
turn ExamOS into a generic syllabus generator.

**Rebuilding is safe.** Topics are matched by name and updated in place, so
practice history survives a rebuild. A topic that no longer appears is only
deleted if nothing depends on it; one with questions or attempts against it is
left alone rather than silently taking the student's history with it.

---

## Practice

**Questions** are generated per topic from the passages the knowledge map cited
for it, in three types: multiple choice, numeric and short answer. They are
written to test whether the student can apply a method, not whether they can
recall a definition.

The schema can only guarantee field types, so `validateQuestion` checks each
question against itself and discards anything inconsistent — a multiple-choice
answer that is not among its own options, a "numeric" answer that is not a
number, duplicate options, a citation to material that was never supplied. A
mis-keyed question is worse than a missing one: it marks a correct student wrong
and teaches them the wrong thing.

**Nothing about the answer reaches the browser before submission.** The practice
page selects only the prompt and the options; the correct answer, hint and
explanation arrive in the Server Action's response after the student has
answered. Shipping them with the page would put the answers in view source.

**Grading** is deterministic where it can be. Multiple choice is a normalised
comparison; numeric parsing accepts the forms students actually type (`3/4`,
`75%`, `1,250`, `1.5e3`, a unicode minus pasted from a PDF) and applies a
tolerance so sensible rounding is not punished. Short answers match the model
answer and its listed variants for free — and anything else is escalated to the
model rather than guessed at, because string overlap would mark paraphrases
wrong and reward keyword stuffing. If the grader is unavailable the attempt is
reported and *not* recorded, rather than marking the student wrong on a
technicality and poisoning their mastery score.

## Mastery

`src/lib/mastery.ts` is deliberately **not** `correct / total`. That number
treats an easy question as worth the same as a hard one, lets last month's right
answers outweigh today's wrong ones, never decays, and reads 100% after a single
lucky guess.

Instead a running estimate is updated per attempt, where influence depends on
difficulty and on how much evidence already exists, and confidence decays with a
21-day half-life. Two numbers are kept: `masteryScore` (the estimate) and
`masteryStrength` (how much evidence backs it), so "70%, barely tested" is
distinguishable from "70%, tested repeatedly" — which is what will let the study
planner choose between revisiting an uncertain topic and drilling a weak one.
Below a confidence threshold a topic reads "Not practised" rather than showing a
number one question produced.

Every wrong answer writes a `Mistake`; answering the same question correctly
later resolves it, so weak-area reporting reflects what is still outstanding.

---

## Demo data

```bash
npm run db:seed
```

Creates a demo account (`demo@examos.local` / `demo-password-1234`) in Supabase
Auth together with a MATH1061 course, exam date and topics. Demo rows are marked
`isDemo` on the `User`, so they are always distinguishable from real data and
delete cleanly. The script refuses to run with `NODE_ENV=production` unless
`ALLOW_PRODUCTION_SEED=true` is set — the demo password is published here.

---

## Tests

```bash
npm test          # vitest run
npm run test:watch
npm run typecheck
npm run lint
```

Tests never touch a real database, Supabase project or OpenAI account;
`tests/setup.ts` supplies placeholder configuration and anything that would make
a network call is mocked. Business logic (mastery, readiness, planning) is
written as pure functions specifically so it can be tested this way.

---

## AI configuration

Check your setup before using any AI feature:

```bash
npm run check:ai
```

It reports, separately, whether the key is present, whether it authenticates,
whether the account has credit, and whether the configured model is available —
four problems with four different fixes, two of which the provider signals with
the same HTTP status.


All model access goes through `src/lib/ai/`. Nothing outside that directory
imports `openai`; everything above it deals in `AiResult<T>` — a validated value
or a typed failure — so swapping provider means rewriting `client.ts` and
nothing else.

- The API key is read server-side via `serverEnv()` and never reaches the client.
- The model is set by `OPENAI_MODEL`, so upgrading is a configuration change.
  The default is the cheapest current model: topic extraction is structured
  extraction from supplied text against a strict schema, which does not need a
  flagship model, and weak output is caught by schema validation and the
  citation check rather than stored. Move up if question generation feels
  shallow.
- If the configured model is not available on the account, the error names
  `OPENAI_MODEL` so the fix is obvious. If a model family rejects
  `temperature`, the client drops the parameter and retries rather than
  failing.
- Course material is fenced with a **per-request random delimiter** and labelled
  as quoted data. A fixed delimiter could be reproduced by a hostile document to
  escape the fence; a random one cannot be guessed. Standing rules stating that
  instructions inside the fence are to be treated as words on a page are
  prepended to every call, in the client rather than per caller, so no future
  feature can forget them.
- Every structured response is JSON-parsed and then Zod-validated — the
  provider's own schema enforcement is not taken on trust. A malformed response
  is retried with the validation error fed back, which fixes most near-misses.
  Transient provider failures (429, 5xx, timeouts) are retried with backoff;
  auth and quota failures are not, because they will not fix themselves.
- Request JSON Schemas are generated from the Zod schemas via `z.toJSONSchema`,
  so the Zod definition is the single source of truth.
- `OPENAI_BASE_URL` points the client at Azure OpenAI or any OpenAI-compatible
  gateway without code changes.

---

## Deployment

1. Provision PostgreSQL and set `DATABASE_URL` / `DIRECT_URL`.
2. Set the Supabase and OpenAI variables in the host's environment. Only the two
   `NEXT_PUBLIC_*` values may be exposed to the browser.
3. Run `npm run db:deploy` as a release step.
4. Build with `npm run build` and serve with `npm start`. Any Node.js host works;
   the app uses the Node runtime throughout (Next.js 16's `proxy` does not
   support the edge runtime).
5. Update the Supabase *Site URL* and redirect allow-list to the deployed origin.

---

## A note on the readiness score

Exam readiness is an **estimate** derived from your practice history, topic
importance and how much of your material you have covered. It is not a
prediction of your exam result, and the UI labels it as such.
