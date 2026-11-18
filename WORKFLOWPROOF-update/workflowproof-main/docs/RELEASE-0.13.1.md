# WFP 0.13.1: local evaluation and accurate review evidence

An interested buyer can now analyze their own n8n JSON without an account or Supabase configuration. Local scans do not consume cloud credits or automatically save reports. Optional cloud history uses a separate save action with a disclosure of the report contents sent to Supabase. A cloud-save failure leaves the local result available.

The landing page links directly to a synthetic sample audit. The USD 49 assisted-review pilot retains its scope, follow-up review and target delivery after valid intake. The sample explicitly separates static findings from behavior that must be tested in n8n.

Version comparison distinguishes changed-but-still-present findings from resolutions and new findings. Risk acceptance still depends on an exact fingerprint; changed evidence cannot inherit an old acceptance. Engine and UI versions now identify this release consistently.

Graph traversal uses an indexed queue and marks nodes on enqueue to avoid repeatedly shifting arrays and scheduling shared descendants. Cyclic graphs and traversal ordering are covered by regression checks. `node scripts/benchmark-graph.cjs` compares traversal against the previous algorithm on a synthetic 15,002-node fan-out/fan-in graph; it is a microbenchmark, not an overall application speed guarantee.

Validation: `npm run verify` covers TypeScript, 16 engine self-test scenarios, 7 CLI/graph regression cases and the production build. Browser checks cover account-free file import, before/after comparison and export. Optional Supabase sign-in and cloud saving need a configured test account and were not exercised in this environment.

Remaining limits: static idempotency hints do not prove duplicate prevention, business outcomes require execution in n8n, and no paid pilot or sale is implied by this release.
