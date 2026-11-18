# chalk

chalk is an AI whiteboard tutor that turns a topic into a short visual lesson. Watch diagrams develop alongside spoken narration, control the lesson timeline, and ask questions when you need another explanation. Lessons, questions, and playback progress are saved to your account.

## Features

- A chat-style topic composer with input validation and generation loading/error states.
- Real AI-generated lessons with twelve narration steps, whiteboard scenes, and a worked example. The prompt targets 240-280 spoken words; validation accepts 200-340 words for an approximately two-minute lesson.
- Excalidraw diagrams built from shapes, arrows, lines, labels, highlights, and Unicode equations, revealed as the lesson progresses.
- Spoken narration synchronized with the active scene and captions.
- Play, pause, resume, seek, previous/next step, restart, and replay. The timeline is segmented by lesson part using actual audio durations.
- Contextual AI follow-up answers with loading, retry, and edit-on-error states.
- Google sign-in, account-specific saved lesson history, saved questions/answers, and playback progress.
- Recovery of interrupted preparation, reuse of completed narration, and read-only loading of ready lessons.
- Responsive desktop/mobile navigation and light, dark, and system themes.
- Shared per-user rate limits backed by Upstash Redis for lesson creation and AI generation.

Lesson plans, narration, and follow-up answers are generated through OpenAI. The whiteboard renders structured scene data and updates with the narration timeline.

## Technology stack

| Area                               | Tools                                                             |
| ---------------------------------- | ----------------------------------------------------------------- |
| Application                        | Next.js 16 App Router, React 19, TypeScript                       |
| Styling and UI                     | Tailwind CSS 4, shadcn/ui with Base UI, Lucide icons, next-themes |
| Server state                       | TanStack Query 5 for queries, caching, and mutations              |
| Whiteboard                         | Excalidraw                                                        |
| AI integration                     | Vercel AI SDK with `@ai-sdk/openai`                               |
| Lesson plans and follow-up answers | OpenAI Responses API; default model `gpt-5.4-mini`                |
| Narration                          | OpenAI `gpt-4o-mini-tts`, `coral` voice                           |
| Validation                         | Zod                                                               |
| Authentication                     | Better Auth with Google OAuth                                     |
| Database                           | PostgreSQL, Drizzle ORM, node-postgres                            |
| Audio storage                      | Private Vercel Blob store                                         |
| Rate limiting                      | Upstash Redis and `@upstash/ratelimit` sliding windows            |
| Tests                              | Node.js test runner through tsx, AI SDK mocks                     |

## Architecture and data flow

```mermaid
flowchart TD
    Learner[Learner enters a topic] --> Client[Next.js workspace / TanStack Query]
    Client --> API[Authenticated route handlers]
    API --> DB[(PostgreSQL: lessons, questions, progress)]
    API --> Limits[Upstash Redis: per-user rate limits]
    API --> AI[OpenAI: structured plans, speech, answers]
    AI --> API
    API --> Blob[Private Blob: narration segments]
    Blob --> Player[Browser assembles PCM into WAV]
    Player --> Clock[Audio currentTime]
    Clock --> Board[Excalidraw scene and captions]
```

### Lesson generation and persistence

1. Save a lesson record with an owner-bound UUID and an idempotent request ID.
2. Generate a structured plan with `generateText` and `Output.object`. Validate the twelve steps, narration length, geometry, element IDs, and visual content. Allow one correction attempt when validation fails.
3. Save the plan and pending narration records. Generate speech for each step, upload the PCM segment to private Blob storage, and save its path and sample count. The browser requests at most two segments concurrently.
4. Assemble the segments into one WAV in the browser. Each step's exact start/end time comes from its PCM sample count at 24 kHz, mono, signed 16-bit audio.
5. Save playback position every five seconds while playing, on pause/seek/end, and when leaving. Monotonic revisions prevent older requests from overwriting newer progress.
6. Save follow-up questions and answers. Answer context comes from the persisted lesson and the last six completed question/answer pairs.

Short database leases prevent overlapping requests from preparing the same plan, audio segment, or answer. Expired leases allow interrupted work to be retried. A completed question ID returns its saved answer.

### Narration and whiteboard synchronization

`HTMLAudioElement.currentTime` is the playback clock. The active step is selected from the saved audio timings, and its complete whiteboard scene and caption are displayed together. Full scene snapshots make backward seeking restore the correct state without replaying earlier drawing actions. A shared lesson viewport keeps the camera stable between steps.

Playback is enabled after audio metadata and the initialized whiteboard viewport are ready. Whiteboard loading shows a placeholder instead of an empty canvas.

Reopening a ready lesson retrieves existing narration through read-only endpoints and reuses cached audio through TanStack Query. It does not invoke generation endpoints. **A single combined audio file is not currently persisted**: a cold load still downloads the saved segments and assembles the WAV in browser memory.

### Code organization

| Location                | Responsibility                                                              |
| ----------------------- | --------------------------------------------------------------------------- |
| `app/`                  | Pages, root layout, and API route handlers                                  |
| `components/workspace/` | Topic input, whiteboard, player, conversation, sidebar                      |
| `components/ui/`        | Shared shadcn UI primitives                                                 |
| `hooks/`                | Preparation, playback, and progress lifecycle                               |
| `lib/lesson/`           | Lesson validation, audio assembly/timing, board styles, request helpers     |
| `lib/lesson/server/`    | AI generation, private audio storage, session/input/error handling          |
| `db/`                   | Drizzle schema, migrations runner, ownership checks, persistence operations |
| `drizzle/`              | Committed database migrations                                               |
| `proxy.ts`              | Page and API session protection                                             |

Server routes check the authenticated owner before returning lesson data or private audio. Inputs are validated and bounded; errors are sanitized. AI and storage credentials remain server-side. OpenAI text requests disable provider-side response storage; API responses use `Cache-Control: no-store`.

## Prerequisites

- Node.js 22+ and pnpm 12.14.0, as specified in `package.json`.
- A PostgreSQL database reachable by the application server.
- A Google OAuth client configured for the application origin.
- An OpenAI API key with access to the configured text and speech models.
- A **private** Vercel Blob store and its server-side access token.
- An Upstash Redis database with REST URL and token for shared rate limits.

## Local installation and setup

### 1. Get the source and install dependencies

Install from a checkout:

```sh
git clone <repository-url> chalk
cd chalk
pnpm install --frozen-lockfile
```

Replace `<repository-url>` with the actual GitHub repository URL.

### 2. Configure environment variables

Copy `.env.example` to `.env` and fill in your own values. On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

On macOS/Linux:

```sh
cp .env.example .env
```

### 3. Configure Google, private audio storage, and Redis

In the Google OAuth client, allow `http://localhost:3000` as the local application origin and add this authorized redirect URI:

```text
http://localhost:3000/api/auth/callback/google
```

Create a private Blob store, connect it to the project, and set `BLOB_READ_WRITE_TOKEN`. Public Blob stores are not supported by the narration implementation.

Create an Upstash Redis database and copy its REST credentials to `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. These are required for lesson creation and new AI generation, including local development. Use a Redis instance near the application region to reduce request latency.

### 4. Apply database migrations

```sh
pnpm db:migrate
```

The committed migrations create the authentication tables and lesson persistence tables. Run `pnpm db:generate` only when changing the Drizzle schema, review the resulting migration, then apply it.

### 5. Start the application

```sh
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). To run a production build locally:

```sh
pnpm build
pnpm start
```

## Environment variables

Use placeholder values in committed files. Keep real credentials in `.env` locally and in the hosting platform's environment settings; never prefix these credentials with `NEXT_PUBLIC_`.

| Variable                   | Required                           | Purpose / example                                                                                               |
| -------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`             | Yes                                | PostgreSQL connection string, such as `postgresql://user:password@localhost:5432/chalk`                         |
| `BETTER_AUTH_SECRET`       | Yes                                | A long random authentication secret                                                                             |
| `BETTER_AUTH_URL`          | Yes                                | App origin: `http://localhost:3000` locally, or your deployed HTTPS origin in production                        |
| `GOOGLE_CLIENT_ID`         | Yes                                | Google OAuth client ID                                                                                          |
| `GOOGLE_CLIENT_SECRET`     | Yes                                | Google OAuth client secret                                                                                      |
| `OPENAI_API_KEY`           | Yes                                | Server-only text and speech API credential                                                                      |
| `UPSTASH_REDIS_REST_URL`   | Yes                                | Upstash Redis HTTPS REST endpoint                                                                               |
| `UPSTASH_REDIS_REST_TOKEN` | Yes                                | Upstash Redis server-only REST access token                                                                     |
| `BLOB_READ_WRITE_TOKEN`    | Yes for the documented local setup | Token for a private Vercel Blob store                                                                           |
| `OPENAI_TEXT_MODEL`        | No                                 | Structured-output-capable text model; defaults to `gpt-5.4-mini`                                                |
| `OPENAI_BASE_URL`          | No                                 | Optional provider base URL; defaults to `https://api.openai.com/v1`                                             |
| `BLOB_STORE_ID`            | No when using a Blob token         | Store identifier for the alternative Vercel OIDC configuration                                                  |
| `VERCEL_OIDC_TOKEN`        | Platform-managed alternative       | The storage helper also accepts `BLOB_STORE_ID` together with Vercel's OIDC token instead of a read/write token |

**Authentication configuration:** `lib/auth.ts` reads `BETTER_AUTH_URL` for the auth base URL. Set it separately in each environment and restart the server after changing it. Register the matching origin and `/api/auth/callback/google` redirect URI in Google OAuth. The browser auth client uses the current application origin.

**Blob authentication:** When `BLOB_READ_WRITE_TOKEN` is configured, chalk passes it explicitly to storage calls so Vercel's automatic OIDC selection cannot override it. Without that token, the SDK uses the connected store's OIDC configuration. Production credentials must refer to the same private store containing the saved narration. After changing Vercel environment variables, redeploy. Storage failures log an operation, error type, and sanitized Blob message under `[lesson-audio]`; credentials are not logged.

The OpenAI provider is called directly through the AI SDK; a Vercel AI Gateway key is not required. Text and speech generation incur provider charges; private audio storage and downloads may incur Blob charges.

## Rate limits

Limits use [Upstash sliding windows](https://upstash.com/docs/redis/sdks/ratelimit-ts/gettingstarted), keyed by the authenticated user ID. They are shared across devices and server instances, with separate Redis prefixes for development, preview, and production environments.

| Operation                      | Limit per user per 10 minutes |
| ------------------------------ | ----------------------------: |
| Lesson creation requests       |                            10 |
| New lesson plan attempts       |                             5 |
| New narration segment attempts |                            90 |
| New tutor answer attempts      |                            20 |

A lesson has twelve narration segments; each newly generated segment counts separately. Completed plans, cached answers, and saved audio are returned before checking AI quotas. Reading lesson history, reopening ready lessons, polling questions, and saving playback progress do not consume these quotas. Lesson creation requests, including requests that reuse an existing request ID, count toward the creation limit. Failed AI attempts also consume their generation quota.

Exceeding a limit returns HTTP `429` with a `Retry-After` header and a user-facing wait message. The client does not automatically retry a rate-limited generation request. Missing Redis credentials, backend errors, and limiter timeouts return `503` and block new AI calls; rate limiting does not silently fall back to unlimited access. Existing saved content remains readable.

Limits are defined in `lib/lesson/server/rate-limit.ts`. They control request frequency, not a total billing budget; keep provider spending limits configured as well.

## How to use chalk

1. Sign in with Google.
2. Enter a topic, such as "How binary search works" or "Why seasons change," and generate a lesson.
3. Wait for the plan, narration, and whiteboard to become ready. If preparation fails, use Retry; already saved work is reused.
4. Press Play. Watch the diagram and captions update with the narration.
5. Pause/resume, drag or click the segmented timeline, jump between steps, restart, or replay.
6. Open **Ask tutor** and ask a question about the explanation. Responses are saved with the lesson.
7. Reopen a saved lesson from the sidebar to restore its plan, questions, narration, and playback position.

Generation progresses while the page is open. Leaving may interrupt pending requests; reopening the lesson resumes missing work rather than running a background job. Provider work already processed may still be billed after cancellation.

## Deployment

Deploy chalk to a platform that supports Next.js server routes, such as Vercel:

1. Verify dependencies install cleanly with `pnpm install --frozen-lockfile`.
2. Configure a hosted PostgreSQL database, a private Blob store, and Upstash Redis accessible from the deployed server.
3. Set the required production environment variables, including `BETTER_AUTH_URL=https://<your-domain>`.
4. Add the production origin and `https://<your-domain>/api/auth/callback/google` to the Google OAuth client configuration.
5. Apply the committed migrations to the intended production database.
6. Build and deploy the application. Ensure hosting request-duration limits support lesson generation (the plan route declares up to 180 seconds; narration and question routes declare up to 90 seconds).
7. Test the deployed application: Google sign-in, lesson generation, playback, seeking, follow-up questions, and reopening a saved lesson.

Use production credentials and services reachable from the deployed application. Keep private Blob storage and database access server-side.

## Development and testing

```sh
pnpm test:core
pnpm test:db
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

- `test:core` runs offline with AI SDK mocks and intercepted HTTP requests. It covers structured-output validation/retries, PCM/WAV assembly, timeline boundaries, board readiness, saved-audio caching, text encoding, per-user/action rate limits, and fail-closed Redis error/timeout handling. It does not call OpenAI, PostgreSQL, Blob, or live Upstash Redis.
- `test:db` requires a migrated PostgreSQL database. It creates isolated temporary users and lessons to check ownership, idempotency, lease recovery, saved narration metadata, progress revisions, chat, pagination, and cascade cleanup. It removes its fixtures and does not call OpenAI or Blob.
- For a manual smoke test, try a math, science, and non-STEM topic. Check visual clarity, factual accuracy, synchronization while seeking, playback controls, follow-up answers, mobile navigation, themes, and saved-lesson reopening. Live generation incurs provider charges.

## Known limitations

- Lessons are introductory and English-only; actual duration varies with narration pace and topic.
- AI-generated facts and diagram layouts can be imperfect and need review. The board supports basic primitives and Unicode equations, without a symbolic mathematics engine.
- Follow-up answers are text-only and do not change the whiteboard.
- Cold saved-lesson loading downloads separate PCM segments and assembles a WAV in memory. A combined, directly playable audio file is not currently stored.
- There is no background generation worker. Rate limits are per account and do not impose a global spending cap; configure provider spending limits before enabling public access.
- Abrupt browser termination can lose the latest few seconds of playback progress. Browser audio caches do not survive a full refresh.
- Automatic Blob retention/deletion is not implemented; account or lesson deletion through external administration requires separate audio cleanup.
