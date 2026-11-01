# QA record — v0.8

Validation performed before packaging:

- Engine TypeScript compiled with `tsc` successfully.
- Full `src/` tree passed TypeScript syntax/type checking with temporary React module shims (used only because the packaging environment does not contain npm-installed React types).
- Built-in engine self-test: **5/5 passed**.
- Real `Support_Triage_Bot_v2.json` parsed successfully: 13 enabled nodes / 13 connections / 59 rules.
- Webhook authentication proposal generated a Header Auth credential reference and re-audit removed `WEBHOOK_NO_AUTH_HINT`.
- Companion Error Workflow generator produced a two-node importable n8n workflow structure.
- Risk acceptance test preserved the weighted technical base score while changing the open-risk production gate.
- Version-comparison engine returned score delta plus new/resolved/unchanged finding sets.
- New-rule smoke tests detected remote plaintext HTTP, query-string secret and Execute Command patterns.

This is not a substitute for testing the final browser build on the user's npm environment. After `npm install`, run `npm run check`, `npm run build`, and the in-app **Run engine self-test** before public deployment.
