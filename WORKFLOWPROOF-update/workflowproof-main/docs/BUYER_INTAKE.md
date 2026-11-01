# WorkflowProof assisted-audit intake

Use this intake before accepting a paid assisted audit. It keeps the service bounded and prevents the analyst from receiving credentials or operating a customer system.

## What the buyer provides

- A sanitized n8n workflow JSON export or a WorkflowProof share-safe Release Pack.
- The workflow's business purpose in one or two sentences.
- The intended production change or handoff date.
- A contact who can explain whether a flagged operation is read-only, idempotent or financially/operationally sensitive.

## What the buyer must not provide

- Credentials, API keys, authentication headers, access tokens, password exports or production URLs.
- Customer personal data, payment details or real webhook URLs.
- Direct access to their n8n instance unless a separately agreed, least-privilege engagement makes that necessary.

## Delivery scope

The standard assisted audit delivers a report, prioritized evidence, a release recommendation, a remediation plan and (where appropriate) a share-safe evidence pack. It does not execute the workflow, change a live instance, certify security/compliance or guarantee production behavior.

## Required buyer decisions

Before any remediation is considered complete, the buyer must approve the proposed change, verify business behavior in their own environment and decide whether any remaining risk is accepted with an owner, rationale and expiry date.

## Intake close-out

Record the workflow version/date, delivery date, accepted risks, unresolved blockers and whether the buyer authorized an anonymized outcome summary. Do not publish a customer name, workflow detail or case study without written approval.
