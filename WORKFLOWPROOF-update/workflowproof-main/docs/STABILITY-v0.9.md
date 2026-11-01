# v0.9 stability notes

v0.9 keeps the 59-rule audit surface from v0.8 and focuses on evidence quality rather than adding more detection rules.

Stability goals:
- Compare Version must never silently discard an acceptance attached to an unchanged finding.
- A comparison must explain unchanged production scores when safety caps dominate the result.
- Release Pack must be self-contained enough for an agency/client review and include integrity evidence.
- Risk acceptance continues to alter governance only; technical dimension scores remain unchanged.

Expected engine self-test: 7/7.
