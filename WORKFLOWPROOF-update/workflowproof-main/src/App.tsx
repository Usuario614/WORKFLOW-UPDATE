import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { FormEvent } from 'react';
import { supabase } from './lib/supabase';
import { auditWorkflow, validateWorkflowShape } from './engine/audit';
import { applySafeFixes } from './engine/fixes';
import { buildRepairPlan } from './engine/repair';
import {
  buildCompanionArtifact,
  canGenerateGuidedProposal,
  createGuidedProposal,
  defaultProposalValues,
  materializeGuidedProposal,
  proposalReadyCount,
} from './engine/proposals';
import { generateAdversarialTests } from './engine/tests';
import { compareReports } from './engine/compare';
import { runSelfTest } from './engine/selftest';
import { sanitizeForSharingWithSummary } from './engine/sanitize';
import { DEMO_WORKFLOW } from './demo/workflow';
import type {
  AppliedFix,
  AuditReport,
  ComparisonResult,
  GuidedFixProposal,
  MaterializedProposal,
  N8nWorkflow,
  RepairPlanItem,
  RiskAcceptance,
  RuleIssue,
  SelfTestResult,
} from './types/workflow';
import { downloadJson, downloadText, reportToHtml, testsToMarkdown } from './utils/download';
import { DropZone } from './components/DropZone';
import { ScoreCard } from './components/ScoreCard';
import { Breakdown } from './components/Breakdown';
import { IssueList } from './components/IssueList';
import { TestPlan } from './components/TestPlan';
import { ProposalWorkbench } from './components/ProposalWorkbench';
import { RiskAcceptanceWorkbench } from './components/RiskAcceptanceWorkbench';
import { ComparisonPanel } from './components/ComparisonPanel';
import { SelfTestPanel } from './components/SelfTestPanel';

const AUDIT_EMAIL = 'nuvekoia@gmail.com';
const AUDIT_MAILTO = `mailto:${AUDIT_EMAIL}?subject=${encodeURIComponent('WorkflowProof assisted audit inquiry')}&body=${encodeURIComponent('Hi, I am interested in the WorkflowProof $49 pilot audit.\n\nMy workflow context: \n\nTarget handoff or release date: \n\nPlease send me the intake instructions. I will not attach workflow exports, credentials, tokens, customer data, or production URLs to this first email.\n')}`;

function safeName(name: string) { return name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'workflow'; }
function sameIssue(a: { ruleId: string; nodeName?: string }, b: { ruleId: string; nodeName?: string }) {
  return a.ruleId === b.ruleId && (a.nodeName || '') === (b.nodeName || '');
}

async function sha256Json(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface ProofState {
  fixed: N8nWorkflow;
  report: AuditReport;
  applied: AppliedFix[];
  resolved: AppliedFix[];
  plan: RepairPlanItem[];
}

interface ProposalSession {
  issue: RuleIssue;
  proposal: GuidedFixProposal;
  values: Record<string, string>;
  preview: MaterializedProposal;
  resolvedAfterApply?: boolean;
}

interface AcceptanceSession {
  issue: RuleIssue;
  owner: string;
  reason: string;
  expiresAt: string;
}

export default function App() {
  const [workflow, setWorkflow] = useState<N8nWorkflow | null>(null);
  const [report, setReport] = useState<AuditReport | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [proof, setProof] = useState<ProofState | null>(null);
  const [showTests, setShowTests] = useState(false);
  const [proposalSession, setProposalSession] = useState<ProposalSession | null>(null);
  const [acceptanceSession, setAcceptanceSession] = useState<AcceptanceSession | null>(null);
  const [acceptances, setAcceptances] = useState<RiskAcceptance[]>([]);
  const [workflowKey, setWorkflowKey] = useState('');
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [selfTest, setSelfTest] = useState<SelfTestResult | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [history, setHistory] = useState<Array<{ id: string; workflow_name: string; score: number; created_at: string }>>([]);
  const compareInputRef = useRef<HTMLInputElement | null>(null);
  const acceptanceInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) { setUser(data.session?.user ?? null); setAuthLoading(false); }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      setUser(session?.user ?? null);
      setAuthMessage('');
      setAuthLoading(false);
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!supabase || !user) { setCredits(null); setHistory([]); return; }
    let alive = true;
    (async () => {
      const [{ data: profile, error: profileError }, { data: reports }] = await Promise.all([
        supabase.from('profiles').select('free_scans_remaining').eq('id', user.id).single(),
        supabase.from('scan_reports').select('id, workflow_name, score, created_at').order('created_at', { ascending: false }).limit(10),
      ]);
      if (!alive) return;
      if (profileError) setAuthMessage('No pudimos cargar tus créditos. Revisá que hayas ejecutado el SQL de configuración en Supabase.');
      else setCredits(profile.free_scans_remaining);
      setHistory(reports || []);
    })();
    return () => { alive = false; };
  }, [user]);

  const activeWorkflow = proof?.fixed || workflow;
  const activeReport = proof?.report || report;
  const tests = useMemo(() => activeWorkflow ? generateAdversarialTests(activeWorkflow) : [], [activeWorkflow]);
  const initialRepairPlan = useMemo(() => report ? buildRepairPlan(report.issues) : [], [report]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setAuthBusy(true); setAuthMessage('');
    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: authEmail.trim(), password: authPassword });
        if (error) throw error;
        if (!data.session) setAuthMessage('Cuenta creada. Revisá tu correo para confirmar el registro y después iniciá sesión.');
        else setAuthMessage('¡Cuenta creada! Tenés 2 escaneos gratuitos.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
        if (error) throw error;
        setAuthMessage('Sesión iniciada correctamente.');
      }
    } catch (e) {
      setAuthMessage(e instanceof Error ? e.message : 'No pudimos completar el acceso.');
    } finally { setAuthBusy(false); }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    reset();
  }

  async function downloadSavedReport(id: string, name: string) {
    if (!supabase) return;
    const { data, error } = await supabase.from('scan_reports').select('report').eq('id', id).single();
    if (error || !data?.report) { setAuthMessage('No pudimos recuperar ese informe.'); return; }
    downloadJson(`${safeName(name)}-saved-report.json`, data.report);
  }

  function persistAcceptances(key: string, next: RiskAcceptance[]) {
    if (!key) return;
    try { localStorage.setItem(`workflowproof:acceptances:${key}`, JSON.stringify(next)); }
    catch { /* Local persistence is optional; export remains available. */ }
  }

  function reAuditWithAcceptances(nextAcceptances: RiskAcceptance[]) {
    if (workflow) setReport(auditWorkflow(workflow, nextAcceptances));
    if (proof) {
      const proofReport = auditWorkflow(proof.fixed, nextAcceptances);
      setProof({ ...proof, report: proofReport, plan: buildRepairPlan(proofReport.issues) });
    }
  }

  async function analyze(file: File) {
    setError('');
    if (!supabase) { setError('El registro todavía no está configurado. El administrador debe completar las variables de Supabase en Render.'); return; }
    if (!user) { setError('Creá una cuenta gratuita o iniciá sesión para usar tus 2 escaneos de cortesía.'); return; }
    if (credits !== null && credits <= 0) { setError('Ya utilizaste tus 2 escaneos gratuitos. Próximamente podrás ampliar tu plan.'); return; }
    setProof(null); setShowTests(false); setProposalSession(null); setAcceptanceSession(null); setComparison(null); setAcceptances([]); setWorkflowKey('');
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      validateWorkflowShape(raw);
      const key = await sha256Json(raw);
      let restored: RiskAcceptance[] = [];
      try {
        const saved = JSON.parse(localStorage.getItem(`workflowproof:acceptances:${key}`) || '[]');
        if (Array.isArray(saved)) restored = saved.filter((item) => item && typeof item.issueId === 'string' && typeof item.ruleId === 'string' && typeof item.owner === 'string' && typeof item.reason === 'string');
      } catch { /* Corrupt local data must never prevent an audit. */ }
      const result = auditWorkflow(raw, restored);
      const { data: saved, error: saveError } = await supabase.rpc('save_scan_report', {
        p_workflow_name: result.workflowName || file.name,
        p_file_name: file.name,
        p_score: result.score,
        p_report: result,
      });
      if (saveError) throw new Error(saveError.message.includes('NO_FREE_SCANS') ? 'Ya utilizaste tus 2 escaneos gratuitos.' : `No pudimos guardar el informe: ${saveError.message}`);
      setCredits(typeof saved?.remaining === 'number' ? saved.remaining : Math.max(0, (credits ?? 2) - 1));
      setHistory((items) => [{ id: saved.report_id, workflow_name: result.workflowName || file.name, score: result.score, created_at: new Date().toISOString() }, ...items].slice(0, 10));
      setWorkflow(raw); setReport(result); setFileName(file.name); setWorkflowKey(key); setAcceptances(restored);
    } catch (e) {
      setWorkflow(null); setReport(null);
      setError(e instanceof Error ? e.message : 'Could not analyze this file.');
    }
  }

  async function loadDemo() {
    setError(''); setProof(null); setShowTests(false); setProposalSession(null); setAcceptanceSession(null); setComparison(null); setAcceptances([]); setWorkflowKey('');
    const raw = structuredClone(DEMO_WORKFLOW);
    const key = await sha256Json(raw);
    setWorkflow(raw);
    setReport(auditWorkflow(raw));
    setFileName('workflowproof-safe-demo.json');
    setWorkflowKey(key);
  }

  function runFix() {
    if (!activeWorkflow || !activeReport) return;
    const fixed = applySafeFixes(activeWorkflow, activeReport);
    const fixedReport = auditWorkflow(fixed.workflow, acceptances);
    const justResolved = fixed.applied.filter((change) => !fixedReport.issues.some((issue) => sameIssue(change, issue)));
    setProof({
      fixed: fixed.workflow,
      report: fixedReport,
      applied: [...(proof?.applied || []), ...fixed.applied.map((x) => ({ ...x, source: 'auto' as const }))],
      resolved: [...(proof?.resolved || []), ...justResolved.map((x) => ({ ...x, source: 'auto' as const }))],
      plan: buildRepairPlan(fixedReport.issues),
    });
    setProposalSession(null);
  }

  function startProposal(issue: RuleIssue) {
    if (!activeWorkflow || !canGenerateGuidedProposal(issue)) return;
    const proposal = createGuidedProposal(issue, activeWorkflow);
    if (!proposal) return;
    const values = defaultProposalValues(proposal);
    const preview = materializeGuidedProposal(proposal, issue, activeWorkflow, values);
    setProposalSession({ issue, proposal, values, preview });
    setAcceptanceSession(null);
    window.setTimeout(() => document.getElementById('guided-fix-workbench')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  function updateProposalValue(key: string, value: string) {
    if (!proposalSession || !activeWorkflow) return;
    const values = { ...proposalSession.values, [key]: value };
    const preview = materializeGuidedProposal(proposalSession.proposal, proposalSession.issue, activeWorkflow, values);
    setProposalSession({ ...proposalSession, values, preview, resolvedAfterApply: undefined });
  }

  function approveProposal() {
    if (!proposalSession?.preview.ready || !proposalSession.preview.workflow || !report) return;
    const patched = proposalSession.preview.workflow;
    const patchedReport = auditWorkflow(patched, acceptances);
    const resolved = !patchedReport.issues.some((issue) => sameIssue(issue, proposalSession.issue));
    const change: AppliedFix = {
      ruleId: proposalSession.issue.ruleId,
      nodeName: proposalSession.issue.nodeName,
      description: `${proposalSession.proposal.title}: ${proposalSession.preview.changes.map((item) => item.description).join(' ')}`,
      source: 'guided',
    };
    setProof({
      fixed: patched,
      report: patchedReport,
      applied: [...(proof?.applied || []), change],
      resolved: resolved ? [...(proof?.resolved || []), change] : [...(proof?.resolved || [])],
      plan: buildRepairPlan(patchedReport.issues),
    });
    setProposalSession({ ...proposalSession, resolvedAfterApply: resolved });
  }

  function downloadCompanion() {
    if (!proposalSession || !activeWorkflow || !proposalSession.proposal.companionArtifact) return;
    const artifact = buildCompanionArtifact(proposalSession.proposal.ruleId, activeWorkflow);
    if (artifact) downloadJson(proposalSession.proposal.companionArtifact.fileName, artifact);
  }

  function startAcceptance(issue: RuleIssue) {
    setProposalSession(null);
    setAcceptanceSession({ issue, owner: '', reason: '', expiresAt: '' });
    window.setTimeout(() => document.getElementById('risk-acceptance-workbench')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  function acceptRisk() {
    if (!acceptanceSession || acceptanceSession.owner.trim().length < 2 || acceptanceSession.reason.trim().length < 8) return;
    const acceptance: RiskAcceptance = {
      issueId: acceptanceSession.issue.id,
      ruleId: acceptanceSession.issue.ruleId,
      nodeName: acceptanceSession.issue.nodeName,
      owner: acceptanceSession.owner.trim(),
      reason: acceptanceSession.reason.trim(),
      acceptedAt: new Date().toISOString(),
      expiresAt: acceptanceSession.expiresAt || undefined,
    };
    const next = [...acceptances.filter((item) => item.issueId !== acceptance.issueId), acceptance];
    setAcceptances(next);
    persistAcceptances(workflowKey, next);
    reAuditWithAcceptances(next);
    setAcceptanceSession(null);
  }

  function revokeAcceptance(issue: RuleIssue) {
    const next = acceptances.filter((item) => item.issueId !== issue.id);
    setAcceptances(next);
    persistAcceptances(workflowKey, next);
    reAuditWithAcceptances(next);
  }

  async function importAcceptances(file: File) {
    try {
      const parsed = JSON.parse(await file.text());
      const list = Array.isArray(parsed) ? parsed : parsed.acceptances;
      if (!Array.isArray(list)) throw new Error('Acceptance manifest must contain an acceptances array.');
      const clean = list.filter((item) => item && typeof item.issueId === 'string' && typeof item.ruleId === 'string' && typeof item.owner === 'string' && typeof item.reason === 'string') as RiskAcceptance[];
      setAcceptances(clean);
      persistAcceptances(workflowKey, clean);
      reAuditWithAcceptances(clean);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not import the risk acceptance manifest.');
    }
  }

  async function compareVersion(file: File) {
    if (!activeReport) return;
    try {
      const raw = JSON.parse(await file.text());
      validateWorkflowShape(raw);
      // Derive active acceptances from the audited baseline itself so Compare Version cannot
      // accidentally drop governance state even if UI/session state becomes stale.
      const baselineAcceptances = activeReport.issues.flatMap((issue) => issue.acceptance ? [issue.acceptance] : []);
      const candidate = auditWorkflow(raw, baselineAcceptances);
      const result = compareReports(activeReport, candidate);
      setComparison(result);
      window.setTimeout(() => document.getElementById('comparison-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not compare this file.');
    }
  }

  async function downloadReleasePack(sanitized = false) {
    if (!activeWorkflow || !activeReport) return;
    const workflowSha256 = await sha256Json(activeWorkflow);
    const selfTestEvidence = runSelfTest();
    const openBySeverity = {
      critical: activeReport.summary.openCritical ?? activeReport.summary.critical,
      high: activeReport.summary.openHigh ?? activeReport.summary.high,
      medium: activeReport.summary.openMedium ?? activeReport.summary.medium,
      low: activeReport.summary.openLow ?? activeReport.summary.low,
      info: activeReport.summary.openInfo ?? activeReport.summary.info,
    };
    const releasePack = {
      format: 'workflowproof-release-pack',
      schemaVersion: '1.0',
      version: activeReport.version,
      generatedAt: new Date().toISOString(),
      sourceFile: fileName,
      integrity: { algorithm: 'SHA-256', workflowSha256 },
      releaseDecision: {
        productionScore: activeReport.score,
        technicalWeightedScore: activeReport.scoring.weightedBaseScore,
        grade: activeReport.grade,
        gate: activeReport.scoring.gate,
        gateLabel: activeReport.scoring.gateLabel,
        cap: activeReport.scoring.appliedCap,
        capReason: activeReport.scoring.capReason || null,
        openFindings: activeReport.scoring.openRiskCount ?? activeReport.issues.length,
        acceptedFindings: activeReport.scoring.acceptedRiskCount || 0,
        openBySeverity,
      },
      workflow: activeWorkflow,
      audit: activeReport,
      repairPlan: buildRepairPlan(activeReport.issues),
      adversarialTests: tests,
      riskAcceptances: acceptances,
      proof: proof
        ? { status: 'changes-applied', reason: 'Approved fixes were re-audited.', applied: proof.applied, resolved: proof.resolved, hardenedScore: proof.report.score }
        : { status: 'not-run', reason: 'No auto-fix or guided-fix change has been approved for this release pack.', applied: [], resolved: [] },
      comparison: comparison || null,
      engineSelfTest: selfTestEvidence,
      evidencePolicy: {
        acceptedRisksRemainInTechnicalScore: true,
        compareCarriesMatchingAcceptances: true,
        localProcessing: true,
      },
    };
    if (sanitized) {
      const shareSafe = sanitizeForSharingWithSummary(releasePack);
      downloadJson(`${safeName(activeReport.workflowName)}-release-pack-share-safe.json`, {
        ...shareSafe.value,
        sanitization: {
          mode: 'share-safe',
          redactionsApplied: shareSafe.redactions,
          warning: 'Automated redaction reduces disclosure risk but is not a guarantee. Review this file before external sharing.',
        },
      });
      return;
    }
    downloadJson(`${safeName(activeReport.workflowName)}-release-pack.json`, releasePack);
  }

  function reset() {
    setWorkflow(null); setReport(null); setFileName(''); setError(''); setProof(null); setShowTests(false); setProposalSession(null); setAcceptanceSession(null); setAcceptances([]); setWorkflowKey(''); setComparison(null);
  }

  if (!report || !workflow) {
    return (
      <div className="app-shell">
        <header className="topbar">
          <div className="brand" onClick={reset}><div className="mark">W</div><span>WorkflowProof</span><em>v0.13</em></div>
          <div className="top-meta">Automation preflight for n8n workflows</div>
          {user && <div className="account-chip"><span>{user.email}</span><b>{credits ?? '…'} free scans</b><button onClick={signOut}>Sign out</button></div>}
        </header>
        <main className="landing">
          <section className="hero">
            <div className="kicker">SCAN LOCALLY · SHARE SAFELY · SHIP WITH EVIDENCE</div>
            <h1>Catch costly workflow mistakes<br/><span>before they reach production.</span></h1>
            <p>WorkflowProof is a local preflight for n8n exports: actionable evidence for reliability, duplicate actions, security, data safety and AI risk—without uploading your workflow.</p>
          </section>
          {!supabase ? (
            <section className="auth-card"><h2>Free account setup required</h2><p>El administrador debe configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en Render para activar el registro y los 2 escaneos gratuitos.</p></section>
          ) : !user ? (
            <section className="auth-card">
              <div className="eyebrow">FREE ACCOUNT · 2 COMPLETE SCANS</div>
              <h2>{authMode === 'signup' ? 'Create your free account' : 'Welcome back'}</h2>
              <p>Two complete workflow scans, detailed reports and a private report history. No credit card required.</p>
              <form onSubmit={submitAuth} className="auth-form">
                <label>Email<input type="email" autoComplete="email" required value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="you@example.com" /></label>
                <label>Password<input type="password" autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} minLength={8} required value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="At least 8 characters" /></label>
                <button className="primary" type="submit" disabled={authBusy}>{authBusy ? 'Please wait…' : authMode === 'signup' ? 'Create free account' : 'Sign in'}</button>
              </form>
              <button className="auth-switch" onClick={() => { setAuthMode(authMode === 'signup' ? 'login' : 'signup'); setAuthMessage(''); }}>{authMode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create a free account'}</button>
              {authMessage && <div className="auth-message">{authMessage}</div>}
              {authLoading && <div className="auth-message">Checking session…</div>}
            </section>
          ) : (
            <section className="account-panel">
              <div><div className="eyebrow">YOUR FREE ACCOUNT</div><h2>Welcome, {user.email}</h2><p>{credits ?? '…'} of 2 free scans remaining · Complete reports saved to your account.</p></div>
              <div className="credit-meter"><b>{credits ?? '…'} / 2</b><span>FREE SCANS LEFT</span></div>
            </section>
          )}
          {user && <DropZone onFile={analyze} error={error} />}
          {!user && supabase && error && <div className="error-banner">{error}</div>}
          {user && history.length > 0 && <section className="history-card"><div className="eyebrow">YOUR RECENT REPORTS</div><h3>Scan history</h3>{history.map((item) => <div className="history-row" key={item.id}><span>{item.workflow_name}</span><b>Score {item.score}</b><time>{new Date(item.created_at).toLocaleDateString()}</time><button onClick={() => downloadSavedReport(item.id, item.workflow_name)}>Download report</button></div>)}</section>}
          <div className="landing-tools"><button className="primary" onClick={loadDemo}>Run a safe demo</button><button onClick={() => setSelfTest(runSelfTest())}>Run engine self-test</button><span>The demo is synthetic and never contacts a live system. Static analysis is evidence for review, never a security certification.</span></div>
          {selfTest && <SelfTestPanel result={selfTest} onClose={() => setSelfTest(null)} />}
          <div className="trust-row"><span>✓ 2 free scans</span><span>✓ Workflow stays on your device</span><span>✓ No n8n API key</span><span>✓ Analysis runs in your browser</span></div>

          <section className="commercial-offer" aria-labelledby="offer-title">
            <div className="offer-copy">
              <div className="eyebrow">FOR N8N BUILDERS & AGENCIES</div>
              <h2 id="offer-title">Want a second pair of eyes before handoff?</h2>
              <p>Book a human-reviewed pre-production audit. WorkflowProof runs the static checks; a reviewer validates the findings and turns them into a prioritized action plan.</p>
              <div className="offer-points">
                <span>✓ One sanitized workflow export</span>
                <span>✓ Prioritized findings and remediation plan</span>
                <span>✓ One follow-up review of approved changes</span>
                <span>✓ Target delivery: two business days after valid intake</span>
              </div>
              <small>Static analysis supports review. It does not certify security or guarantee production behavior. No credentials or production access required.</small>
            </div>
            <div className="offer-card">
              <span className="offer-label">FOUNDING PILOT</span>
              <div className="offer-price">$49 <span>USD</span></div>
              <p>One workflow · fixed scope</p>
              <a className="button-link primary" href={AUDIT_MAILTO}>Request an audit</a>
              <a className="offer-secondary" href="mailto:nuvekoia@gmail.com?subject=WorkflowProof%20sample%20report">Ask for a sample report</a>
              <div className="offer-note">No payment is collected on this page. Scope and payment method are confirmed with you before work starts.</div>
            </div>
          </section>

          <section className="feature-strip">
            <div><b>PRE-FLIGHT</b><span>59 deterministic rules inspect an n8n export before a deployment or handoff.</span></div>
            <div><b>REMEDIATE</b><span>Only clearly safe changes are automatic. Every guided change is previewed for approval.</span></div>
            <div><b>GOVERN</b><span>Accepted risks stay visible, retain technical penalties and require an owner and rationale.</span></div>
            <div><b>PROVE</b><span>Compare versions and attach a share-safe evidence pack to a client or release handoff.</span></div>
          </section>
          <section className="panel" style={{ margin: '36px auto 0', maxWidth: 960 }}>
            <div className="eyebrow">PRODUCT BOUNDARY</div>
            <h2>Evidence for a reviewer—not a substitute for one.</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
              <div><b>What it does</b><p>Locally inspects an n8n JSON export, explains deterministic findings and creates reviewable evidence.</p></div>
              <div><b>What it will not do</b><p>It does not execute workflows, access n8n, send data away, invent credentials or silently change business logic.</p></div>
              <div><b>What remains yours</b><p>Validate real-world behavior, approve every guided change and decide whether a release is safe for your operations.</p></div>
            </div>
          </section>
        </main>
      </div>
    );
  }

  const currentReport = activeReport as AuditReport;
  const activePlan = proof?.plan || initialRepairPlan;
  const currentIssues = currentReport.issues;
  const planCounts = {
    auto: activePlan.filter((p) => p.mode === 'auto').length,
    guided: activePlan.filter((p) => p.mode === 'guided').length,
    manual: activePlan.filter((p) => p.mode === 'manual').length,
    proposal: proposalReadyCount(currentIssues),
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand" onClick={reset}><div className="mark">W</div><span>WorkflowProof</span><em>v0.13</em></div>
        <div className="top-meta">Automation preflight for n8n workflows</div>
        {user && <div className="account-chip"><span>{user.email}</span><b>{credits ?? '…'} free scans</b><button onClick={signOut}>Sign out</button></div>}
      </header>

      <main className="dashboard">
        <input ref={compareInputRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) compareVersion(file); e.currentTarget.value = ''; }} />
        <input ref={acceptanceInputRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) importAcceptances(file); e.currentTarget.value = ''; }} />
        <div className="scan-credit-banner"><span>Free scans remaining</span><b>{credits ?? '…'} / 2</b><button onClick={reset}>Back to account</button></div>
        <div className="report-head">
          <div><button className="link-button" onClick={reset}>← New scan</button><div className="eyebrow">WORKFLOW</div><h1>{report.workflowName}</h1><p>{fileName} · {report.summary.nodesAnalyzed} nodes · {report.summary.connectionsAnalyzed} connections · {report.summary.rulesRun} rules · engine {currentReport.version}</p></div>
          <div className="actions">
            <button onClick={() => compareInputRef.current?.click()}>Compare version</button>
            <button onClick={() => downloadJson(`${safeName(report.workflowName)}-report.json`, currentReport)}>Export JSON</button>
            <button onClick={() => downloadText(`${safeName(report.workflowName)}-report.html`, reportToHtml(currentReport), 'text/html;charset=utf-8')}>Export HTML/PDF</button>
          </div>
        </div>

        <section className="dashboard-offer" aria-label="Human-reviewed audit service">
          <div><b>Need a human-reviewed handoff report?</b><span>Get a prioritized review for one sanitized workflow. Founding pilot: $49 USD.</span></div>
          <a className="button-link primary" href={AUDIT_MAILTO}>Request an audit</a>
        </section>

        <ScoreCard report={currentReport} />
        <div className="governance-strip panel">
          <div><div className="eyebrow">GOVERNANCE</div><h3>Risk acceptance & release evidence</h3><p>Accepted risks remain visible and keep their technical penalties. They only change the production gate while the acceptance is active.</p></div>
          <div className="governance-actions">
            <button onClick={() => downloadJson(`${safeName(report.workflowName)}-risk-acceptances.json`, { workflowName: currentReport.workflowName, generatedAt: new Date().toISOString(), acceptances })} disabled={!acceptances.length}>Export acceptances ({acceptances.length})</button>
            <button onClick={() => acceptanceInputRef.current?.click()}>Import acceptances</button>
            <button className="primary" onClick={() => downloadReleasePack(false)}>Download release pack</button>
            <button onClick={() => downloadReleasePack(true)}>Download share-safe pack</button>
          </div>
        </div>

        <div className="two-col"><Breakdown data={currentReport.breakdown} />
          <section className="panel action-panel">
            <div className="eyebrow">HARDEN</div><h3>Safe remediation engine</h3>
            <p>Safe changes are automated. Guided fixes become explicit JSON proposals; webhook auth can reference existing credentials without exposing secrets.</p>
            <div className="repair-summary-grid">
              <div className="repair-auto-count"><span>Auto-fixable</span><b>{planCounts.auto}</b></div>
              <div className="repair-guided-count"><span>Guided</span><b>{planCounts.guided}</b></div>
              <div className="proposal-ready-count"><span>Proposal-ready</span><b>{planCounts.proposal}</b></div>
              <div className="repair-manual-count"><span>Manual</span><b>{planCounts.manual}</b></div>
            </div>
            <button className="primary" onClick={runFix}>FIX IT</button>
            <button onClick={() => setShowTests((v) => !v)}>BREAK IT</button>
            <button onClick={() => downloadJson(`${safeName(report.workflowName)}-repair-plan.json`, activePlan)}>Export repair plan</button>
            <button onClick={() => downloadText(`${safeName(report.workflowName)}-adversarial-tests.md`, testsToMarkdown(tests, report.workflowName), 'text/markdown;charset=utf-8')}>Export test plan</button>
          </section>
        </div>

        {comparison && <ComparisonPanel result={comparison} onClose={() => setComparison(null)} onExport={() => downloadJson(`${safeName(report.workflowName)}-comparison.json`, comparison)} />}

        {proof && (
          <section className="panel proof-panel">
            <div className="eyebrow">PROVE IT</div><h3>Verified before / after</h3>
            <div className="proof-grid">
              <div><span>Original</span><b>{report.score}</b><small>base {report.scoring.weightedBaseScore}</small></div>
              <div className="arrow">→</div>
              <div><span>Current hardened</span><b>{proof.report.score}</b><small>base {proof.report.scoring.weightedBaseScore}</small></div>
            </div>
            {proof.report.scoring.capReason && <p className="proof-cap">{proof.report.scoring.capReason}</p>}

            {proof.applied.length > 0 ? (
              <>
                <p><b>{proof.applied.length}</b> approved file change(s); <b>{proof.resolved.length}</b> targeted finding(s) verified resolved by re-audit.</p>
                <ul className="resolved-list">{proof.applied.map((x, idx) => <li key={`${x.ruleId}-${x.nodeName}-${idx}`}><span className={`change-source change-${x.source || 'auto'}`}>{x.source === 'guided' ? 'guided' : 'auto'}</span>{x.description}{proof.resolved.some((r) => r === x || (r.ruleId === x.ruleId && r.description === x.description)) ? ' ✓ resolved' : ' · still requires review'}</li>)}</ul>
              </>
            ) : (
              <div className="no-auto-fix"><b>No safe file changes were applicable.</b><br/>WorkflowProof did not alter the JSON just to improve the score. Use proposal-ready Guided Fixes below when available.</div>
            )}

            <div className="repair-summary-grid">
              <div className="repair-auto-count"><span>Auto remaining</span><b>{proof.plan.filter((p) => p.mode === 'auto').length}</b></div>
              <div className="repair-guided-count"><span>Guided remaining</span><b>{proof.plan.filter((p) => p.mode === 'guided').length}</b></div>
              <div className="proposal-ready-count"><span>Proposal-ready</span><b>{proposalReadyCount(proof.report.issues)}</b></div>
              <div className="repair-manual-count"><span>Manual review</span><b>{proof.plan.filter((p) => p.mode === 'manual').length}</b></div>
            </div>

            <div className="proof-summary">
              <span>Remaining: <b>{proof.report.issues.length}</b></span>
              <span>Critical: <b>{proof.report.summary.critical}</b></span>
              <span>High: <b>{proof.report.summary.high}</b></span>
              <span>Medium: <b>{proof.report.summary.medium}</b></span>
              <span>Low: <b>{proof.report.summary.low}</b></span>
              <span>Info: <b>{proof.report.summary.info}</b></span>
            </div>
            <div className="actions left">
              {proof.applied.length > 0 && <button className="primary" onClick={() => downloadJson(`${safeName(report.workflowName)}-hardened.json`, proof.fixed)}>Download current hardened workflow</button>}
              <button onClick={() => downloadJson(`${safeName(report.workflowName)}-proof-report.json`, proof.report)}>Download proof report</button>
              <button onClick={() => downloadJson(`${safeName(report.workflowName)}-repair-plan.json`, proof.plan)}>Download guided repair plan</button>
            </div>
          </section>
        )}

        {proposalSession && (
          <ProposalWorkbench
            proposal={proposalSession.proposal}
            values={proposalSession.values}
            preview={proposalSession.preview}
            onChange={updateProposalValue}
            onApprove={approveProposal}
            onReject={() => setProposalSession(null)}
            onDownloadCompanion={proposalSession.proposal.companionArtifact ? downloadCompanion : undefined}
            resolvedAfterApply={proposalSession.resolvedAfterApply}
          />
        )}

        {acceptanceSession && (
          <RiskAcceptanceWorkbench
            issue={acceptanceSession.issue}
            owner={acceptanceSession.owner}
            reason={acceptanceSession.reason}
            expiresAt={acceptanceSession.expiresAt}
            onOwner={(owner) => setAcceptanceSession({ ...acceptanceSession, owner })}
            onReason={(reason) => setAcceptanceSession({ ...acceptanceSession, reason })}
            onExpiresAt={(expiresAt) => setAcceptanceSession({ ...acceptanceSession, expiresAt })}
            onAccept={acceptRisk}
            onClose={() => setAcceptanceSession(null)}
          />
        )}

        {showTests && <TestPlan tests={tests} />}
        <IssueList
          issues={currentIssues}
          title={proof ? 'Remaining findings after hardening' : 'Findings'}
          eyebrow={proof ? 'REMAINING FINDINGS' : 'FINDINGS'}
          onGenerateFix={startProposal}
          onAcceptRisk={startAcceptance}
          onRevokeAcceptance={revokeAcceptance}
        />
        <footer>WorkflowProof v0.13 candidate · Static analysis provides evidence for review, not a guarantee or security certification. Preview changes, document accepted risks and review the resulting n8n workflow before production.</footer>
      </main>
    </div>
  );
}
