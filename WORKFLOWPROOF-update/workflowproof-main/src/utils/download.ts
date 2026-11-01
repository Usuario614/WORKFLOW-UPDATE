import type { AuditReport } from '../types/workflow';
import type { AdversarialTest } from '../engine/tests';

export function downloadText(filename: string, content: string, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadJson(filename: string, data: unknown) {
  downloadText(filename, JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
}

export function reportToHtml(report: AuditReport) {
  const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]!));
  const rows = report.issues.map((i) => `
    <section class="issue ${i.severity} ${i.acceptance ? 'accepted' : ''}">
      <div class="sev">${esc(i.severity.toUpperCase())}${i.acceptance ? ' · RISK ACCEPTED' : ''}</div>
      <h3>${esc(i.title)}</h3>
      ${i.nodeName ? `<p><b>Node:</b> ${esc(i.nodeName)}</p>` : ''}
      <p>${esc(i.summary)}</p>
      <p><b>Why it matters:</b> ${esc(i.whyItMatters)}</p>
      <p><b>Recommendation:</b> ${esc(i.recommendation)}</p>
      ${i.acceptance ? `<div class="acceptance"><b>Accepted by:</b> ${esc(i.acceptance.owner)}<br><b>Reason:</b> ${esc(i.acceptance.reason)}${i.acceptance.expiresAt ? `<br><b>Review/expiry:</b> ${esc(i.acceptance.expiresAt)}` : ''}</div>` : ''}
    </section>`).join('');
  const accepted = report.scoring.acceptedRiskCount || 0;
  const open = report.scoring.openRiskCount ?? report.issues.length;
  return `<!doctype html><html><head><meta charset="utf-8"><title>WorkflowProof Report</title><style>
  body{font-family:Inter,Arial,sans-serif;max-width:960px;margin:40px auto;padding:0 22px;color:#151820;background:#fff}h1{font-size:32px}.score{font-size:64px;font-weight:800;margin:8px 0}.muted{color:#667085}.issue{border:1px solid #e5e7eb;border-radius:14px;padding:18px;margin:14px 0}.sev{font-size:11px;font-weight:800;letter-spacing:.1em}.critical{border-left:6px solid #b42318}.high{border-left:6px solid #d92d20}.medium{border-left:6px solid #dc6803}.low{border-left:6px solid #475467}.info{border-left:6px solid #667085}.accepted{background:#faf7ff}.acceptance{margin-top:12px;padding:10px;border:1px solid #d7c8ef;border-radius:8px;background:#f8f4ff}@media print{body{margin:0;max-width:none}.issue{break-inside:avoid}}
  </style></head><body><h1>WorkflowProof Production Readiness Report</h1><p class="muted">${esc(report.workflowName)} · ${esc(new Date(report.generatedAt).toLocaleString())} · engine ${esc(report.version)}</p><div class="score">${report.score}/100 · ${report.grade}</div><p><b>Production gate:</b> ${esc(report.scoring.gateLabel)}</p><p><b>Weighted dimensions:</b> ${report.scoring.weightedBaseScore}/100${report.scoring.appliedCap < 100 ? ` · <b>Safety cap:</b> ${report.scoring.appliedCap}` : ''}</p>${report.scoring.capReason ? `<p class="muted">${esc(report.scoring.capReason)}</p>` : ''}<p>${report.summary.nodesAnalyzed} nodes · ${report.summary.connectionsAnalyzed} connections · ${report.summary.rulesRun} rules</p><p><b>Findings:</b> ${report.summary.critical} critical · ${report.summary.high} high · ${report.summary.medium} medium · ${report.summary.low} low · ${report.summary.info} info</p><p><b>Governance:</b> ${open} open · ${accepted} formally accepted. Accepted risks remain in technical dimension scores.</p>${rows}<script>/* Print to PDF from the browser if desired. */</script></body></html>`;
}

export function testsToMarkdown(tests: AdversarialTest[], workflowName: string) {
  const lines = [`# WorkflowProof adversarial test plan — ${workflowName}`, '', '> Generated locally. Review before executing against real services.', ''];
  for (const t of tests) {
    lines.push(`## ${t.id} — ${t.title}`, `- **Priority:** ${t.priority}`, `- **Target:** ${t.target}`, `- **Test:** ${t.input}`, `- **Expected:** ${t.expected}`, '');
  }
  return lines.join('\n');
}
