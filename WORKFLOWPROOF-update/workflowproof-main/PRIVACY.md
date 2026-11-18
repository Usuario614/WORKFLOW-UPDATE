# WorkflowProof privacy notice

Last updated: 2026-11-18

## Local processing

WorkflowProof processes the workflow JSON selected by the user in the browser. All local scans, including personal files, run without an account. Local scanning does not upload the workflow or report. If configured, optional authentication uses your email address. Only the explicit “Save this report to my account” action sends the full report (including findings, evidence and node names), score, workflow name and filename to Supabase and consumes a cloud-save credit. Review and sanitize sensitive information before choosing to save. Local analysis and downloads remain available if the cloud save fails.

## Local browser storage

Risk Acceptances may be saved in the browser's local storage and are keyed to a SHA-256 fingerprint of the imported workflow. Clear browser site data to remove them. The app does not transmit that storage to WorkflowProof.

## Exports

Reports and Release Packs are generated as downloads chosen by the user. The standard Release Pack may contain workflow content and must be treated as sensitive. The share-safe export applies automated redaction but can miss unknown formats; review every export before sending it to another person or system.
