import type { AuditReport, ComparisonResult, RuleIssue } from '../types/workflow';

function key(issue: RuleIssue) {
  // `id` contains the deterministic finding fingerprint. Comparisons must not
  // label a changed configuration as unchanged simply because a node kept its
  // display name.
  return issue.id;
}

function locationKey(issue: Pick<RuleIssue, 'ruleId' | 'nodeName'>) {
  return `${issue.ruleId}::${issue.nodeName || 'workflow'}`;
}

function openCounts(report: AuditReport) {
  return {
    critical: report.summary.openCritical ?? report.summary.critical,
    high: report.summary.openHigh ?? report.summary.high,
    medium: report.summary.openMedium ?? report.summary.medium,
    low: report.summary.openLow ?? report.summary.low,
  };
}

function gateExplanation(baseline: AuditReport, candidate: AuditReport, resolved: number, introduced: number) {
  const baseOpen = openCounts(baseline);
  const candOpen = openCounts(candidate);
  if (candidate.score === baseline.score) {
    if (candidate.scoring.appliedCap === baseline.scoring.appliedCap && candidate.scoring.appliedCap < 100) {
      return `Production score is unchanged because both versions remain capped at ${candidate.scoring.appliedCap}. Candidate still has ${candOpen.critical} open Critical, ${candOpen.high} open High and ${candOpen.medium} open Medium findings. ${resolved} finding(s) were resolved and ${introduced} new finding(s) were introduced.`;
    }
    return `Production score is unchanged. ${resolved} finding(s) were resolved, ${introduced} new finding(s) were introduced, and the current production gate remains ${candidate.scoring.gateLabel}.`;
  }
  if (candidate.score > baseline.score) {
    return `Production score improved by ${candidate.score - baseline.score}. Open High findings changed from ${baseOpen.high} to ${candOpen.high}; gate is now ${candidate.scoring.gateLabel}.`;
  }
  return `Production score decreased by ${baseline.score - candidate.score}. Open High findings changed from ${baseOpen.high} to ${candOpen.high}; candidate gate is ${candidate.scoring.gateLabel}.`;
}

export function compareReports(baseline: AuditReport, candidate: AuditReport): ComparisonResult {
  const base = new Map(baseline.issues.map((issue) => [key(issue), issue]));
  const next = new Map(candidate.issues.map((issue) => [key(issue), issue]));
  const nextLocations = new Set(candidate.issues.map(locationKey));
  const newIssues = candidate.issues.filter((issue) => !base.has(key(issue)));
  const resolvedIssues = baseline.issues.filter((issue) => !next.has(key(issue)));
  const unchangedIssues = candidate.issues.filter((issue) => base.has(key(issue)));

  const baselineAcceptedKeys = new Set(baseline.issues.filter((i) => i.acceptance).map(key));
  const candidateAcceptedKeys = new Set(candidate.issues.filter((i) => i.acceptance).map(key));
  const carriedAcceptances = [...candidateAcceptedKeys].filter((k) => baselineAcceptedKeys.has(k)).length;
  const acceptedBaselineIssues = baseline.issues.filter((issue) => issue.acceptance);
  // A changed finding on the same rule/node has not been resolved: its old
  // governance decision is stale and must be reviewed explicitly.
  const resolvedAcceptedRisks = acceptedBaselineIssues.filter((issue) => !nextLocations.has(locationKey(issue))).length;
  const acceptanceCarryFailures = acceptedBaselineIssues.filter((issue) => !next.has(key(issue)) && nextLocations.has(locationKey(issue))).length;

  const newSerious = newIssues.filter((i) => i.severity === 'critical' || i.severity === 'high').length;
  const resolvedSerious = resolvedIssues.filter((i) => i.severity === 'critical' || i.severity === 'high').length;
  let changeSignal: ComparisonResult['changeSignal'] = 'unchanged';
  if (newSerious > 0 && resolvedSerious > 0) changeSignal = 'mixed';
  else if (newSerious > 0 || candidate.score < baseline.score) changeSignal = 'regressed';
  else if (resolvedSerious > 0 || candidate.score > baseline.score) changeSignal = 'improved';
  else if (newIssues.length || resolvedIssues.length) changeSignal = 'mixed';

  return {
    baselineName: baseline.workflowName,
    candidateName: candidate.workflowName,
    baseline,
    candidate,
    scoreDelta: candidate.score - baseline.score,
    weightedDelta: candidate.scoring.weightedBaseScore - baseline.scoring.weightedBaseScore,
    newIssues,
    resolvedIssues,
    unchangedIssues,
    carriedAcceptances,
    resolvedAcceptedRisks,
    acceptanceCarryFailures,
    gateExplanation: gateExplanation(baseline, candidate, resolvedIssues.length, newIssues.length),
    changeSignal,
  };
}
