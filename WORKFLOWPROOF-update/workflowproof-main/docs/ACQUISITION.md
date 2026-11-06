# WorkflowProof · Acquisition brief

Seller's minimum asking price for a full acquisition: **USD 7,000**. The USD 49 assisted review advertised in the app is a separate service. Revenue, customers and an independent valuation are unverified.

## Five-minute technical review

1. Choose **Run a safe demo**, apply the available safe changes and compare remaining findings with the original report.
2. Choose **Test a broken connection** from the landing page. Inspect the Critical finding, missing endpoint and blocked production gate.
3. Run `npm ci` and `npm run verify` from the app directory. The suite includes 13 engine checks and seven command-line cases.
4. Run `node scripts/audit-workflow.cjs <sanitized-workflow.json>`. Inspect the JSON report and process exit code. Try a renamed or deleted destination to reproduce the graph check.
5. Evaluate one representative agency handoff. Record review time, incorrect findings and missed defects, then re-import and execute a sanitized copy in a staging n8n instance.

## Transfer scope to agree with the buyer

The proposed asset is the application source, rule catalog, fixtures, tests, build instructions and database setup. The buyer can run the engine locally and configure its own hosting and Supabase project. Verify ownership, third-party terms, deployment and a clean-room account/signup/scan test before signing. Agree separately on support hours, hosting migration and brand rights. Customer data, provider accounts and credentials are outside this proposed package.
