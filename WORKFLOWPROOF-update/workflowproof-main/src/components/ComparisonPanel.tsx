import type { ComparisonResult } from '../types/workflow';

function accepted(report: ComparisonResult['baseline']) {
  return report.scoring.acceptedRiskCount || 0;
}

function openHigh(report: ComparisonResult['baseline']) {
  return report.summary.openHigh ?? report.summary.high;
}

function openCritical(report: ComparisonResult['baseline']) {
  return report.summary.openCritical ?? report.summary.critical;
}

export function ComparisonPanel({ result, onClose, onExport }: { result: ComparisonResult; onClose: () => void; onExport: () => void }) {
  const delta = result.scoreDelta;
  const signalLabel = result.changeSignal === 'improved' ? 'Improved' : result.changeSignal === 'regressed' ? 'Regression detected' : result.changeSignal === 'mixed' ? 'Mixed change' : 'No material change';
  return (
    <section className="panel comparison-panel" id="comparison-panel">
      <div className="section-head">
        <div><div className="eyebrow">VERSION COMPARISON</div><h3>{result.baselineName} → {result.candidateName}</h3></div>
        <div className="actions"><button onClick={onExport}>Export comparison</button><button onClick={onClose}>Close</button></div>
      </div>

      <div className={`comparison-signal comparison-signal-${result.changeSignal}`}>
        <b>{signalLabel}</b>
        <span>{result.gateExplanation}</span>
      </div>

      <div className="comparison-score-row">
        <div>
          <span>Baseline</span><b>{result.baseline.score}</b><small>{result.baseline.scoring.gateLabel}</small>
          <small>Base {result.baseline.scoring.weightedBaseScore} · {openCritical(result.baseline)} Critical open · {openHigh(result.baseline)} High open · {accepted(result.baseline)} accepted</small>
        </div>
        <div className={delta > 0 ? 'delta-positive' : delta < 0 ? 'delta-negative' : 'delta-neutral'}>{delta > 0 ? '+' : ''}{delta}<small>production</small></div>
        <div>
          <span>Candidate</span><b>{result.candidate.score}</b><small>{result.candidate.scoring.gateLabel}</small>
          <small>Base {result.candidate.scoring.weightedBaseScore} · {openCritical(result.candidate)} Critical open · {openHigh(result.candidate)} High open · {accepted(result.candidate)} accepted</small>
        </div>
      </div>

      <div className="comparison-meta-row">
        <span>Weighted score delta: <b>{result.weightedDelta > 0 ? '+' : ''}{result.weightedDelta}</b></span>
        <span>Risk acceptances carried: <b>{result.carriedAcceptances}</b></span>
        <span>Accepted risks resolved: <b>{result.resolvedAcceptedRisks}</b></span>
        <span className={result.acceptanceCarryFailures ? 'comparison-warning' : ''}>Acceptance carry failures: <b>{result.acceptanceCarryFailures}</b></span>
      </div>

      <div className="comparison-grid comparison-grid-v09">
        <div><span>Resolved findings</span><b>{result.resolvedIssues.length}</b>{result.resolvedIssues.slice(0,8).map((i) => <small key={i.id}>✓ {i.severity.toUpperCase()} · {i.title}{i.nodeName ? ` · ${i.nodeName}` : ''}{i.acceptance ? ' · accepted risk retired' : ''}</small>)}</div>
        <div><span>New findings</span><b>{result.newIssues.length}</b>{result.newIssues.slice(0,8).map((i) => <small key={i.id}>+ {i.severity.toUpperCase()} · {i.title}{i.nodeName ? ` · ${i.nodeName}` : ''}</small>)}</div>
        <div><span>Unchanged</span><b>{result.unchangedIssues.length}</b><small>Findings present in both versions.</small><small>{result.carriedAcceptances} active acceptance(s) carried into the candidate where the same finding still exists.</small></div>
      </div>
    </section>
  );
}
