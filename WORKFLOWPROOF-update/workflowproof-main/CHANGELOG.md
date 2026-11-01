## v0.12.1 - commercial pilot conversion improvements

- Added a scoped USD 49 assisted-audit offer to the landing screen.
- Added a prefilled email CTA for audit inquiries and sample-report requests.
- Added a contextual audit CTA to the analysis dashboard.
- Clarified that the app does not collect payment and that scope/payment are confirmed manually.
- Updated README commercial pilot instructions and reiterated safe intake boundaries.
- Verification note: full `npm run verify` could not be completed in the editing environment because dependency installation timed out and left an incomplete `node_modules`; rerun `npm ci` and `npm run verify` in a network-enabled environment before publishing.

# Changelog

## 0.12.0 — 2026-09-21

- Added a synthetic in-product demo that never contacts a live service and makes product boundaries visible before first scan.
- Added buyer intake, a safe demo script and a bounded assisted-audit pilot playbook with evidence-based launch criteria.
- Expanded the executable self-test to 13 cases, including direct execution of all 59 rules against representative n8n-style fixtures.

## 0.11.0 — 2026-09-21

- Added a dependency-free executable engine self-test command and required it in CI verification.
- Added an installable/offline web-app manifest, icon and service worker.
- Added privacy notice, security policy, preview license and a non-negotiable publication checklist.
- Added a versioned publication manifest with explicit 1.0 promotion criteria.

## 0.10.0 — 2026-09-21

- Repositioned WorkflowProof as a local automation preflight and clarified that it provides static evidence, not certification.
- Replaced key-only release sanitization with contextual header/form-value and content-pattern redaction for secrets, URLs and email-like evidence.
- Added redaction counts and a mandatory review warning to share-safe Release Packs.
- Fixed the dependency set and committed a matching lockfile for reproducible installations.
- Added clean-install type-check/build CI.
- Added product strategy, buyer-validation gates and launch-ready assisted-audit assets.

## 0.9.1 — 2026-09-21

- Added a sanitized Release Pack download that redacts operational identifiers without modifying the source workflow.
- Bound Risk Acceptance and Version Compare to deterministic finding fingerprints.
- Added local, workflow-scoped Risk Acceptance persistence.
- Replaced nullable proof data with explicit status/reason evidence.
- Reduced trigger-name false positives and blocked Error Workflow self-reference proposals.
- Restored the verified rule count to 59 and made the engine self-test assert the actual rule array.
- Kept the release below 1.0.0 because the production build is unverified in this environment.
