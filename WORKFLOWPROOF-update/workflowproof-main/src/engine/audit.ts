import type { AuditReport, N8nWorkflow, RiskAcceptance, RuleContext, RuleIssue, ScoreBreakdown, Severity } from '../types/workflow';
import { buildGraph, countConnections } from './graph';
import { RULES } from './rules';
import { attachRepairGuidance } from './repair';

const weight: Record<Severity, number> = { critical: 12, high: 7, medium: 4, low: 2, info: 0 };
const dimensionWeights: Record<keyof ScoreBreakdown, number> = {
  reliability: 0.25,
  recovery: 0.20,
  dataSafety: 0.20,
  security: 0.20,
  maintainability: 0.10,
  aiSafety: 0.05,
};

function clamp(value: number) { return Math.max(0, Math.min(100, Math.round(value))); }

function grade(score: number): AuditReport['grade'] {
  if (score >= 95) return 'A';
  if (score >= 90) return 'B';
  if (score >= 80) return 'C';
  if (score >= 70) return 'D';
  return 'F';
}

export function productionGate(critical: number, high: number, medium: number, low: number) {
  if (critical > 0) {
    return {
      cap: 69,
      gate: 'blocked' as const,
      gateLabel: 'Production blocked',
      reason: 'At least one unresolved Critical finding blocks production readiness and caps the score at 69 until it is cleared or formally accepted.',
    };
  }
  if (high >= 3) {
    return {
      cap: 79,
      gate: 'hardening' as const,
      gateLabel: 'Needs hardening',
      reason: `${high} unresolved High findings cap Production Readiness at 79. Resolve or formally accept them before treating this workflow as production-ready.`,
    };
  }
  if (high > 0) {
    return {
      cap: 89,
      gate: 'hardening' as const,
      gateLabel: 'Needs hardening',
      reason: `${high} unresolved High finding${high === 1 ? '' : 's'} cap Production Readiness at 89.`,
    };
  }
  if (medium > 0) {
    return {
      cap: 94,
      gate: 'review' as const,
      gateLabel: 'Review recommended',
      reason: `${medium} unresolved Medium finding${medium === 1 ? '' : 's'} cap Production Readiness at 94 until reviewed, resolved, or formally accepted.`,
    };
  }
  if (low > 0) {
    return {
      cap: 99,
      gate: 'ready' as const,
      gateLabel: 'Production-ready with recommendations',
      reason: `${low} unresolved Low finding${low === 1 ? '' : 's'} prevent a perfect score but do not block a production-ready signal.`,
    };
  }
  return {
    cap: 100,
    gate: 'ready' as const,
    gateLabel: 'Production-ready signal',
    reason: undefined,
  };
}

function categoryScore(issues: RuleIssue[], category: string): number {
  const penalty = issues
    .filter((i) => i.category.toLowerCase() === category.toLowerCase())
    .reduce((sum, i) => sum + Math.max(i.scorePenalty, weight[i.severity] / 2), 0);
  return clamp(100 - penalty);
}

function weightedScore(breakdown: ScoreBreakdown): number {
  return clamp((Object.keys(dimensionWeights) as Array<keyof ScoreBreakdown>)
    .reduce((sum, key) => sum + breakdown[key] * dimensionWeights[key], 0));
}

function acceptanceIsActive(acceptance: RiskAcceptance | undefined) {
  if (!acceptance) return false;
  if (!acceptance.expiresAt) return true;
  const expiry = new Date(`${acceptance.expiresAt}T23:59:59.999Z`).getTime();
  return Number.isFinite(expiry) && expiry >= Date.now();
}

function issueKey(issue: Pick<RuleIssue, 'ruleId' | 'nodeName'>) {
  return `${issue.ruleId}::${issue.nodeName || 'workflow'}`;
}

export function validateWorkflowShape(raw: unknown): asserts raw is N8nWorkflow {
  if (!raw || typeof raw !== 'object') throw new Error('The file does not contain a JSON object.');
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.nodes)) throw new Error('This does not look like an n8n workflow: missing nodes array.');
  if (!obj.connections || typeof obj.connections !== 'object' || Array.isArray(obj.connections)) throw new Error('This does not look like an n8n workflow: missing connections object.');
  for (const node of obj.nodes as unknown[]) {
    if (!node || typeof node !== 'object' || typeof (node as Record<string, unknown>).name !== 'string' || typeof (node as Record<string, unknown>).type !== 'string') {
      throw new Error('At least one node is malformed or missing its name/type.');
    }
  }
  for (const [source, outputs] of Object.entries(obj.connections)) {
    if (!outputs || typeof outputs !== 'object' || Array.isArray(outputs)) throw new Error(`Invalid connection map at ${source}.`);
    for (const [port, groups] of Object.entries(outputs)) {
      if (!Array.isArray(groups)) throw new Error(`Invalid output list at ${source}.${port}.`);
      for (const [index, group] of groups.entries()) {
        if (group === null) continue; // An unconnected output can occupy a branch slot.
        if (!Array.isArray(group)) throw new Error(`Invalid branch at ${source}.${port}[${index}].`);
        for (const target of group) {
          if (!target || typeof target.node !== 'string' || !target.node.trim() ||
              typeof target.type !== 'string' || !target.type.trim() ||
              !Number.isSafeInteger(target.index) || target.index < 0) {
            throw new Error(`Invalid target at ${source}.${port}[${index}]. Re-export the workflow from n8n.`);
          }
        }
      }
    }
  }
}

function buildReport(workflow: N8nWorkflow, acceptances: RiskAcceptance[] = []): AuditReport {
  validateWorkflowShape(workflow);
  const graph = buildGraph(workflow);
  const ctx: RuleContext = {
    workflow,
    graph,
    nodes: workflow.nodes || [],
    enabledNodes: (workflow.nodes || []).filter((n) => !n.disabled),
  };

  const issues = RULES.flatMap((rule) => {
    try { return rule.evaluate(ctx); }
    catch (error) {
      console.warn(`Rule ${rule.id} failed`, error);
      throw new Error(`Audit incomplete: rule ${rule.id} could not evaluate this workflow. No readiness score was issued.`);
    }
  }).map(attachRepairGuidance);

  // An acceptance is tied to the exact finding fingerprint (issueId), not just a
  // rule and node name. A node can retain its name while its configuration and
  // risk change; carrying an old acceptance in that case would hide a new risk.
  const acceptanceMap = new Map(
    acceptances.filter(acceptanceIsActive).map((acceptance) => [acceptance.issueId, acceptance]),
  );
  const acceptedIssues = issues
    .map((issue) => ({ ...issue, acceptance: acceptanceMap.get(issue.id) }))
    .sort((a, b) => weight[b.severity] - weight[a.severity] || a.title.localeCompare(b.title));

  const counts = (sev: Severity) => acceptedIssues.filter((i) => i.severity === sev).length;
  const openIssues = acceptedIssues.filter((issue) => !acceptanceIsActive(issue.acceptance));
  const openCounts = (sev: Severity) => openIssues.filter((i) => i.severity === sev).length;

  // Technical dimension scores intentionally include accepted risks: accepting a risk changes governance,
  // not the underlying technical state of the workflow.
  const breakdown: ScoreBreakdown = {
    reliability: categoryScore(acceptedIssues, 'Reliability'),
    recovery: categoryScore(acceptedIssues, 'Recovery'),
    dataSafety: categoryScore(acceptedIssues, 'Data Safety'),
    security: categoryScore(acceptedIssues, 'Security'),
    maintainability: categoryScore(acceptedIssues, 'Maintainability'),
    aiSafety: categoryScore(acceptedIssues, 'AI Safety'),
  };

  const baseScore = weightedScore(breakdown);
  const gate = productionGate(openCounts('critical'), openCounts('high'), openCounts('medium'), openCounts('low'));
  const score = Math.min(baseScore, gate.cap);

  return {
    version: '0.12.0',
    generatedAt: new Date().toISOString(),
    workflowName: workflow.name || 'Unnamed workflow',
    score,
    grade: grade(score),
    scoring: {
      weightedBaseScore: baseScore,
      appliedCap: gate.cap,
      capReason: gate.reason,
      gate: gate.gate,
      gateLabel: gate.gateLabel,
      acceptedRiskCount: acceptedIssues.length - openIssues.length,
      openRiskCount: openIssues.length,
    },
    summary: {
      critical: counts('critical'), high: counts('high'), medium: counts('medium'), low: counts('low'), info: counts('info'),
      openCritical: openCounts('critical'), openHigh: openCounts('high'), openMedium: openCounts('medium'), openLow: openCounts('low'), openInfo: openCounts('info'),
      nodesAnalyzed: ctx.enabledNodes.length,
      connectionsAnalyzed: countConnections(workflow),
      rulesRun: RULES.length,
    },
    breakdown,
    issues: acceptedIssues,
  };
}

export function auditWorkflow(workflow: N8nWorkflow, acceptances: RiskAcceptance[] = []): AuditReport {
  return buildReport(workflow, acceptances);
}

export function applyRiskAcceptances(workflow: N8nWorkflow, acceptances: RiskAcceptance[]) {
  return buildReport(workflow, acceptances);
}
