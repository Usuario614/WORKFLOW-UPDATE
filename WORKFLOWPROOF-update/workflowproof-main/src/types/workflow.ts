export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type RepairMode = 'auto' | 'guided' | 'manual';

export interface N8nNode {
  id?: string;
  name: string;
  type: string;
  typeVersion?: number | number[];
  position?: [number, number];
  parameters?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  disabled?: boolean;
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
  continueOnFail?: boolean;
  onError?: string;
  alwaysOutputData?: boolean;
  executeOnce?: boolean;
  notes?: string;
  notesInFlow?: boolean;
  webhookId?: string;
  [key: string]: unknown;
}

export interface N8nConnectionTarget {
  node: string;
  type: string;
  index: number;
}

export interface N8nWorkflow {
  id?: string;
  name?: string;
  active?: boolean;
  nodes: N8nNode[];
  connections: Record<string, Record<string, N8nConnectionTarget[][]>>;
  settings?: Record<string, unknown>;
  pinData?: Record<string, unknown>;
  staticData?: Record<string, unknown>;
  tags?: unknown[];
  meta?: Record<string, unknown>;
  versionId?: string;
  [key: string]: unknown;
}

export interface GraphNode {
  node: N8nNode;
  incoming: string[];
  outgoing: string[];
}

export interface ImpactAssessment {
  impactClass: string;
  reversibility: 'High' | 'Medium' | 'Low' | 'Unknown';
  financialRisk: 'None detected' | 'Possible' | 'Direct';
  rationale: string;
  affectedActions?: string[];
}

export interface RepairGuidance {
  mode: RepairMode;
  label: string;
  summary: string;
  steps: string[];
  caution?: string;
}

export interface RiskAcceptance {
  issueId: string;
  ruleId: string;
  nodeName?: string;
  owner: string;
  reason: string;
  acceptedAt: string;
  expiresAt?: string;
}

export interface RuleIssue {
  id: string;
  ruleId: string;
  title: string;
  severity: Severity;
  nodeName?: string;
  nodeType?: string;
  summary: string;
  whyItMatters: string;
  recommendation: string;
  evidence?: string[];
  category: string;
  autoFixable?: boolean;
  scorePenalty: number;
  impact?: ImpactAssessment;
  repair?: RepairGuidance;
  acceptance?: RiskAcceptance;
}

export interface RuleContext {
  workflow: N8nWorkflow;
  graph: Map<string, GraphNode>;
  nodes: N8nNode[];
  enabledNodes: N8nNode[];
}

export interface AuditRule {
  id: string;
  title: string;
  category: string;
  severity: Severity;
  scorePenalty: number;
  evaluate: (context: RuleContext) => RuleIssue[];
}

export interface ScoreBreakdown {
  reliability: number;
  recovery: number;
  dataSafety: number;
  security: number;
  maintainability: number;
  aiSafety: number;
}

export interface AuditReport {
  version: string;
  generatedAt: string;
  workflowName: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  scoring: {
    weightedBaseScore: number;
    appliedCap: number;
    capReason?: string;
    gate: 'blocked' | 'hardening' | 'review' | 'ready';
    gateLabel: string;
    acceptedRiskCount?: number;
    openRiskCount?: number;
  };
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    openCritical?: number;
    openHigh?: number;
    openMedium?: number;
    openLow?: number;
    openInfo?: number;
    nodesAnalyzed: number;
    connectionsAnalyzed: number;
    rulesRun: number;
  };
  breakdown: ScoreBreakdown;
  issues: RuleIssue[];
}

export interface AppliedFix {
  ruleId: string;
  nodeName?: string;
  description: string;
  source?: 'auto' | 'guided';
}

export interface ProposalInputOption {
  label: string;
  value: string;
}

export interface ProposalInput {
  key: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  help?: string;
  type?: 'text' | 'select' | 'date';
  options?: ProposalInputOption[];
}

export interface ProposalChange {
  path: string;
  before: string;
  after: string;
  description: string;
}

export interface GuidedFixProposal {
  id: string;
  issueId: string;
  ruleId: string;
  nodeName?: string;
  title: string;
  description: string;
  inputs: ProposalInput[];
  safetyChecks: string[];
  companionArtifact?: {
    label: string;
    fileName: string;
    description: string;
  };
}

export interface MaterializedProposal {
  proposalId: string;
  issueId: string;
  ruleId?: string;
  nodeName?: string;
  ready: boolean;
  changes: ProposalChange[];
  warnings: string[];
  workflow?: N8nWorkflow;
}

export interface RepairPlanItem {
  issueId: string;
  ruleId: string;
  nodeName?: string;
  severity: Severity;
  mode: RepairMode;
  title: string;
  summary: string;
  steps: string[];
  caution?: string;
}

export interface ComparisonResult {
  baselineName: string;
  candidateName: string;
  baseline: AuditReport;
  candidate: AuditReport;
  scoreDelta: number;
  weightedDelta: number;
  newIssues: RuleIssue[];
  resolvedIssues: RuleIssue[];
  unchangedIssues: RuleIssue[];
  carriedAcceptances: number;
  resolvedAcceptedRisks: number;
  acceptanceCarryFailures: number;
  gateExplanation: string;
  changeSignal: 'improved' | 'regressed' | 'mixed' | 'unchanged';
}

export interface SelfTestCaseResult {
  name: string;
  passed: boolean;
  details: string;
}

export interface SelfTestResult {
  passed: boolean;
  generatedAt: string;
  cases: SelfTestCaseResult[];
}
