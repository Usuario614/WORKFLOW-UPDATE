# WorkflowProof v0.12.0 (sales-readiness candidate)

Local-first automation preflight and hardening workbench for exported n8n workflow JSON. It helps builders surface static risk evidence before a workflow is deployed, handed off, or shared.

## Core capabilities
- 59 deterministic audit rules across Reliability, Recovery, Data Safety, Security, Maintainability and AI Safety.
- Production gates that prevent High/Critical findings from being hidden behind a high weighted score.
- Safe deterministic auto-fixes with re-audit proof.
- Guided fix proposals with preview, approval and re-audit.
- Risk Acceptance with owner, reason and review/expiry date while preserving technical penalties.
- Compare Version with resolved/new/unchanged findings and explicit production-gate explanation.
- Risk Acceptance carry-over during version comparison for matching findings.
- Adversarial test-plan generation.
- Release Pack with workflow, audit, repair plan, tests, governance evidence, comparison evidence, self-test evidence and SHA-256 workflow fingerprint, plus a separately downloadable share-safe mode with contextual redaction and a redaction count.
- Entire scan runs locally in the browser; no account, upload or API key required.
- A built-in synthetic demo shows the product flow without exposing a real workflow or contacting a live endpoint.

## Install

```powershell
npm ci
npm run check
npm run selftest
npm run dev
```

Open the Vite localhost URL and run **Engine Self-Test**. The suite reports every scenario it executes.

For a release gate, run `npm run verify`. See [docs/PUBLICATION_CHECKLIST.md](docs/PUBLICATION_CHECKLIST.md) before publishing or taking payment.

For the commercial pilot, use [buyer intake](docs/BUYER_INTAKE.md), the [safe demo script](docs/DEMO_SCRIPT.md) and the [assisted-audit sales playbook](docs/SALES_OPERATIONS.md). These documents deliberately scope the offer; they do not replace the evidence required for a public 1.0 release.

## Installable local app

WorkflowProof includes a minimal installable web-app manifest and offline cache. It is designed to work locally after first load; validate browser-specific installation/offline behavior before claiming it as a release feature.

## Product boundary

WorkflowProof is static analysis: it reports evidence for review, not a security certification, compliance attestation, or guarantee of production behavior. It does not upload workflows, invent credentials, or automatically enable retries for mutating HTTP operations.

## Compare Version

The comparison panel now shows:
- Production score and weighted technical score for baseline and candidate.
- Open Critical / High counts.
- Accepted-risk counts.
- Resolved, new and unchanged findings.
- Accepted risks carried into the candidate.
- Accepted risks that disappeared because the finding was resolved.
- Acceptance carry failures (should normally remain 0).
- A written explanation when the production score does not change even though findings changed.

Example: if baseline and candidate are both capped at 79 because each still has at least three unresolved High findings, WorkflowProof explicitly says that instead of leaving an unexplained `79 → 79`.

## Release Pack

`Download release pack` exports a single JSON containing:
- source workflow;
- SHA-256 fingerprint;
- complete audit;
- release decision and production gate;
- open findings by severity;
- repair plan;
- adversarial test plan;
- active risk acceptances;
- applied/resolved proof data;
- latest comparison evidence, if present;
- engine self-test evidence;
- evidence-policy metadata.

The share-safe export aggressively redacts operational identifiers, credential references, secret-bearing fields, URLs, email-like values and common token patterns. It still requires a human review before external sharing; automated redaction is risk reduction, not proof of safe disclosure.

## Safety model

WorkflowProof intentionally does not equate a successful n8n execution with a safe business outcome. It also does not automatically retry mutating writes when idempotency cannot be established, does not invent credentials or business identifiers, and does not hide formally accepted risks from technical scoring.

Static analysis is not a guarantee of correctness or security. Review generated changes before production.


## Commercial pilot

WorkflowProof now includes a clearly scoped assisted-audit offer in the app. The founding pilot is **USD 49 for one sanitized workflow**, with a written report, prioritized remediation plan and one follow-up review of buyer-approved changes. Target delivery is two business days after a valid intake is received. This is a price-validation experiment, not a permanent price or a claim of proven market demand.

The app's **Request an audit** buttons open an email draft to `nuvekoia@gmail.com`; no payment is collected by the app. Confirm scope, data-handling instructions and a payment method with the buyer before starting work. Never ask for credentials or live production access for the standard pilot.

For a scoped n8n reliability review or a WorkflowProof pilot, contact [nuvekoia@gmail.com](mailto:nuvekoia@gmail.com). Do not email workflow exports, credentials, tokens, customer data or production URLs in the first message. Send a sanitized export only after receiving intake instructions.


## Free accounts (v0.13)

Optional Supabase-backed accounts provide two lifetime free scans per user, an account credit counter and downloadable report history. The workflow JSON remains in the browser; the generated audit report is stored in the user's Supabase account. Configure the project using [SUPABASE_SETUP.md](SUPABASE_SETUP.md) and run [supabase/schema.sql](supabase/schema.sql). Never expose a Supabase service-role key in browser environment variables.

Premium checkout is not connected yet; exhausted accounts see a clear free-credit limit rather than a fake payment flow.
