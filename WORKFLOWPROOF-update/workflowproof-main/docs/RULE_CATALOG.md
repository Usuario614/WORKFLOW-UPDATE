# Rule catalog v0.8

The current engine contains **59 deterministic audit rules**. Findings are static evidence for review; they are not proof of exploitation or runtime failure.

## Reliability

- HTTP retry/backoff and finite timeout checks
- mutating HTTP retry without visible idempotency
- duplicate webhook delivery / idempotency exposure
- excessive retry budgets
- rate-limit pacing hints
- blast-radius / fan-out risks
- long HTTP timeout warnings

## Recovery

- workflow-level Error Workflow configuration
- Error Workflow self-reference
- side-effect recovery paths
- replay/dead-letter hints
- operational alerting
- completion checkpoints
- Code node failure paths

## Data safety

- boundary validation
- database write guards
- destructive operations
- payment idempotency
- trigger-to-side-effect paths
- spreadsheet state risks
- pinned personal-data fixtures

## Security

- webhook authentication hints
- public webhook → sensitive action paths
- GET webhooks that trigger side effects
- remote plaintext HTTP
- hard-coded bearer tokens / generic secrets
- sensitive query-string credentials
- pinned secrets
- dynamic code execution
- Execute Command host-level risk
- mutating SSH command hints
- credential-reference hygiene

## AI safety

- structured output contract hints
- direct AI → side-effect paths
- prompt-injection surfaces
- broad AI agent tool access
- personal-data exposure to external models

## Maintainability

- disconnected / disabled nodes
- large workflows
- ambiguous names
- environment-specific URLs
- hard-coded notification recipients
- version/change notes
- pinned fixture availability

## Context-aware side-effect severity

`WEBHOOK_SIDE_EFFECT_NO_DEDUP` classifies reachable side effects before assigning severity. Ordinary communications and business-data writes are **High**. Visible money movement, destructive mutation, or access/privilege changes can be **Critical**. The finding includes impact class, reversibility, financial risk and affected actions.

The source of truth is `src/engine/rules.ts`.
