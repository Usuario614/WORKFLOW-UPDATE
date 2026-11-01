# WorkflowProof product strategy

## The product

**WorkflowProof is the local preflight check for n8n workflows.** Before an automation is deployed, shared, or handed to a client, builders use it to find static evidence of reliability, duplicate-action, security, data-safety and AI-risk gaps.

It is not a security certification and must never be marketed as one.

## Initial buyer and job to be done

Start with freelance n8n builders and small automation agencies. Their practical job is: *“Before I activate or hand off a workflow, help me avoid an embarrassing or costly failure without giving a third party my workflow, credentials, or customer data.”*

The initial wedge is n8n because its exported workflow JSON is portable and reviewable. The architecture should eventually support adapters for other automation platforms, but adding platforms before n8n adoption is validated is out of scope.

## Product-led growth loop

1. A builder scans a workflow locally for free.
2. The builder fixes or formally accepts findings and exports a share-safe evidence pack.
3. The evidence pack becomes part of a client handoff, code review, or agency delivery.
4. The recipient asks for the same evidence on the next workflow.
5. Teams pay when they need history, policy enforcement, collaboration and CI integration.

## Packaging

| Tier | Buyer | Promise | Price hypothesis |
| --- | --- | --- | --- |
| Free Local | Individual builder | Scan one export locally, see findings, export evidence | $0 |
| Assisted Audit | Freelancer / small business | One workflow scan plus bounded human review and prioritized remediation plan | Launch at $49; test $79 after 5 paid deliveries |
| Agency Pack | Automation agency | Up to three workflow reviews, share-safe evidence, comparison and a handoff checklist | Launch at $149; test $249 after repeat use |
| Team / CI | Agency or internal automation team | Policy packs, version history, approved-risk controls and CI gate | Do not price or build until repeated team demand is observed |

Do not sell an unsupported subscription. First sell an assisted audit to verify which reports, rules and remediation outcomes buyers actually value.

## Non-negotiable product principles

- Local-first means workflow content is processed in the browser unless a future feature explicitly says otherwise.
- A safety signal must include evidence, uncertainty and a remediation boundary.
- Accepted risks remain visible and retain technical penalties.
- Never auto-change business logic, create credentials, expose secrets or enable unsafe mutation retries.
- A share-safe export is labelled as redacted evidence, never as a guarantee that it is safe to disclose.

## Validation gates

Do not build the Team tier until all of these are true:

1. Five paid assisted audits have been delivered.
2. At least three buyers report a repeated need for workflow review or handoff evidence.
3. At least two buyers ask for version history, a policy gate or multi-workflow visibility.
4. The product has a clean CI build and a fixture suite covering every shipped rule.

## Metrics that matter

- Activation: a visitor scans a real workflow and exports a report.
- Evidence sharing: share-safe packs exported per completed scan.
- Value: findings confirmed, fixed, or formally accepted after review.
- Revenue validation: paid audits, repeat buyers and referrals.
- Retention signal: the same buyer scans a second workflow within 30 days.

Do not use downloads, page views or generic signups as proof of product-market fit.
