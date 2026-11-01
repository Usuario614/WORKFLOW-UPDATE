import type { AppliedFix, AuditReport, N8nWorkflow } from '../types/workflow';
import { isHttp } from './helpers';

export interface FixResult {
  workflow: N8nWorkflow;
  applied: AppliedFix[];
}

function ensureHttpTimeout(node: N8nWorkflow['nodes'][number], timeoutMs = 30000): boolean {
  if (!isHttp(node)) return false;
  const parameters = (node.parameters ||= {});
  const currentOptions = parameters.options;
  const options = currentOptions && typeof currentOptions === 'object' && !Array.isArray(currentOptions)
    ? currentOptions as Record<string, unknown>
    : {};

  if (typeof options.timeout === 'number' && options.timeout > 0) return false;
  parameters.options = { ...options, timeout: timeoutMs };
  return true;
}

export function applySafeFixes(original: N8nWorkflow, report: AuditReport): FixResult {
  const workflow = structuredClone(original);
  const applied: AppliedFix[] = [];

  const retryIssues = report.issues.filter((i) => i.ruleId === 'HTTP_NO_RETRY' && i.nodeName);
  const timeoutIssues = report.issues.filter((i) => i.ruleId === 'HTTP_NO_TIMEOUT_HINT' && i.nodeName);

  for (const issue of retryIssues) {
    const node = workflow.nodes.find((n) => n.name === issue.nodeName);
    if (!node || !isHttp(node)) continue;
    const method = String((node.parameters || {}).method || (node.parameters || {}).httpMethod || 'GET').toLowerCase();
    if (!['get', 'head', 'options'].includes(method)) continue;
    const before = Boolean(node.retryOnFail) && Number(node.maxTries || 0) >= 3 && Number(node.waitBetweenTries || 0) >= 2000;
    if (before) continue;
    node.retryOnFail = true;
    node.maxTries = Math.max(Number(node.maxTries || 0), 3);
    node.waitBetweenTries = Math.max(Number(node.waitBetweenTries || 0), 2000);
    applied.push({
      ruleId: issue.ruleId,
      nodeName: node.name,
      description: `${node.name}: enabled bounded retry (3 attempts minimum, 2000ms wait minimum)`,
    });
  }

  for (const issue of timeoutIssues) {
    const node = workflow.nodes.find((n) => n.name === issue.nodeName);
    if (!node || !isHttp(node)) continue;
    if (ensureHttpTimeout(node)) {
      applied.push({
        ruleId: issue.ruleId,
        nodeName: node.name,
        description: `${node.name}: added a 30000ms HTTP timeout`,
      });
    }
  }

  // v0.4 deliberately does NOT add notes and count them as hardening.
  // Documentation suggestions remain Manual Review items and cannot raise the risk score by themselves.
  return { workflow, applied };
}
