# Scoring and production gates — v0.9

v0.9 retains the v0.8 scoring model.

Technical dimension scores include all findings, including formally accepted risks. Risk acceptance is governance evidence, not a technical remediation.

Production safety caps use only unresolved/unaccepted findings:
- any Critical: max 69;
- 3+ High: max 79;
- 1–2 High: max 89;
- Medium only: max 94;
- Low only: max 99;
- no Critical/High/Medium/Low: max 100.

Compare Version reports both weighted technical scores and capped production scores. When both versions remain under the same safety cap, v0.9 explains why the production score can remain unchanged despite resolved/new findings.
