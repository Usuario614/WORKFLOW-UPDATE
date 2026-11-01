import type { GuidedFixProposal, MaterializedProposal } from '../types/workflow';

interface Props {
  proposal: GuidedFixProposal;
  values: Record<string, string>;
  preview: MaterializedProposal;
  onChange: (key: string, value: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onDownloadCompanion?: () => void;
  resolvedAfterApply?: boolean;
}

export function ProposalWorkbench({ proposal, values, preview, onChange, onApprove, onReject, onDownloadCompanion, resolvedAfterApply }: Props) {
  return (
    <section className="panel proposal-workbench" id="guided-fix-workbench">
      <div className="proposal-head">
        <div>
          <div className="eyebrow">GUIDED FIX WORKBENCH</div>
          <h3>{proposal.title}</h3>
          <p>{proposal.description}</p>
        </div>
        <span className="proposal-rule">{proposal.ruleId}</span>
      </div>

      {proposal.nodeName && <div className="proposal-target">Target node: <code>{proposal.nodeName}</code></div>}

      {proposal.companionArtifact && onDownloadCompanion && (
        <div className="companion-artifact">
          <div><b>{proposal.companionArtifact.label}</b><span>{proposal.companionArtifact.description}</span></div>
          <button onClick={onDownloadCompanion}>Download JSON</button>
        </div>
      )}

      {proposal.inputs.length > 0 && (
        <div className="proposal-input-grid">
          {proposal.inputs.map((input) => (
            <label key={input.key}>
              <span>{input.label}{input.required ? ' *' : ''}</span>
              {input.type === 'select' ? (
                <select value={values[input.key] || input.defaultValue || ''} onChange={(event) => onChange(input.key, event.target.value)}>
                  {(input.options || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              ) : (
                <input
                  type={input.type === 'date' ? 'date' : 'text'}
                  value={values[input.key] || ''}
                  placeholder={input.placeholder}
                  onChange={(event) => onChange(input.key, event.target.value)}
                />
              )}
              {input.help && <small>{input.help}</small>}
            </label>
          ))}
        </div>
      )}

      <div className="proposal-preview">
        <div className="proposal-preview-title">Proposed JSON changes</div>
        {!preview.ready && <div className="proposal-warning">{preview.warnings[0] || 'Complete the required inputs to preview this change.'}</div>}
        {preview.ready && preview.changes.map((change, idx) => (
          <div className="proposal-change" key={`${change.path}-${idx}`}>
            <code>{change.path}</code>
            <div className="proposal-change-desc">{change.description}</div>
            <div className="proposal-diff"><span>- {change.before}</span><span>+ {change.after}</span></div>
          </div>
        ))}
        {preview.warnings.map((warning, idx) => preview.ready ? <div className="proposal-warning" key={idx}>{warning}</div> : null)}
      </div>

      <div className="proposal-safety">
        <b>Safety gates</b>
        <ul>{proposal.safetyChecks.map((check, idx) => <li key={idx}>{check}</li>)}</ul>
      </div>

      {resolvedAfterApply !== undefined && (
        <div className={resolvedAfterApply ? 'proposal-resolved' : 'proposal-unresolved'}>
          {resolvedAfterApply ? '✓ Re-audit verified that the targeted finding is resolved.' : 'Change applied, but re-audit still detects the targeted finding. Review before production.'}
        </div>
      )}

      <div className="proposal-actions">
        <button onClick={onReject}>Reject / close</button>
        <button className="primary" disabled={!preview.ready || !preview.workflow || resolvedAfterApply === true} onClick={onApprove}>{resolvedAfterApply === true ? 'Applied & verified' : 'Approve change & re-audit'}</button>
      </div>
    </section>
  );
}
