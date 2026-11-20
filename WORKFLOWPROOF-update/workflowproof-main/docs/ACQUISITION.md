# WorkflowProof acquisition evaluation

Start with the [buyer evaluation page](https://workflow-updatev1.onrender.com/acquire.html) and the [CRM handoff report](https://workflow-updatev1.onrender.com/sample-audit.html). The USD 49 assisted review advertised in the app covers one workflow. A full asset acquisition has its own scope and written agreement.

## Technical baseline

The v0.13.1 product baseline with 60 rules is commit [b2d4c12a7dcf11ef84f47ac2a59797d6490aa683](https://github.com/Usuario614/WORKFLOW-UPDATE/commit/b2d4c12a7dcf11ef84f47ac2a59797d6490aa683) in WORKFLOW-UPDATE. The application directory is `WORKFLOWPROOF-update/workflowproof-main`. Identify the proposed handover revision by full SHA in the agreement and run the verification below from a fresh checkout of that SHA.

```sh
cd WORKFLOWPROOF-update/workflowproof-main
npm ci
npm run verify
```

Local scans work without account configuration. For a handover that includes optional cloud history, validate signup and persistence with a buyer-controlled test Supabase project using the setup documentation.

## Evaluate one handoff

Choose a sanitized workflow the agency has already reviewed. Run the static review locally, compare findings with the existing review, and record:

| Measure | What to capture |
| --- | --- |
| Review time | Minutes spent in the original review and the assisted review |
| Findings | Useful, incorrect, known and missed findings with examples |
| Release decision | Any change to what the team fixes, tests, documents or accepts |
| Adoption | What would need to change in the agency's handoff process |

Validate execution in staging with synthetic data. The buyer can share a redacted summary without sending the workflow export.

## Transfer scope

Confirm the application source, rule catalog, fixtures, tests, build instructions, database setup and agreed handover. Review transferable rights, third-party terms, brand rights and support separately. Provider accounts, credentials and customer data stay with their respective owners.
