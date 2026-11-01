# Scoring and production gates — v0.8

WorkflowProof deliberately separates **technical quality** from **deployment governance**.

## Technical dimension score

The six dimensions are weighted:

- Reliability 25%
- Recovery 20%
- Data Safety 20%
- Security 20%
- Maintainability 10%
- AI Safety 5%

All detected findings contribute to dimension penalties, including formally accepted risks. Accepting risk does not make the underlying workflow safer.

## Production gate

The headline score is `min(weighted base score, severity gate cap)` using only **open** (not actively accepted) findings:

- Critical open: cap 69, Production blocked
- 3+ High open: cap 79, Needs hardening
- 1–2 High open: cap 89, Needs hardening
- Medium open only: cap 94, Review recommended
- Low open only: cap 99, Production-ready with recommendations
- Info only / no findings: cap 100, Production-ready signal

## Formal risk acceptance

An active acceptance requires:

- risk owner
- reason / compensating controls
- acceptance timestamp
- optional expiry / review date

Accepted findings remain visible in the UI and exported report. They keep their technical penalties but are removed from the open-risk count used by the production gate. Expired acceptances no longer affect the gate.

This model prevents governance decisions from masquerading as technical remediation.
