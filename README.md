# RoaM Content Engine

This repository contains the RoaM Content Engine core domain, repository, and HTTP API layers.

## Repository Purpose And Architecture

The codebase is organized into layered modules:

- `src/domain`: domain types and transition rules
- `src/domain/repositories`: repository interfaces
- `src/infrastructure/repositories`: Drizzle/PostgreSQL implementations
- `src/application`: use-case services that orchestrate repository calls
- `src/api`: Fastify HTTP API, validation, middleware, serializers, and error handling
- `src/platform`: shared platform concerns (environment, IDs, hashing, errors, request context)

HTTP handlers call application services and never execute SQL directly.
Tenant scope is enforced through validated request context before `/v1` handlers run.

## Current Implementation Scope

Implemented in this milestone:

- tenant-scoped immutable source versions
- tenant-scoped idempotent content-job creation
- transactional content-job lifecycle transitions and job events
- production-oriented Fastify HTTP API (`/v1`) over repository-backed application services

Not implemented in this milestone:

- Microsoft Entra authentication and JWT validation
- worker execution loops and internal claim/retry processors
- AI provider integrations and publication generation pipelines

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
```

Notes:

- `HOST` and `PORT` default to `0.0.0.0` and `3000`.
- Do not commit real credentials.

## Run Commands

Start API in watch mode:

```bash
npm run dev
```

Start API once:

```bash
npm run start
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

## Architecture Notes

HTTP handlers call thin application services and do not run SQL directly.
Application services depend on repository interfaces and remain Fastify-independent.
This keeps authentication and identity extraction replaceable (for future Entra JWT integration) without rewriting route business logic.

Microsoft Entra authentication is not implemented yet.
Worker execution loops and AI processing are not implemented yet.
