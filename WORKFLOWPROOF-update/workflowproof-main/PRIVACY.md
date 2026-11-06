# WorkflowProof privacy notice

Last updated: 2026-11-06

## Local processing

WorkflowProof processes the workflow JSON selected by the user in the browser. The built-in sample and command-line audit run without an account. Scanning a personal file in the hosted app requires a Supabase account. Authentication uses your email address. The app sends the report (including findings, evidence and node names), score, workflow name and filename to Supabase to manage credits and report history. Review and sanitize sensitive exports before scanning.

## Local browser storage

Risk Acceptances may be saved in the browser's local storage and are keyed to a SHA-256 fingerprint of the imported workflow. Clear browser site data to remove them. The app does not transmit that storage to WorkflowProof.

## Exports

Reports and Release Packs are generated as downloads chosen by the user. The standard Release Pack may contain workflow content and must be treated as sensitive. The share-safe export applies automated redaction but can miss unknown formats; review every export before sending it to another person or system.
