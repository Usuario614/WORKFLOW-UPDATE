import type { N8nWorkflow, RiskAcceptance, SelfTestResult } from '../types/workflow';
import { auditWorkflow } from './audit';
import { applySafeFixes } from './fixes';
import { compareReports } from './compare';
import { buildGraph } from './graph';
import { RULES, RULE_COUNT } from './rules';
import { sanitizeForSharingWithSummary } from './sanitize';
import { createGuidedProposal, materializeGuidedProposal } from './proposals';

const riskyHttp: N8nWorkflow = {
  name: 'Self-test risky HTTP', active: false,
  nodes: [
    { id: '1', name: 'Manual Trigger', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0,0], parameters: {} },
    { id: '2', name: 'Write API', type: 'n8n-nodes-base.httpRequest', typeVersion: 4, position: [250,0], parameters: { method: 'GET', url: 'https://example.com/api/read' } },
  ],
  connections: { 'Manual Trigger': { main: [[{ node: 'Write API', type: 'main', index: 0 }]] } },
  settings: { executionOrder: 'v1' },
};

const publicWebhook: N8nWorkflow = {
  name: 'Self-test public webhook', active: false,
  nodes: [
    { id: '1', name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0,0], parameters: { path: 'self-test', httpMethod: 'POST' } },
    { id: '2', name: 'Send Email', type: 'n8n-nodes-base.gmail', typeVersion: 2, position: [250,0], parameters: { sendTo: 'ops@example.com', subject: 'x', message: 'x' } },
  ],
  connections: { Webhook: { main: [[{ node: 'Send Email', type: 'main', index: 0 }]] } },
  settings: { executionOrder: 'v1' },
};

const lowOnly: N8nWorkflow = {
  name: 'Self-test low-only', active: false,
  nodes: [
    { id: '1', name: 'Manual Trigger', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0,0], parameters: {} },
    { id: '2', name: 'Local API', type: 'n8n-nodes-base.httpRequest', typeVersion: 4, position: [250,0], retryOnFail: true, maxTries: 3, waitBetweenTries: 2000, parameters: { method: 'GET', url: 'http://127.0.0.1:11434/api/tags', options: { timeout: 30000 } } },
  ],
  connections: { 'Manual Trigger': { main: [[{ node: 'Local API', type: 'main', index: 0 }]] } },
  settings: { executionOrder: 'v1' },
};

export function runSelfTest(): SelfTestResult {
  const cases: SelfTestResult['cases'] = [];
  const risky = auditWorkflow(riskyHttp);
  cases.push({
    name: 'Safe auto-fix detection',
    passed: risky.issues.some((i) => i.ruleId === 'HTTP_NO_RETRY') && risky.issues.some((i) => i.ruleId === 'HTTP_NO_TIMEOUT_HINT'),
    details: 'Risky HTTP request should require retry and timeout hardening.',
  });
  const fixed = applySafeFixes(riskyHttp, risky);
  const fixedReport = auditWorkflow(fixed.workflow);
  cases.push({
    name: 'Auto-fix re-audit',
    passed: !fixedReport.issues.some((i) => i.ruleId === 'HTTP_NO_RETRY' || i.ruleId === 'HTTP_NO_TIMEOUT_HINT'),
    details: 'After deterministic hardening, retry/timeout findings should be gone.',
  });
  const webhook = auditWorkflow(publicWebhook);
  cases.push({
    name: 'Webhook boundary checks',
    passed: webhook.issues.some((i) => i.ruleId === 'WEBHOOK_NO_AUTH_HINT') && webhook.issues.some((i) => i.ruleId === 'WEBHOOK_SIDE_EFFECT_NO_DEDUP'),
    details: 'Public side-effecting webhook should trigger auth and deduplication findings.',
  });
  cases.push({
    name: 'Production gate consistency',
    passed: webhook.summary.high > 0 && webhook.scoring.gate !== 'ready' && webhook.score <= 89,
    details: 'Open High findings must prevent a production-ready signal.',
  });
  const low = auditWorkflow(lowOnly);
  cases.push({
    name: 'Low-only readiness',
    passed: low.summary.critical === 0 && low.summary.high === 0 && low.summary.medium === 0 && low.scoring.gate === 'ready',
    details: 'A workflow with only Low/Info findings may remain production-ready with recommendations.',
  });

  const acceptedIssue = webhook.issues.find((i) => i.severity === 'high');
  let acceptedReport = webhook;
  let acceptance: RiskAcceptance | undefined;
  if (acceptedIssue) {
    acceptance = {
      issueId: acceptedIssue.id,
      ruleId: acceptedIssue.ruleId,
      nodeName: acceptedIssue.nodeName,
      owner: 'Self-test',
      reason: 'Self-test compensating control for governance validation.',
      acceptedAt: new Date().toISOString(),
    };
    acceptedReport = auditWorkflow(publicWebhook, [acceptance]);
  }
  cases.push({
    name: 'Risk acceptance governance',
    passed: Boolean(acceptance) && acceptedReport.scoring.weightedBaseScore === webhook.scoring.weightedBaseScore && (acceptedReport.scoring.acceptedRiskCount || 0) === 1 && (acceptedReport.scoring.openRiskCount || 0) === webhook.issues.length - 1,
    details: 'Accepting a risk must preserve the technical score while changing only open-risk governance counts.',
  });

  const comparedCandidate = auditWorkflow(publicWebhook, acceptance ? [acceptance] : []);
  const comparison = compareReports(acceptedReport, comparedCandidate);
  cases.push({
    name: 'Comparison acceptance carry',
    passed: Boolean(acceptance) && comparison.carriedAcceptances === 1 && comparison.acceptanceCarryFailures === 0 && comparison.gateExplanation.length > 20,
    details: 'Matching accepted risks should carry into the candidate and comparison should explain the production gate.',
  });

  cases.push({
    name: 'Rule catalog integrity',
    passed: RULE_COUNT === 60 && new Set(RULES.map((rule) => rule.id)).size === RULE_COUNT && RULES.every((rule) => rule.title && rule.category && rule.scorePenalty >= 0),
    details: 'All 60 shipped rules have unique identifiers and complete scoring metadata.',
  });

  let ruleExecutionFailure = '';
  try {
    for (const fixture of [riskyHttp, publicWebhook, lowOnly]) {
      const context = { workflow: fixture, graph: buildGraph(fixture), nodes: fixture.nodes, enabledNodes: fixture.nodes.filter((node) => !node.disabled) };
      for (const rule of RULES) {
        const result = rule.evaluate(context);
        if (!Array.isArray(result)) throw new Error(`${rule.id} did not return an issue array.`);
      }
    }
  } catch (error) {
    ruleExecutionFailure = error instanceof Error ? error.message : 'Unknown rule execution error.';
  }
  cases.push({
    name: 'Rule execution compatibility matrix',
    passed: ruleExecutionFailure.length === 0,
    details: ruleExecutionFailure || 'Each shipped rule executed against HTTP, webhook and retry-enabled current n8n-style fixtures.',
  });

  const nodeBoundAcceptance = webhook.issues.find((issue) => issue.ruleId === 'WEBHOOK_NO_AUTH_HINT');
  const changedWebhook: N8nWorkflow = structuredClone(publicWebhook);
  changedWebhook.nodes[0].parameters = { ...changedWebhook.nodes[0].parameters, path: 'materially-changed-webhook-path' };
  const changedReport = auditWorkflow(changedWebhook, nodeBoundAcceptance ? [{ issueId: nodeBoundAcceptance.id, ruleId: nodeBoundAcceptance.ruleId, nodeName: nodeBoundAcceptance.nodeName, owner: 'Self-test', reason: 'Test stale acceptance behavior.', acceptedAt: new Date().toISOString() }] : []);
  const changedBaseline = auditWorkflow(publicWebhook, nodeBoundAcceptance ? [{ issueId: nodeBoundAcceptance.id, ruleId: nodeBoundAcceptance.ruleId, nodeName: nodeBoundAcceptance.nodeName, owner: 'Self-test', reason: 'Test stale acceptance behavior.', acceptedAt: new Date().toISOString() }] : []);
  const changedComparison = compareReports(changedBaseline, changedReport);
  cases.push({
    name: 'Acceptance fingerprint safety',
    passed: Boolean(nodeBoundAcceptance) && changedComparison.acceptanceCarryFailures >= 1 && changedReport.issues.some((issue) => issue.ruleId === nodeBoundAcceptance?.ruleId && !issue.acceptance),
    details: 'A materially changed node cannot inherit a previous acceptance merely because its name is unchanged.',
  });

  const mutating: N8nWorkflow = structuredClone(riskyHttp);
  mutating.nodes[1].parameters = { method: 'POST', url: 'https://example.com/orders' };
  const mutatingFixed = applySafeFixes(mutating, auditWorkflow(mutating));
  cases.push({
    name: 'Mutating retries are never auto-enabled',
    passed: !mutatingFixed.workflow.nodes[1].retryOnFail && !mutatingFixed.applied.some((change) => change.ruleId === 'HTTP_NO_RETRY'),
    details: 'Auto-fix must not enable retries for a POST request without demonstrated idempotency.',
  });

  const shareFixture = {
    workflow: { id: 'workflow-123', name: 'Customer sync', nodes: [{ id: 'node-1', name: 'Send', webhookId: 'hook-1', credentials: { api: { id: 'credential-1' } }, parameters: { url: 'https://internal.example.test/hook', headerParameters: { parameters: [{ name: 'Authorization', value: 'Bearer top-secret-token-value' }] }, body: 'Callback https://internal.example.test/hook?token=not-for-sharing', evidence: 'customer@example.com' } }] },
    sourceFile: 'customer-prod.json',
  };
  const sanitized = sanitizeForSharingWithSummary(shareFixture);
  cases.push({
    name: 'Sanitized release evidence',
    passed: sanitized.redactions >= 7 && JSON.stringify(sanitized.value).includes('workflow-123') === false && JSON.stringify(sanitized.value).includes('credential-1') === false && JSON.stringify(sanitized.value).includes('internal.example.test') === false && JSON.stringify(sanitized.value).includes('top-secret-token-value') === false && JSON.stringify(sanitized.value).includes('customer@example.com') === false && JSON.stringify(shareFixture).includes('top-secret-token-value'),
    details: 'Share mode removes IDs, credential references, headers, URLs and email-like evidence without mutating the source object.',
  });

  const errorWorkflow: N8nWorkflow = { ...riskyHttp, id: 'same-workflow', nodes: [...riskyHttp.nodes, { id: '3', name: 'Checkpoint', type: 'n8n-nodes-base.set', typeVersion: 3, position: [500, 0], parameters: {} }] };
  const errorIssue = auditWorkflow(errorWorkflow).issues.find((issue) => issue.ruleId === 'NO_ERROR_WORKFLOW');
  const proposal = errorIssue ? createGuidedProposal(errorIssue, errorWorkflow) : null;
  const selfReference = proposal && errorIssue ? materializeGuidedProposal(proposal, errorIssue, errorWorkflow, { errorWorkflowId: 'same-workflow' }) : null;
  cases.push({
    name: 'Guided error workflow rejects self-reference',
    passed: selfReference?.ready === false,
    details: 'Guided Fix refuses to configure an Error Workflow that points back to the audited workflow.',
  });

  return { passed: cases.every((item) => item.passed), generatedAt: new Date().toISOString(), cases };
}
