# WorkflowProof 9/10 publication gate

This is the minimum gate for public publication. Every item must be evidenced; no item may be marked complete because the product merely compiles.

## A. Release integrity

- [ ] Fresh clone succeeds with `npm ci` on Node 20.
- [ ] `npm run verify` passes locally and in GitHub Actions.
- [ ] Release artifact is built from the same commit whose CI run passed.
- [ ] Version, `package.json`, lockfile, release manifest and in-app footer match.
- [ ] No `latest` dependencies, untracked generated output or real customer workflow exports are included.

## B. Security and privacy

- [ ] Share-safe export is tested against credentials, authorization headers, JWTs, URLs, query secrets, emails, IDs and nested n8n parameter shapes.
- [ ] Manual review confirms the share-safe fixture contains no intentionally planted secret or identifier.
- [ ] `PRIVACY.md`, `SECURITY.md` and `LICENSE.md` are completed with a real business/contact identity before publication.
- [ ] The product never claims certification, compliance, complete detection or guaranteed production readiness.

## C. Product experience

- [ ] First-run scan works with a current n8n export and explains local processing.
- [ ] Invalid JSON, malformed exports and empty workflows have understandable recovery messages.
- [ ] Production blocks, accepted risks, uncertainty and remediation boundaries are visible without reading documentation.
- [ ] The PWA is tested on Chrome/Edge: install, reload and offline-after-first-load behavior.
- [ ] A non-technical buyer can understand the difference between report, share-safe pack, guided proposal and actual workflow change.

## D. Buyer evidence

- [ ] Five paid assisted audits have been delivered without inventing findings or guarantees.
- [ ] At least three buyers explain a repeated need for workflow evidence, comparison or governance.
- [ ] One anonymized case study documents finding, evidence, approved remediation and re-audit result.
- [ ] Pricing and delivery scope are validated against buyer objections, not guessed from feature count.

## E. Publication assets

- [ ] Landing page/demo video shows a real sanitized workflow scan.
- [ ] Sales copy uses the approved product boundary and privacy language.
- [ ] Refund, support and vulnerability-contact routes exist before taking payment.
- [ ] Checkout and storefront are tested with a non-production product before public publication.

If any box is empty, the release is a private candidate or paid assisted service—not a public 1.0 product.
