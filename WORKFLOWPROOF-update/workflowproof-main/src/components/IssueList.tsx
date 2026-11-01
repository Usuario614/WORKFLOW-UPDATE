import { useMemo, useState } from 'react';
import type { RuleIssue, Severity } from '../types/workflow';
import { canGenerateGuidedProposal } from '../engine/proposals';

const tabs: Array<Severity | 'all'> = ['all', 'critical', 'high', 'medium', 'low', 'info'];

export function IssueList({
  issues,
  title = 'Findings',
  eyebrow = 'FINDINGS',
  onGenerateFix,
  onAcceptRisk,
  onRevokeAcceptance,
}: {
  issues: RuleIssue[];
  title?: string;
  eyebrow?: string;
  onGenerateFix?: (issue: RuleIssue) => void;
  onAcceptRisk?: (issue: RuleIssue) => void;
  onRevokeAcceptance?: (issue: RuleIssue) => void;
}) {
  const [filter, setFilter] = useState<Severity | 'all'>('all');
  const filtered = useMemo(() => filter === 'all' ? issues : issues.filter((i) => i.severity === filter), [issues, filter]);

  return (
    <section className="panel issue-panel">
      <div className="section-head">
        <div><div className="eyebrow">{eyebrow}</div><h3>{issues.length} {title.toLowerCase()}</h3></div>
        <div className="filters">
          {tabs.map((t) => <button key={t} className={filter === t ? 'active' : ''} onClick={() => setFilter(t)}>{t}</button>)}
        </div>
      </div>
      <div className="issues">
        {filtered.length === 0 && <div className="empty">No findings in this severity.</div>}
        {filtered.map((issue) => (
          <article className={`issue issue-${issue.severity} ${issue.acceptance ? 'issue-accepted' : ''}`} key={issue.id}>
            <div className="issue-top">
              <span className={`severity severity-${issue.severity}`}>{issue.severity}</span>
              <span className="category">{issue.category}</span>
              {issue.repair && <span className={`repair-badge repair-${issue.repair.mode}`}>{issue.repair.label}</span>}
              {canGenerateGuidedProposal(issue) && <span className="proposal-available">proposal available</span>}
              {issue.acceptance && <span className="acceptance-badge">risk accepted</span>}
            </div>
            <h4>{issue.title}</h4>
            {issue.nodeName && <div className="node-name">Node: <code>{issue.nodeName}</code></div>}
            <p>{issue.summary}</p>
            <div className="why"><b>Why it matters</b><span>{issue.whyItMatters}</span></div>
            <div className="recommend"><b>Recommendation</b><span>{issue.recommendation}</span></div>
            {issue.acceptance && (
              <div className="acceptance-card">
                <b>Accepted risk</b>
                <span>Owner: {issue.acceptance.owner}</span>
                <span>Reason: {issue.acceptance.reason}</span>
                {issue.acceptance.expiresAt && <span>Review/expiry: {issue.acceptance.expiresAt}</span>}
              </div>
            )}
            {issue.repair && (
              <details className="repair-plan" open={issue.repair.mode === 'guided'}>
                <summary>{issue.repair.label}: {issue.repair.summary}</summary>
                <ol>{issue.repair.steps.map((step, idx) => <li key={idx}>{step}</li>)}</ol>
                {issue.repair.caution && <div className="repair-caution"><b>Safety note:</b> {issue.repair.caution}</div>}
              </details>
            )}
            <div className="issue-actions">
              {canGenerateGuidedProposal(issue) && onGenerateFix && !issue.acceptance && (
                <button className="generate-fix-button" onClick={() => onGenerateFix(issue)}>Generate fix proposal</button>
              )}
              {!issue.acceptance && onAcceptRisk && issue.severity !== 'info' && (
                <button className="accept-risk-button" onClick={() => onAcceptRisk(issue)}>Accept risk</button>
              )}
              {issue.acceptance && onRevokeAcceptance && (
                <button className="revoke-risk-button" onClick={() => onRevokeAcceptance(issue)}>Revoke acceptance</button>
              )}
            </div>
            {issue.impact && (
              <div className="impact-assessment">
                <div className="impact-title">Impact assessment</div>
                <div className="impact-grid">
                  <div><span>Impact class</span><b>{issue.impact.impactClass}</b></div>
                  <div><span>Reversibility</span><b>{issue.impact.reversibility}</b></div>
                  <div><span>Financial risk</span><b>{issue.impact.financialRisk}</b></div>
                </div>
                <p>{issue.impact.rationale}</p>
                {issue.impact.affectedActions?.length ? <div className="impact-actions">Affected actions: {issue.impact.affectedActions.join(', ')}</div> : null}
              </div>
            )}
            {issue.evidence?.length ? <details><summary>Evidence</summary><ul>{issue.evidence.map((e, i) => <li key={i}><code>{e}</code></li>)}</ul></details> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
