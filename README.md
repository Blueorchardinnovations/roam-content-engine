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
- `src/application/themes`: deterministic publication theme registry and CSS package assembly
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
- publication rendering to EPUB/PDF/DOCX
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

Integration test execution note:

- integration tests run with one worker because the suite uses a shared PostgreSQL integration database and several fixtures perform shared cleanup
- parallel file execution can cause cross-test job acquisition and foreign-key cleanup races in test infrastructure
- this is a test-environment rule and does not imply production runtime serialization

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

After AI pipeline completion, the worker now builds and persists a normalized publication object and a renderer-neutral semantic HTML document model.

Architecture flow:

- `Worker -> AI Pipeline -> Publication Builder -> Publication Model -> HTML Composer -> HtmlDocument -> Optional Renderer -> Optional Render Artifact`

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
- strict schema validation for all HtmlDocument objects, semantic elements, and design tokens
- strict HTML attribute allowlist and URL safety policy (`https`, `http`, `mailto`, `asset`, and internal `#anchor` only), including malformed URL rejection, embedded credential blocking, and host/port validation for network URLs
- strict structural validation for one non-empty `main` semantics, internal anchor targets, heading progression, and landmark integrity
- publication-wide ID uniqueness (sections, blocks, TOC entries, references, citations, footnotes, assets)
- cross-object reference integrity checks for TOC targets, internal references, citations, footnotes, and assets

## HTML Composition Layer

The HTML composition layer converts normalized Publication content into semantic, renderer-neutral HtmlDocument structures.

Composition characteristics:

- semantic HTML tags only (`article`, `section`, `header`, `footer`, `main`, `aside`, `nav`, headings, paragraphs, lists, tables, figures)
- deterministic theme mapping from publication theme to intent-based design tokens
- design tokens describe intent only (spacing, typography, color intent, font role, border intent, shadow intent, radius, callout type, page intent, section intent, heading intent, content width, image alignment)
- no CSS values, no layout engine directives, and no renderer-specific attributes
- assets are references only (`asset://...`) and are never embedded as binaries
- TOC, references, and footnotes are composed into semantic navigation/content sections
- accessibility-focused structure with language support, heading-order validation, table headers, semantic navigation labels, and alt-text placeholders
- TOC navigation is omitted when there are no TOC entries
- callout blocks retain semantic distinctions (`dataPublicationBlock` and mapped `dataCalloutType`) instead of collapsing to a single generic marker

## Publication Rendering Pipeline

Implementation 09 introduces the rendering architecture layer without introducing production PDF/EPUB/DOCX generation.

Rendering architecture:

- renderer domain contracts for request/options/metadata/status/capabilities/artifacts
- strict rendering schemas and validation layered on top of validated `HtmlDocument`
- renderer interface (`render`, `validate`, `getCapabilities`, `supports`, `supportedThemes`, `supportedFormats`)
- deterministic `HtmlMarkupSerializer` that converts validated semantic `HtmlDocument` into canonical HTML5 markup
- deterministic `HtmlMarkupRenderer` that wraps the serializer and emits HTML-specific render artifacts
- deterministic HTML passthrough renderer implementation
- optional worker extension point after semantic HTML composition

Rendering format model:

- declared formats: `html`, `pdf`, `epub`, `docx`, `markdown`
- current renderer implementation support: `html` only
- explicit renderer selection values: `structured-json`, `html-markup`, and `styled-html`
- `structured-json` selects `HtmlPassthroughRenderer`
- `html-markup` selects `HtmlMarkupRenderer`
- `styled-html` selects `StyledHtmlRenderer`
- current placeholder artifact payload representation: `structured-json`
- current placeholder artifact MIME type: `application/json`
- current placeholder artifact extension: `.json`
- current HTML markup artifact payload representation: `html-markup`
- current HTML markup artifact MIME type: `text/html; charset=utf-8`
- current HTML markup artifact extension: `.html`
- current styled HTML artifact payload representation: `styled-html`
- current styled HTML artifact MIME type: `text/html; charset=utf-8`
- current styled HTML artifact extension: `.html`
- non-HTML requests fail with stable `UNSUPPORTED_FORMAT`

Theme model:

- rendering reuses publication themes: `classic`, `modern`, `ministry`, `workbook`, `magazine`, `minimal`, `dark`
- unsupported themes fail with stable `UNSUPPORTED_THEME`

Render validation includes:

- validated semantic `HtmlDocument` input (no duplicate HTML validation model)
- required rendering metadata checks
- format and theme capability checks
- style-token compatibility checks against renderer capabilities
- asset URI safety checks via centralized URL safety rules

Render artifact model distinguishes:

- artifact metadata (id/format/mime/extension/checksum/byte-size/created-at/warnings/errors)
- inline payload content (deterministic UTF-8 canonical JSON representation of the validated semantic HtmlDocument)
- inline payload content for markup renderer (deterministic UTF-8 canonical semantic HTML5 markup)
- inline payload content for styled renderer (deterministic UTF-8 canonical standalone HTML5 markup with embedded CSS)
- persisted storage reference (`none` for passthrough renderer)

Markup serializer and renderer responsibilities:

- `HtmlPassthroughRenderer` produces deterministic canonical structured JSON
- `HtmlMarkupSerializer` converts a validated `HtmlDocument` into deterministic browser-ready semantic HTML5
- `HtmlMarkupRenderer` wraps the serializer and produces a render artifact with HTML-specific metadata
- serializer is pure and deterministic: identical `HtmlDocument` input yields identical HTML output bytes
- renderer performs request validation, capability checks, checksum and byte-size calculation from exact output bytes

Deterministic HTML formatting policy:

- canonical lowercase `<!doctype html>`
- lowercase tags from validated semantic model
- double-quoted attributes
- deterministic attribute ordering
- deterministic class ordering
- LF newlines only
- deterministic void-element serialization
- no browser-dependent DOM serialization

Escaping and safety policy:

- all untrusted text and attribute values are HTML escaped
- URL safety validation reuses centralized URL policy (`assertSafeExternalUrl`, `assertSafeAssetUrl`, `assertSafeInternalHref`)
- only controlled attributes are serialized
- semantic block identities are preserved using `data-publication-block`
- stable CSS hooks are generated for future theme and pagination layers
- active content is prohibited (`script`, `iframe`, `object`, `embed`, event handlers, inline javascript)

Rendering error taxonomy:

- `RENDER_VALIDATION_ERROR`
- `UNSUPPORTED_FORMAT`
- `UNSUPPORTED_THEME`
- `RENDER_FAILED`
- `INVALID_ASSET`

Worker integration behavior:

- rendering runs only after successful semantic HTML composition
- rendering remains optional; when no renderer is configured, behavior is unchanged
- deterministic rendering failures are treated as permanent worker failures (no retry scheduling)
- render cancellation preserves existing worker cancellation semantics
- failed rendering does not persist partial render artifacts or completion events

## Styled HTML Render Artifact Integration

Implementation 13 exposes styled standalone HTML as an explicit render artifact.

The `styled-html` representation is distinct from `html-markup`.

StyledHtmlRenderer delegates document composition to PublicationPackageComposer.

The implementation extends application types and schemas but does not require a database migration because render results are stored as application-validated JSON.

It does not render HTML in a browser.

It does not paginate content.

It does not generate PDF or EPUB.

It does not upload artifacts or create storage references.

It does not replace the existing HTML markup renderer.

Renderer contract summary:

- `structured-json` remains the deterministic structured JSON artifact path
- `html-markup` remains the deterministic unstyled semantic HTML artifact path
- `styled-html` is the deterministic standalone HTML artifact path with embedded publication CSS
- the styled renderer accepts a controlled presentation block with `themeId`, `densityId`, and `layoutId`
- omitted styled presentation values resolve through the packaging layer defaults (`themeId` from the HtmlDocument, `standard`, and `single-column`)
- unknown explicit presentation identifiers fail under strict schema and packaging validation
- payload bytes, byte size, and SHA-256 checksum are all computed from the final UTF-8 standalone HTML payload
- artifact ID and completion timestamp may still vary when existing renderer contracts require them
- accessibility semantics remain unchanged because the renderer reuses the existing semantic HTML document model
- security boundaries remain unchanged: no scripts, no external stylesheets, no browser execution, no pagination, and no active content injection

Compatibility and persistence:

- existing `structured-json`, `html-markup`, `binary`, and `storage-reference` validation remains intact
- content-job results continue to be validated as application-level JSON payloads
- no database migration was required because payload representation is stored inside application-validated JSON
- worker renderer selection now branches explicitly to `HtmlPassthroughRenderer`, `HtmlMarkupRenderer`, and `StyledHtmlRenderer`
- the styled path is covered by renderer tests, schema tests, worker-selection tests, and worker integration tests

## External Publish Engine Client Integration

Implementation 14 adds a reusable outbound Publish Engine client boundary in infrastructure.

Current scope:

- typed client interface: `submitRender`, `submitCtaRender`, `getJob`, `waitForJob`, and `getDownload`
- strict DTO and schema validation for requests and remote responses
- explicit styled HTML source artifact validation (payload representation, UTF-8 byte size, SHA-256 checksum)
- environment-driven configuration parser with strict URL normalization and HTTPS enforcement (localhost HTTP exception for local testing)
- injected access-token provider boundary (`PublishEngineAccessTokenProvider`) without Azure Identity coupling
- injected transport and timing dependencies (`fetch`, `sleep`, `now`, `random`) for deterministic tests
- bounded retries with exponential backoff and jitter support, status-aware retry rules, idempotency-aware submission safety, and `Retry-After` parsing
- request timeout and caller cancellation propagation through `AbortSignal`
- structured error taxonomy for authentication, transport, timeout, protocol/schema mismatch, retry exhaustion, job terminal failures, and idempotency conflict
- redacted/hashed logging for sensitive request identifiers

Security and reliability constraints:

- no bearer token values are logged
- no request or response payload bodies are logged
- no arbitrary caller-supplied headers are forwarded
- strict correlation-id and idempotency-key header validation blocks control characters
- download URL validation enforces HTTPS except explicit loopback local addresses

Explicit non-goals in this implementation:

- no worker orchestration activation of Publish Engine calls
- no database schema or persistence changes
- no local browser/PDF/EPUB generation
- no artifact upload/storage integration
- no real external network calls in tests

## Publication Theme System And CSS Package Foundation

Implementation 11 adds a deterministic CSS package layer without changing the semantic HTML rendering architecture.

Architecture boundary:

- existing semantic pipeline remains unchanged:
  - `HtmlDocument -> HtmlMarkupSerializer -> deterministic HTML5 -> HtmlMarkupRenderer -> HTML RenderArtifact`
- new styling pipeline is parallel and reusable:
  - `Theme ID + Density ID + Layout ID -> PublicationThemeRegistry -> PublicationCssPackager -> deterministic CSS package`

Current integration boundary:

- CSS is not injected into HTML artifacts
- HTML artifact payload representation remains `html-markup`
- HTML artifact MIME type remains `text/html; charset=utf-8`
- HTML artifact extension remains `.html`
- CSS package output is an internal reusable application service output (string)

Theme module layout:

- `src/application/themes/types.ts`: controlled IDs and contracts
- `src/application/themes/registry.ts`: typed theme registry and metadata
- `src/application/themes/css-packager.ts`: deterministic CSS layer assembly
- `src/application/themes/tokens`: primitive, semantic, and component token tiers
- `src/application/themes/base`: reset, document, typography, accessibility, utilities
- `src/application/themes/layouts`: `single-column`, `two-column`, `wide-content`
- `src/application/themes/components`: shared semantic component styles
- `src/application/themes/density`: `comfortable`, `standard`, `compact`, `high-density`
- `src/application/themes/presets`: canonical theme token overrides

Canonical theme IDs:

- `classic`
- `modern`
- `ministry`
- `workbook`
- `magazine`
- `dark`
- `minimal`

Display-label mapping:

- `ministry` maps to display label `Ministry Classic`
- no incompatible persisted theme ID is introduced for that label

Token tiers:

- primitive tokens (`--pub-*` reusable value scales)
- semantic tokens (`--pub-*` intent aliases)
- component tokens (`--pub-*` component-level styling slots)

Deterministic CSS layer order:

1. primitive tokens
2. semantic tokens
3. component token defaults
4. reset
5. base document rules
6. typography
7. accessibility
8. utilities
9. selected layout
10. shared components
11. selected density profile
12. selected theme preset

Selector strategy:

- style semantic hooks emitted by the serializer (`.publication-*` and `[data-publication-block="..."]`)
- do not depend on arbitrary generated classes
- do not depend on positional selectors

Accessibility rules:

- focus indicators are preserved (`:focus-visible` styles are required)
- browser zoom remains supported (relative sizing, no fixed-height content clipping)
- reduced-motion compatibility is preserved
- forced-colors compatibility is preserved where practical
- dark theme declares `color-scheme: dark`

Explicit non-goals in this implementation:

- no CSS injection into HTML artifacts
- no paged-media CSS
- no `@page` rules
- no page headers, footers, or page numbers
- no PDF generation
- no EPUB generation
- no Vivliostyle runtime integration

Future integration targets:

- publish-engine embedding or linking
- preview application linking
- Vivliostyle consumption
- EPUB styling reuse

Implementation 11 creates a deterministic CSS package foundation.

It does not inject CSS into the HTML artifact.

It does not paginate content.

It does not generate PDF or EPUB.

It does not define Letter, A4, or Tabloid pages.

The CSS package is intended for future preview, Publish Engine, Vivliostyle, and EPUB integrations.

## HTML And CSS Package Composition

Implementation 12 combines deterministic semantic HTML and deterministic theme CSS into a standalone publication document.

It does not render the document in a browser.

It does not paginate the document.

It does not generate PDF or EPUB.

It does not download or package external assets.

It does not replace the existing HTML serializer or HTML renderer.

Composition architecture:

- semantic HTML serialization remains separate:
  - `HtmlDocument -> HtmlMarkupSerializer -> deterministic semantic HTML document`
- CSS packaging remains separate:
  - `Theme ID + Density ID + Layout ID -> PublicationThemeRegistry -> PublicationCssPackager -> deterministic CSS package`
- standalone packaging is coordinated in application layer:
  - `HtmlMarkupSerializer -> structured serialized HTML document data + PublicationCssPackager output + presentation metadata -> StandaloneHtmlDocumentComposer -> styled standalone HTML document`

Implementation 12 module layout:

- `src/application/publication-packaging/types.ts`: composition input/output and serialized-document contracts
- `src/application/publication-packaging/defaults.ts`: centralized deterministic default resolution
- `src/application/publication-packaging/errors.ts`: controlled composition errors
- `src/application/publication-packaging/standalone-html-document-composer.ts`: canonical document shell serializer
- `src/application/publication-packaging/publication-package-composer.ts`: composition coordinator

Structured serialized HTML document model:

- distinguishes doctype, html attributes, head title, head metadata, and body markup
- avoids reparsing serialized HTML strings
- allows the same canonical shell serializer to serve both unstyled serializer output and styled standalone composition

Serializer responsibility remains unchanged in scope:

- semantic node serialization
- attribute ordering
- text escaping
- URL safety behavior
- deterministic body markup generation
- canonical title and metadata source values

Document shell responsibility:

- deterministic doctype emission
- html and body attribute serialization
- fixed head ordering
- optional deterministic CSS embedding
- deterministic body placement
- shell-level invariant enforcement

Composition input:

- trusted validated `HtmlDocument`
- optional supported `themeId`
- optional supported `densityId`
- optional supported `layoutId`

Default resolution policy:

- theme: caller-supplied supported theme when present, otherwise `HtmlDocument.theme`
- density: `standard`
- layout: `single-column`

Composition output distinguishes:

- unstyled deterministic serialized HTML document
- deterministic packaged stylesheet CSS
- styled standalone HTML document
- resolved presentation metadata (theme, density, layout, color scheme)

Standalone HTML structure:

- one lowercase `<!doctype html>`
- one `html`
- one `head`
- one `body`
- one `title`
- one embedded publication `style`

Head ordering for styled standalone documents:

1. meta charset
2. viewport
3. existing document metadata entries in canonical source order, excluding reserved duplicates
4. color-scheme metadata from theme registry
5. title
6. embedded packaged CSS

Presentation hook strategy:

- controlled metadata hooks are emitted on `body`
- `data-publication-theme`
- `data-publication-density`
- `data-publication-layout`
- hooks are authoritative metadata for future preview and publishing integrations

Title and language handling:

- title source of truth is `document.head.title`
- language source of truth is `document.head.lang`
- existing escaping rules are reused
- no inference or fallback generation is introduced

Deterministic formatting policy for composed standalone HTML:

- canonical lowercase doctype
- UTF-8 metadata
- LF newlines only
- stable element ordering
- stable attribute ordering from controlled inputs
- no trailing whitespace
- exactly one final newline
- no timestamps, build metadata, or random identifiers

Active-content and external-resource policy:

- no scripts
- no inline event handlers
- no external stylesheet links
- no meta refresh
- no browser execution hooks
- no asset downloading, font embedding, or URL rewriting
- existing safe links and asset URLs from semantic HTML are preserved under prior validation rules

Accessibility preservation:

- document language remains present
- document title remains present
- packaged focus-visible CSS remains included
- semantic headings, links, images, and tables remain unchanged
- viewport metadata does not disable scaling

Renderer boundary:

- no new renderer is added in this implementation
- `HtmlMarkupRenderer` remains unchanged and continues to emit the existing unstyled `html-markup` artifact
- styled standalone HTML remains an application-layer composition result only in this phase

Future integration targets:

- browser preview services
- external Publish Engine composition
- Vivliostyle consumption
- EPUB generation reuse
- later styled HTML render artifacts if explicitly approved

Current CTA template policy:

- no invented prayer, CTA, journal, or next-step prose
- unsupported content sections are omitted until dedicated validated AI fields exist
- only validated AI-derived content is transformed into normalized publication structure

Current limitations:

- pagination is not implemented
- binary asset embedding is not implemented
- production EPUB rendering is not implemented.
- production PDF rendering is not implemented.
- production DOCX rendering is not implemented.
- CSS package generation is implemented as a deterministic internal styling foundation.
- browser-preview rendering is not implemented.
- Print layout is not implemented.
- HTML passthrough rendering exists only as an architectural placeholder that emits structured JSON artifacts (not browser-ready HTML markup).
- cover image assets are references only.
- page numbers remain null until rendering.
- Vivliostyle integration is not implemented.
- Paged.js integration is not implemented.
- PrinceXML integration is not implemented.
- Markdown renderer implementation is not implemented.
- HTML markup serializer exists and emits semantic browser-ready HTML5 without production layout CSS.
- HTML markup renderer does not apply production page-layout CSS.
- HTML markup renderer does not paginate content.
- HTML markup renderer does not generate PDF, EPUB, DOCX, or Markdown.
- Vivliostyle integration is a later implementation.

Worker retry semantics for AI execution:

- transient provider failures (`AI_PROVIDER_UNAVAILABLE`, `AI_RATE_LIMIT`, `AI_TIMEOUT`) map to retryable worker failures
- invalid output, auth errors, and permanent provider failures map to permanent worker failures

Worker error taxonomy for publication and HTML composition:

- publication failures: `PUBLICATION_VALIDATION_ERROR`, `PUBLICATION_UNSUPPORTED_TYPE`, `PUBLICATION_BUILD_ERROR`
- html failures: `HTML_VALIDATION_ERROR`, `HTML_UNSUPPORTED_ELEMENT`, `HTML_COMPOSITION_ERROR`
- rendering failures: `RENDER_VALIDATION_ERROR`, `UNSUPPORTED_FORMAT`, `UNSUPPORTED_THEME`, `RENDER_FAILED`, `INVALID_ASSET`
- cancelled publication/html flows map to worker cancellation (no partial persistence)

Privacy guarantees for publication/html persistence:

- raw transcript sentinels and prompt/provider internals are not persisted into publication or HtmlDocument payloads
- HTML validation and composition failures use sanitized error messages and do not include transcript sentinel values

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

Run HTML-focused safety and composition tests:

```bash
npm run test:html
```

Run rendering-focused tests:

```bash
npm run test:rendering
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
