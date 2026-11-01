# WorkflowProof roadmap

## v0.9 — Comparison evidence / release proof (current)
- Explain production-gate behavior during comparisons.
- Carry matching risk acceptances into candidate audits.
- Include acceptance carry metrics and regression signal.
- Strengthen Release Pack with SHA-256 integrity, decision summary, comparison evidence and self-test evidence.
- Expand self-test to 7/7.


## v0.1–v0.3 — Scanner + precision (done)
- Local n8n JSON import
- deterministic rules engine
- weighted scoring and production gates
- context-aware blast-radius severity

## v0.4–v0.6 — Repair + proposal engine (done)
- Safe Auto-Fix vs Guided Fix vs Manual Review
- exact before/after proposal preview
- explicit approval
- re-audit verification
- severity-aware production gates

## v0.8 — Stability / governance release
- 59 audit rules
- formal risk acceptance with owner/reason/expiry
- acceptance manifest import/export
- version comparison with new/resolved findings
- release-pack export
- built-in engine self-test
- Webhook auth proposals referencing existing n8n credentials
- companion Error Workflow generation
- synchronized engine/repair versioning

## Next: beta hardening
- version-aware n8n node capability registry
- larger fixture corpus across core/community nodes
- undo/proposal history
- confidence levels and false-positive feedback
- more proposal adapters where mutations can be proven safe
- signed/tamper-evident release evidence

## Runtime test phase
- mock HTTP provider
- duplicate webhook replay
- 429/500/timeout injection
- malformed/null/schema-drift payload generation
- pass/fail execution evidence

## Commercial layer
- optional accounts
- team/workspace model
- agency-branded reports
- billing/licensing
- CI/CD gate integration

## Platform direction
- customer-owned n8n instance integration where licensing permits
- regression monitoring on workflow change
- Make/Zapier adapter research
