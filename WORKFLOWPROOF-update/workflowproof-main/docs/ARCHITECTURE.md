# WorkflowProof — Architecture v0.8

## Goal

Turn an exported n8n workflow into an explainable production-readiness assessment and controlled hardening workflow without sending the workflow to a server.

## Core flow

1. Validate the exported JSON shape.
2. Build a directed graph from `nodes` + `connections`.
3. Run 59 deterministic audit rules against nodes, parameters, graph context and workflow-level settings.
4. Aggregate findings into six technical dimensions.
5. Apply severity-aware production gates using only open risks.
6. Offer deterministic safe fixes where behavior is provably conservative.
7. Offer guided JSON proposals where user context is required.
8. Re-audit every approved change and verify whether the targeted finding disappeared.
9. Generate adversarial test cases for the risky parts of the workflow.
10. Optionally document formal risk acceptance without hiding or removing the technical finding.
11. Compare a candidate workflow against the current version.
12. Export release evidence for deployment review.

## Trust boundary

The app is local-first. The browser reads workflow files using the File API. The application has no backend and no workflow-upload path.

## Governance model

Formal risk acceptance is kept separate from technical remediation:

- the technical base score still includes accepted findings;
- accepted findings remain visible;
- an active acceptance can remove that issue from the production-gate count;
- expired acceptances stop affecting the gate.

## Repair safety model

Three repair modes exist:

- **SAFE AUTO-FIX** — deterministic, conservative changes that should not require business context.
- **GUIDED FIX** — WorkflowProof explains the change; supported cases can produce a previewable JSON patch requiring explicit approval.
- **MANUAL REVIEW** — static evidence is insufficient for a safe automated change.

Mutating HTTP requests are intentionally not auto-retried unless the tool can establish a safe retry context. Timeout hardening may still be applied independently.

## Important interfaces

- `N8nWorkflow`: tolerant representation of an n8n export.
- `GraphNode`: node plus incoming/outgoing node names.
- `AuditRule`: deterministic evaluator returning zero or more `RuleIssue` objects.
- `RuleIssue`: severity, impact, evidence, repair guidance and optional acceptance metadata.
- `AuditReport`: versioned output with technical score and production-gate data.
- `GuidedFixProposal`: explicit user-reviewed JSON mutation contract.
- `RiskAcceptance`: owner/reason/review metadata for a governance decision.
- `ComparisonResult`: new/resolved/unchanged findings between workflow versions.

## Future adapters

Keep risk semantics separate from the n8n parser. A future adapter can normalize Make/Zapier/Pipedream workflows into a generic automation graph before running common rules.
