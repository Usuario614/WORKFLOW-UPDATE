# QA record — v0.9

Validation performed before packaging:

1. **Engine TypeScript strict compilation** — PASS.
2. **Application TS/TSX syntax/type-shape pass with React stubs** — PASS.
3. **Engine Self-Test** — 7/7 PASS:
   - Safe auto-fix detection
   - Auto-fix re-audit
   - Webhook boundary checks
   - Production gate consistency
   - Low-only readiness
   - Risk acceptance governance
   - Comparison acceptance carry
4. **Real Support Triage Bot v1 → v2 comparison**:
   - production score 79 → 79;
   - 2 resolved findings;
   - 5 new findings;
   - 15 unchanged findings;
   - explanation correctly states both versions remain safety-capped at 79.
5. **Risk acceptance carry test on a common High finding**:
   - baseline accepted: 1;
   - candidate accepted: 1;
   - carried acceptances: 1;
   - carry failures: 0.

Note: npm dependencies are intentionally not bundled. Run `npm install` before `npm run check` / `npm run dev`.
