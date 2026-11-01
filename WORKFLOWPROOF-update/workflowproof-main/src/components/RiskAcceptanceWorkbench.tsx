import type { RiskAcceptance, RuleIssue } from '../types/workflow';

interface Props {
  issue: RuleIssue;
  owner: string;
  reason: string;
  expiresAt: string;
  onOwner: (value: string) => void;
  onReason: (value: string) => void;
  onExpiresAt: (value: string) => void;
  onAccept: () => void;
  onClose: () => void;
}

export function RiskAcceptanceWorkbench({ issue, owner, reason, expiresAt, onOwner, onReason, onExpiresAt, onAccept, onClose }: Props) {
  const ready = owner.trim().length >= 2 && reason.trim().length >= 8;
  return (
    <section className="panel risk-workbench" id="risk-acceptance-workbench">
      <div className="proposal-head">
        <div>
          <div className="eyebrow">RISK ACCEPTANCE</div>
          <h3>Formally accept this finding</h3>
          <p>Acceptance changes the production gate, not the underlying technical score. The finding remains visible and exportable.</p>
        </div>
        <span className="proposal-rule">{issue.severity.toUpperCase()} · {issue.ruleId}</span>
      </div>
      <div className="acceptance-warning"><b>{issue.title}</b>{issue.nodeName ? <> · Node <code>{issue.nodeName}</code></> : null}</div>
      <div className="proposal-input-grid">
        <label><span>Risk owner *</span><input value={owner} onChange={(e) => onOwner(e.target.value)} placeholder="Name / team / role"/><small>Who owns the decision and follow-up?</small></label>
        <label><span>Review / expiry date</span><input type="date" value={expiresAt} onChange={(e) => onExpiresAt(e.target.value)}/><small>Optional. Expired acceptances stop affecting production gates.</small></label>
      </div>
      <label className="acceptance-reason"><span>Reason / compensating controls *</span><textarea value={reason} onChange={(e) => onReason(e.target.value)} placeholder="Why is this risk acceptable for this deployment, and what controls reduce it?"/></label>
      <div className="proposal-safety"><b>Governance rules</b><ul><li>The finding is not deleted.</li><li>Technical dimension scores do not improve.</li><li>Only the production severity gate treats an active acceptance as reviewed.</li><li>Export the acceptance manifest with release evidence.</li></ul></div>
      <div className="proposal-actions"><button onClick={onClose}>Cancel</button><button className="primary" disabled={!ready} onClick={onAccept}>Accept risk & recalculate</button></div>
    </section>
  );
}
