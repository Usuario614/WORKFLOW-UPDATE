import type { AuditReport } from '../types/workflow';

export function ScoreCard({ report }: { report: AuditReport }) {
  const status = report.scoring.gateLabel;
  const total = report.summary.critical + report.summary.high + report.summary.medium + report.summary.low + report.summary.info;
  const accepted = report.scoring.acceptedRiskCount || 0;
  const open = report.scoring.openRiskCount ?? total;

  return (
    <section className="score-card panel">
      <div className="score-main">
        <div className="eyebrow">PRODUCTION READINESS</div>
        <div className="score-line"><span className="score-number">{report.score}</span><span className="score-denom">/100</span><span className={`grade grade-${report.grade}`}>{report.grade}</span></div>
        <div className={`score-status gate-${report.scoring.gate}`}>{status}</div>
        <div className="score-method">
          Weighted dimensions: <b>{report.scoring.weightedBaseScore}</b>/100
          {report.scoring.appliedCap < 100 && <> · Safety cap: <b>{report.scoring.appliedCap}</b></>}
        </div>
        {accepted > 0 && <div className="accepted-score-note">{accepted} formally accepted risk{accepted === 1 ? '' : 's'} · technical dimension scores remain unchanged.</div>}
        {report.scoring.capReason && <div className="score-cap-note">{report.scoring.capReason}</div>}
      </div>
      <div>
        <div className="finding-total">{total} total findings · {open} open{accepted ? ` · ${accepted} accepted` : ''}</div>
        <div className="severity-grid">
          <div><b>{report.summary.critical}</b><span>Critical{report.summary.openCritical !== undefined && report.summary.openCritical !== report.summary.critical ? ` · ${report.summary.openCritical} open` : ''}</span></div>
          <div><b>{report.summary.high}</b><span>High{report.summary.openHigh !== undefined && report.summary.openHigh !== report.summary.high ? ` · ${report.summary.openHigh} open` : ''}</span></div>
          <div><b>{report.summary.medium}</b><span>Medium{report.summary.openMedium !== undefined && report.summary.openMedium !== report.summary.medium ? ` · ${report.summary.openMedium} open` : ''}</span></div>
          <div><b>{report.summary.low}</b><span>Low{report.summary.openLow !== undefined && report.summary.openLow !== report.summary.low ? ` · ${report.summary.openLow} open` : ''}</span></div>
          <div><b>{report.summary.info}</b><span>Info</span></div>
        </div>
      </div>
    </section>
  );
}
