# v0.8 stability notes

This release is intended as a consolidation point rather than another narrow patch.

## Regression checks built into the product

Use **Run engine self-test** on the landing page. It checks:

- retry/timeout auto-fix detection
- re-audit after safe fixes
- webhook auth/dedup boundary detection
- production gate consistency when High findings remain
- readiness behavior for Low-only findings

## Manual acceptance criteria before public beta

- Import at least 20 exported workflows from different n8n node mixes.
- Confirm no crash in parser/graph reconstruction.
- Review every Critical/High finding for false-positive patterns.
- Exercise every proposal-ready repair with real exported node versions.
- Import the hardened output back into n8n before using it in production.
- Verify release pack and HTML reports do not expose secret values.

## Claims boundary

WorkflowProof provides static production-readiness analysis. It is not a penetration test, formal compliance certification, or proof that a workflow is correct at runtime.
