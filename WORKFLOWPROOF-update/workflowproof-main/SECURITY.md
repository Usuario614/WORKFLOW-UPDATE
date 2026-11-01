# WorkflowProof security policy

## Scope

WorkflowProof is a local static-analysis tool. It must not be represented as penetration testing, a compliance attestation, or a guarantee that a workflow is secure or production-ready.

## Reporting a vulnerability

Report suspected vulnerabilities to [nuvekoia@gmail.com](mailto:nuvekoia@gmail.com).

Do not include live workflow exports, API keys, credentials, customer data or production URLs. Include minimal reproduction steps and sanitized fixtures instead.

## Security release rules

- Never commit real workflow exports, secrets, credentials, tokens, customer data or production URLs.
- Run `npm run verify` on a clean dependency installation before release.
- Test the share-safe export with intentionally sensitive fixtures before claiming it reduces disclosure risk.
- Rotate any secret discovered in a real workflow; redaction does not make an exposed secret safe.
