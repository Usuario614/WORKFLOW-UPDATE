# WorkflowProof v0.9 changelog

## Comparison evidence
- Compare Version now derives active risk acceptances from the audited baseline itself before auditing the candidate.
- Comparison explicitly reports baseline/candidate production score, weighted technical score, open Critical/High counts and accepted-risk counts.
- Adds acceptance carry metrics: carried, resolved and failed-to-carry.
- Adds a human-readable production-gate explanation, especially when score remains unchanged because both versions are capped at the same gate.
- Classifies the change as improved, regressed, mixed or unchanged.

## Release evidence
- Release Pack now includes SHA-256 fingerprint of the current workflow JSON.
- Adds release-decision summary, open findings by severity, accepted-risk count, proof summary, current comparison evidence and engine self-test evidence.
- Adds explicit evidence-policy metadata.

## QA / stability
- Engine self-test expanded from 5 to 7 checks.
- Added governance self-test and comparison acceptance-carry self-test.
- Added src/vite-env.d.ts so npm run check recognizes CSS side-effect imports.
