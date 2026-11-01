# WorkflowProof commercial-readiness audit

Audit date: 2026-09-21. Scope: source, rule engine, scoring/gates, risk acceptance, comparison, Guided Fixes and Release Pack.

## Release decision

**Not 1.0.0.** Version `0.12.0` is a sales-readiness candidate. Dependencies are fixed and CI requires a clean install, type check, engine self-test and production build. This environment permits the first two but blocks Vite/esbuild from starting its build subprocess, so no final-build claim is made. Promotion requires the clean CI checks and buyer gates listed in `RELEASE-v0.12.json`.

## Findings

| ID | Severity | Evidence | Fix |
| --- | --- | --- | --- |
| A-001 | High | Release Pack embedded workflow IDs, credential references, webhook IDs, metadata and URLs without share-safe export. | Added non-mutating sanitized Release Pack mode that redacts operational identifiers, credentials, webhook fields, metadata, pinned/static data and URLs. |
| A-002 | High | Risk Acceptance used rule + node name, allowing a changed node to inherit approval. | Acceptance now uses exact deterministic finding fingerprint. |
| A-003 | High | Compare Version used the same weak identity and could call a changed finding unchanged. | Comparison now keys by finding fingerprint; stale acceptance becomes visible carry failure. |
| A-004 | Medium | Acceptance state lived only in React memory. | Added workflow-SHA-256-scoped local persistence plus defensive restore/import validation. |
| A-005 | Medium | Release evidence emitted `proof: null`. | Added explicit `not-run` / `changes-applied` status and reason. |
| A-006 | Medium | A node label containing “trigger” was treated as an n8n trigger. | Trigger detection uses n8n type semantics only. |
| A-007 | High | Error Workflow Guided Fix could reference the workflow itself. | Self-reference is rejected. |
| A-008 | Medium | Earlier audit tooling counted text occurrences rather than rule objects and incorrectly reported 78. The source of truth (`RULES.length`) is 59. | Restored every product claim to 59 and made the self-test assert the actual rule-array length. |
| A-009 | Blocking verification | `npm run build` cannot complete here: Vite loader `spawn EPERM`. | No product workaround: verify in CI before 1.0.0. |
| A-010 | Critical privacy | The initial sanitized pack only redacted known keys, not secrets hidden in header values, embedded URLs or evidence text. | Replaced it with contextual plus content-pattern redaction; added a regression fixture for Authorization values, tokens, URLs and email-like evidence. |
| A-011 | High release reproducibility | `latest` dependencies could resolve different toolchains over time. | Pinned React, Vite and TypeScript versions, committed the resolved lockfile and added a clean-install CI workflow. |
| A-012 | Medium buyer-safety/UX | A new buyer could only supply a real export before understanding local processing, product limits or remediation authority. | Added a synthetic no-live-endpoint demo and a first-run product-boundary panel. |
| A-013 | Medium regression coverage | The self-test catalog verified rule metadata but did not directly prove each rule could execute against representative n8n-style exports. | Added a compatibility matrix that invokes every shipped rule against HTTP, webhook and retry-enabled fixtures. |

## Scoring, rules and remediation review

- Technical scores retain accepted-risk penalties; acceptance only changes the open-findings gate.
- Unresolved Critical blocks production; unresolved High keeps hardening; unresolved Medium prevents an unqualified ready signal.
- All **59** shipped deterministic rules were reviewed as static heuristics, not proof of exploitation or business correctness. The strongest severities remain reserved for credential exposure, host command execution, destructive/access/financial effects and unsafe public boundaries.
- Auto-fix remains restricted to read-only HTTP retry hardening and timeout defaults. It never enables mutating retries. Guided Fixes require preview and explicit approval, never invent secrets, credentials or business data.

## Verification

- Clean `npm ci` from the committed lockfile: passed on v0.12.0 (lifecycle scripts were suppressed by this environment).
- `npm run check`: passed on v0.12.0.
- `npm run selftest`: passed on v0.12.0 (13/13).
- `npm run build`: source type-check completed; Vite/esbuild build process was blocked by this environment's child-process permission (`spawn EPERM`). It is not counted as passed.
- CI is now the release gate: clean install, check, self-test and production build must pass before promotion.
