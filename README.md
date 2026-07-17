# RoaM Content Engine

This repository contains the RoaM Content Engine core domain, repository, HTTP API, and background worker foundation.

## Repository Purpose And Architecture

The codebase is organized into layered modules:

- `src/domain`: domain types and transition rules
- `src/domain/repositories`: repository interfaces
- `src/infrastructure/repositories`: Drizzle/PostgreSQL implementations
- `src/application`: use-case services that orchestrate repository calls
- `src/application/ai`: provider-independent AI prompt runner, usage aggregation, and pipeline orchestration
- `src/application/publications`: normalized publication builder and CTA guide template
- `src/api`: Fastify HTTP API, validation, middleware, serializers, and error handling
- `src/worker`: worker runtime composition and process entrypoint
- `src/application/workers`: worker loop, execution orchestration, stale recovery, retry policy
- `src/infrastructure/workers`: database-backed worker job source and deterministic transcript processor
- `src/infrastructure/ai`: AI provider registry, OpenAI and mock providers, and prompt definitions
- `src/platform`: shared platform concerns (environment, IDs, hashing, errors, request context)
- `src/domain/publications`: renderer-independent publication document model
- `src/schemas/publications`: strict publication validation schemas

HTTP handlers call application services and never execute SQL directly.
Tenant scope is enforced through validated request context before `/v1` handlers run.

## Current Implementation Scope

Implemented in this milestone:

- tenant-scoped immutable source versions
- tenant-scoped idempotent content-job creation
- transactional content-job lifecycle transitions and job events
- production-oriented Fastify HTTP API (`/v1`) over repository-backed application services
- database-backed worker foundation with lease-based acquisition, heartbeats, retries, and stale recovery
- provider-independent AI processing pipeline with schema-validated prompt outputs
- deterministic transcript processor implementation for local development and integration validation

Not implemented in this milestone:

- Microsoft Entra authentication and JWT validation
- Azure OpenAI integration
- publication rendering to EPUB/PDF/DOCX/HTML
- Azure Service Bus transport (database queue is the interim transport)

The temporary `x-tenant-id` header is a development identity adapter only. It is not production authentication.

## Repository-Layer Behavior

### Source Versioning And Immutability

- transcript text is normalized before hashing and persistence
- source versions are immutable and tenant scoped
- deduplication is enforced by tenant + project + transcript hash
- immutable creation returns the existing equivalent source version when present
- concurrent creation is guarded with PostgreSQL advisory transaction locks per tenant/project

### Content Job Idempotency

- jobs are idempotent by `(tenant_id, idempotency_key)`
- repeated requests with the same fingerprint return the same job
- key reuse with a different fingerprint fails with `IDEMPOTENCY_KEY_REUSED`

### Atomic Claiming And Lifecycle

- claiming is atomic and updates status/stage/attempt counters in one guarded transition
- lifecycle transitions are validated by domain transition rules
- state transitions are recorded with transactional job events
- event records preserve `priorStatus` and `newStatus`

## Prerequisites

- Node.js 20+
- npm
- Docker (for local PostgreSQL)

## Local PostgreSQL

Start PostgreSQL:

```bash
docker compose up -d
```

Validate database connectivity:

```bash
npm run db:health
```

Run migrations:

```bash
npm run db:migrate
```

## Environment Variables

Use `.env.example` as a starting point.

```env
NODE_ENV=development
HOST=0.0.0.0
PORT=3000
DATABASE_URL=postgresql://roam_content:roam_content_dev@localhost:5432/roam_content
DATABASE_MAX_CONNECTIONS=10
DATABASE_SSL=false
WORKER_NAME=roam-content-worker
WORKER_POLL_INTERVAL_MS=1000
WORKER_LEASE_DURATION_MS=30000
WORKER_HEARTBEAT_INTERVAL_MS=10000
WORKER_MAX_ATTEMPTS=5
WORKER_CONCURRENCY=1
WORKER_SHUTDOWN_TIMEOUT_MS=30000
WORKER_STALE_RECOVERY_INTERVAL_MS=30000
WORKER_RETRY_BASE_DELAY_MS=1000
WORKER_RETRY_MAX_DELAY_MS=60000
AI_PROVIDER=mock
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
OPENAI_TIMEOUT_MS=30000
PIPELINE_VERSION=1.0.0
MOCK_AI_MODE=success
```

Notes:

- `HOST` and `PORT` default to `0.0.0.0` and `3000`.
- worker validation enforces `WORKER_LEASE_DURATION_MS > WORKER_HEARTBEAT_INTERVAL_MS`.
- worker validation enforces `WORKER_RETRY_MAX_DELAY_MS >= WORKER_RETRY_BASE_DELAY_MS`.
- `AI_PROVIDER` supports `mock` and `openai`.
- `OPENAI_API_KEY` is required when `AI_PROVIDER=openai`.
- `MOCK_AI_MODE` supports deterministic fault injection: `success`, `retryable-failure`, `permanent-failure`, `timeout`, `malformed-output`.
- `AI_PROVIDER=mock` is the default development/testing mode.
- OpenAI SDK retries are disabled; worker retry policy remains the only retry layer.
- token counts are validated as nonnegative safe integers.
- `totalTokens` is computed as `inputTokens + outputTokens`; provider-reported totals are not blindly trusted.
- Monetary cost estimation is not implemented in this milestone; usage records keep token and latency data only.
- Do not commit real credentials.

## AI Processing Pipeline

Transcript jobs continue to compute deterministic normalization and statistics, and now optionally attach AI outputs under the job `result.ai` field.

Pipeline characteristics:

- provider-independent `AIProvider` contract (`mock` and `openai` implementations)
- schema-first prompt outputs using Zod validation per prompt
- sequential prompt execution (`metadata`, `keywords`, `summary`, `scripture`, `reflections`)
- per-prompt usage capture plus aggregated usage totals
- pipeline metadata includes `provider`, `model`, and `pipelineVersion`
- when `AI_PROVIDER=openai`, transcript content is sent to OpenAI for processing
- worker shutdown cancellation and provider timeout are handled as distinct outcomes
- AI outputs are schema validated and unexpected fields are rejected
- monetary cost estimation is intentionally omitted in this milestone

## Publication Generation Framework

After AI pipeline completion, the worker now builds and persists a normalized publication object.

Architecture flow:

- `Worker -> AI Pipeline -> Publication Builder -> Publication Model -> Renderer (future)`

The publication builder is renderer-independent and currently emits a structured CTA Guide publication model.

Supported publication sections in the CTA template:

- Cover
- Table of Contents
- Message Summary
- Key Themes
- Scripture References
- Reflection Questions
- References

Sections that require dedicated AI outputs are currently deferred and may be omitted:

- Call To Action
- Journal Prompts
- Prayer
- Next Steps

Supported normalized publication blocks:

- heading
- paragraph
- quote
- reflection
- call-to-action
- prayer
- scripture
- journal-prompt
- checklist
- bullet-list
- numbered-list
- sidebar
- image-placeholder
- table
- divider
- key-takeaway
- warning
- highlight

Supported publication metadata includes:

- publication metadata (type, title, subtitle, audience, theme, style)
- cover metadata
- table of contents regenerated from final sections (excluding cover and the TOC section itself)
- table of contents entries with null page numbers until rendering
- references, citations, and footnotes
- asset references only (no binary storage)
- render intent options for future renderers

Validation guarantees:

- strict schema validation for all publication objects and blocks
- publication-wide ID uniqueness (sections, blocks, TOC entries, references, citations, footnotes, assets)
- cross-object reference integrity checks for TOC targets, internal references, citations, footnotes, and assets

Current CTA template policy:

- no invented prayer, CTA, journal, or next-step prose
- unsupported content sections are omitted until dedicated validated AI fields exist
- only validated AI-derived content is transformed into normalized publication structure

Current limitations:

- pagination is not implemented
- binary asset embedding is not implemented
- EPUB rendering is not implemented.
- PDF rendering is not implemented.
- DOCX rendering is not implemented.
- HTML rendering is not implemented.
- cover image assets are references only.
- page numbers remain null until rendering.
- Only normalized publication generation exists in this milestone.

Worker retry semantics for AI execution:

- transient provider failures (`AI_PROVIDER_UNAVAILABLE`, `AI_RATE_LIMIT`, `AI_TIMEOUT`) map to retryable worker failures
- invalid output, auth errors, and permanent provider failures map to permanent worker failures

## Run Commands

Start API in watch mode:

```bash
npm run dev
```

Start worker in watch mode:

```bash
npm run worker:dev
```

Start API once:

```bash
npm run start
```

Start worker once:

```bash
npm run worker:start
```

Type-check:

```bash
npm run typecheck
```

Run all tests:

```bash
npm test
```

Run only API integration tests:

```bash
npm run test:api
```

Run only worker tests:

```bash
npm run test:worker
```

Repository-layer focused commands:

```bash
npm run test:integration
npm run test:unit
```

## Request Identity And Context

Request headers used by the API:

- `x-request-id`: response header (echoes Fastify request ID)
- `x-correlation-id`: optional request header, generated if missing, returned in response
- `x-tenant-id`: required on tenant-scoped `/v1` endpoints (temporary development identity adapter)

Rules:

- tenant IDs are never trusted from request bodies
- tenant-scoped operations always use validated request context
- malformed correlation IDs are rejected with `400`

## Request Body Size Limit

The API enforces a request body limit of `1,048,576` bytes (1 MiB).

- oversized payloads are rejected with `413`
- transcript payloads are never truncated silently

## Endpoints

Health:

- `GET /health/live`
- `GET /health/ready`

Versioned API (`/v1`):

- `POST /v1/source-versions`
- `GET /v1/source-versions/:sourceVersionId`
- `POST /v1/content-jobs`
- `GET /v1/content-jobs/:jobId`
- `GET /v1/content-jobs/:jobId/events`
- `POST /v1/content-jobs/:jobId/cancel`

## Example cURL

Create source version:

```bash
curl -i http://localhost:3000/v1/source-versions \
  -H 'content-type: application/json' \
  -H 'x-tenant-id: tenant_01JEXAMPLEABCDEF1234567890' \
  -d '{
    "projectId": "project_01JEXAMPLEABCDEF1234567890",
    "transcriptText": "Full transcript text",
    "sourceType": "transcript",
    "metadata": {}
  }'
```

Create content job (idempotent):

```bash
curl -i http://localhost:3000/v1/content-jobs \
  -H 'content-type: application/json' \
  -H 'x-tenant-id: tenant_01JEXAMPLEABCDEF1234567890' \
  -H 'idempotency-key: req-001' \
  -H 'x-correlation-id: corr_01JEXAMPLEABCDEF1234567890' \
  -d '{
    "projectId": "project_01JEXAMPLEABCDEF1234567890",
    "sourceVersionId": "srcver_01JEXAMPLEABCDEF1234567890",
    "jobType": "transcript-processing",
    "requestSchemaVersion": "1.0"
  }'
```

Get content-job events:

```bash
curl -i http://localhost:3000/v1/content-jobs/job_01JEXAMPLEABCDEF1234567890/events \
  -H 'x-tenant-id: tenant_01JEXAMPLEABCDEF1234567890'
```

## Idempotency Behavior

`POST /v1/content-jobs` is idempotent by `(tenant, idempotency-key)`.

- same key + same fingerprint returns the same job record
- same key + different fingerprint returns `409 IDEMPOTENCY_KEY_REUSED`
- API currently returns `202` for accepted and replayed requests because repository output does not expose an explicit created-vs-existing flag

## Persistence And Tenant Isolation Notes

- all repository reads and writes are tenant scoped
- cross-tenant source version and content job access returns safe not-found behavior
- job event queries are tenant scoped and ordered chronologically
- cancellation and lifecycle enforcement run within repository transition guards

## Error Response Contract

All API errors use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Readable error message",
    "requestId": "request identifier",
    "correlationId": "corr_...",
    "details": {}
  }
}
```

Error mapping:

- `ValidationError` -> `400`
- malformed JSON -> `400` (`INVALID_JSON`)
- missing `x-tenant-id` -> `400` (`VALIDATION_ERROR` for temporary development adapter)
- `NotFoundError` -> `404`
- `ConflictError` -> `409`
- database unavailable -> `503`
- payload too large -> `413`
- unknown error -> `500` (`INTERNAL_SERVER_ERROR`)

Security notes:

- no stack traces are returned to API clients
- stack traces remain in server logs for unknown internal failures only
- secrets, transcript bodies, and full headers are not intentionally logged

## Graceful Shutdown

`src/api/server.ts` installs `SIGINT` and `SIGTERM` handlers and performs graceful shutdown:

- stop accepting new HTTP requests
- close Fastify instance
- close PostgreSQL pool

`src/worker/server.ts` also installs `SIGINT` and `SIGTERM` handlers and performs graceful shutdown:

- stop polling for new jobs
- wait for active executions to settle up to `WORKER_SHUTDOWN_TIMEOUT_MS`
- abort active executions after timeout
- close PostgreSQL pool

## Architecture Notes

HTTP handlers call thin application services and do not run SQL directly.
Application services depend on repository interfaces and remain Fastify-independent.
This keeps authentication and identity extraction replaceable (for future Entra JWT integration) without rewriting route business logic.

Worker execution runs as a separate process from the API process.
The current queue transport is PostgreSQL (`content_jobs`) with lease metadata (`leaseOwner`, `leaseExpiresAt`, `heartbeatAt`, `nextAttemptAt`).
Retry scheduling uses exponential backoff with a configured cap and max attempts.
Stale processing jobs (expired leases) are periodically recovered to `retrying` or moved to `failed`.

### Processing-job cancellation

Queued and retrying jobs may be cancelled through the existing API.

Jobs already in `processing` are not cooperatively cancelled in
Implementation 05. The current API and domain transition rules continue to
reject that transition. Cooperative cancellation may be added in a later
milestone with an explicit cancellation-request state or field.

Microsoft Entra authentication is not implemented yet.
AI provider processing and Service Bus transport are not implemented yet.
