import type { AuditRule, N8nNode, RuleContext, RuleIssue } from '../types/workflow';
import {
  classifyExternalSideEffectImpact,
  deepFindStrings,
  hasContinueOnFail,
  hasErrorOutput,
  hasRetry,
  isAi,
  isCode,
  isExternalSideEffect,
  isHttp,
  isIfLike,
  isTrigger,
  isWebhook,
  lower,
  makeIssue,
  nodeBlob,
  nodeNameIncludes,
  nodeTypeIncludes,
  stringify,
} from './helpers';
import { ancestorsOf, reachableFrom } from './graph';

const workflowIssue = (
  rule: Pick<AuditRule, 'id' | 'title' | 'category' | 'severity' | 'scorePenalty'>,
  summary: string,
  whyItMatters: string,
  recommendation: string,
  evidence?: string[],
): RuleIssue => makeIssue({
  ruleId: rule.id,
  title: rule.title,
  severity: rule.severity,
  category: rule.category,
  scorePenalty: rule.scorePenalty,
  summary,
  whyItMatters,
  recommendation,
  evidence,
});

const perNodeRule = (
  base: Omit<AuditRule, 'evaluate'>,
  predicate: (node: N8nNode, ctx: RuleContext) => boolean,
  content: (node: N8nNode, ctx: RuleContext) => Pick<RuleIssue, 'summary' | 'whyItMatters' | 'recommendation' | 'evidence' | 'autoFixable' | 'impact'>,
): AuditRule => ({
  ...base,
  evaluate: (ctx) => ctx.enabledNodes.filter((n) => predicate(n, ctx)).map((node) => {
    const detail = content(node, ctx);
    return makeIssue({ ruleId: base.id, title: base.title, severity: base.severity, category: base.category, scorePenalty: base.scorePenalty, ...detail, node });
  }),
});

const hasNodeMatching = (ctx: RuleContext, fn: (node: N8nNode) => boolean) => ctx.enabledNodes.some(fn);
const containsAny = (text: string, values: string[]) => values.some((v) => text.includes(v));
const params = (node: N8nNode) => stringify(node.parameters || {}).toLowerCase();

export const RULES: AuditRule[] = [
  {
    id: 'GRAPH_INTEGRITY', title: 'Workflow graph has an unresolved reference',
    category: 'Reliability', severity: 'critical', scorePenalty: 12,
    evaluate(ctx) {
      const names = new Set<string>();
      const problems = new Set<string>();
      for (const node of ctx.nodes) {
        if (names.has(node.name)) problems.add(`Duplicate node name: ${JSON.stringify(node.name)}`);
        names.add(node.name);
      }
      for (const [source, ports] of Object.entries(ctx.workflow.connections)) {
        if (!names.has(source)) problems.add(`Missing source node: ${JSON.stringify(source)}`);
        for (const [port, outputs] of Object.entries(ports)) {
          outputs.forEach((targets, index) => {
            for (const target of targets || []) {
              if (!names.has(target.node)) problems.add(`${JSON.stringify(source)} / ${port}[${index}] points to missing node ${JSON.stringify(target.node)}`);
            }
          });
        }
      }
      return [...problems].map(problem => workflowIssue(this, problem,
        'n8n resolves connections by node name. This route cannot be resolved unambiguously.',
        'Open the workflow in n8n, repair the named connection or duplicate, then export and scan again.'));
    },
  },
  perNodeRule(
    { id: 'HTTP_NO_RETRY', title: 'External request has no retry strategy', category: 'Reliability', severity: 'high', scorePenalty: 6 },
    (n) => isHttp(n) && !hasRetry(n),
    (n) => {
      const method = lower((n.parameters || {}).method || (n.parameters || {}).httpMethod || 'get');
      const readOnly = ['get', 'head', 'options'].includes(method);
      return {
        summary: 'An HTTP request can fail transiently without any retry policy.',
        whyItMatters: 'Rate limits, network interruptions and temporary 5xx errors can turn recoverable incidents into lost executions.',
        recommendation: readOnly
          ? 'Enable bounded retries with backoff and route exhausted retries to an error path or queue.'
          : 'Add provider-supported idempotency first, then enable bounded retries. Mutating requests are not auto-retried by WorkflowProof.',
        autoFixable: readOnly,
      };
    },
  ),
  perNodeRule(
    { id: 'HTTP_CONTINUE_ON_FAIL', title: 'HTTP failure may be silently ignored', category: 'Data Safety', severity: 'high', scorePenalty: 7 },
    (n) => isHttp(n) && hasContinueOnFail(n),
    () => ({
      summary: 'This request is configured to continue after failure.',
      whyItMatters: 'Downstream nodes can act on missing or invalid data while the execution still looks superficially successful.',
      recommendation: 'Handle the failure explicitly, validate the response and branch to a recovery path.',
      autoFixable: false,
    }),
  ),
  perNodeRule(
    { id: 'HTTP_NO_TIMEOUT_HINT', title: 'HTTP call has no explicit timeout hint', category: 'Reliability', severity: 'medium', scorePenalty: 3 },
    (n) => isHttp(n) && !/(timeout)/i.test(params(n)),
    () => ({
      summary: 'No explicit timeout configuration was found in this HTTP node.',
      whyItMatters: 'Slow upstream services can hold executions open and amplify concurrency or queue pressure.',
      recommendation: 'Set a finite request timeout appropriate to the provider and design a timeout recovery path.',
      autoFixable: true,
    }),
  ),
  perNodeRule(
    { id: 'HTTP_STATIC_BEARER', title: 'Possible hard-coded authorization secret', category: 'Security', severity: 'critical', scorePenalty: 12 },
    (n) => isHttp(n) && deepFindStrings(n.parameters, (s) => /bearer\s+[a-z0-9._\-]{12,}/i.test(s)).length > 0,
    (n) => ({
      summary: 'A bearer token-like value appears to be embedded directly in node parameters.',
      whyItMatters: 'Exported workflow JSON can leak secrets through source control, backups, screenshots or support channels.',
      recommendation: 'Move secrets to n8n credentials or environment-backed secret storage and rotate the exposed token.',
      evidence: deepFindStrings(n.parameters, (s) => /bearer\s+[a-z0-9._\-]{12,}/i.test(s)).map((x) => x.replace(/Bearer\s+\S+/ig, 'Bearer [REDACTED]')).slice(0, 2),
      autoFixable: false,
    }),
  ),
  perNodeRule(
    { id: 'GENERIC_SECRET_LITERAL', title: 'Possible secret embedded in workflow', category: 'Security', severity: 'critical', scorePenalty: 12 },
    (n) => deepFindStrings(n.parameters, (s) => /(?:api[_-]?key|secret|token|password)\s*[:=]\s*["']?[a-z0-9_\-]{10,}/i.test(s)).length > 0,
    (n) => ({
      summary: 'A secret-like literal appears in node configuration.',
      whyItMatters: 'Workflow exports are commonly shared. Embedded secrets make accidental credential disclosure much more likely.',
      recommendation: 'Replace literal secrets with credential references or environment variables and rotate any exposed value.',
      evidence: ['Potential secret detected; value intentionally redacted.'],
      autoFixable: false,
    }),
  ),
  perNodeRule(
    { id: 'WEBHOOK_NO_AUTH_HINT', title: 'Webhook may be unauthenticated', category: 'Security', severity: 'high', scorePenalty: 7 },
    (n) => isWebhook(n) && !/(auth|headerauth|basicauth|jwt|hmac|signature)/i.test(nodeBlob(n)),
    () => ({
      summary: 'No obvious authentication or signature-validation configuration was found for this webhook.',
      whyItMatters: 'Public webhook endpoints can be invoked by untrusted callers unless the sender is authenticated or the payload is signed.',
      recommendation: 'Require authentication or validate a provider signature/HMAC before performing any side effect.',
      autoFixable: false,
    }),
  ),
  {
    id: 'WEBHOOK_SIDE_EFFECT_NO_DEDUP', title: 'Webhook can reach side effects without visible deduplication', category: 'Reliability', severity: 'high', scorePenalty: 7,
    evaluate: (ctx) => {
      const issues: RuleIssue[] = [];
      const severityRank = { high: 1, critical: 2 } as const;
      const reversibilityRank = { High: 1, Medium: 2, Unknown: 3, Low: 4 } as const;
      const financialRank = { 'None detected': 1, Possible: 2, Direct: 3 } as const;

      for (const webhook of ctx.enabledNodes.filter(isWebhook)) {
        const reachable = reachableFrom(ctx.graph, webhook.name);
        const sideEffects = ctx.enabledNodes.filter((n) => reachable.has(n.name) && n.name !== webhook.name && isExternalSideEffect(n));
        if (!sideEffects.length) continue;
        const corridor = ctx.enabledNodes.filter((n) => reachable.has(n.name));
        const hasDedupHint = corridor.some((n) => /(dedup|idempot|processed event|event.?id|duplicate|unique)/i.test(nodeBlob(n)));
        if (!hasDedupHint) {
          const assessments = sideEffects.map((node) => ({ node, impact: classifyExternalSideEffectImpact(node) }));
          const worst = assessments.reduce((a, b) => severityRank[b.impact.severity] > severityRank[a.impact.severity] ? b : a);
          const severity = worst.impact.severity;
          const scorePenalty = severity === 'critical' ? 11 : 7;
          const reversibility = assessments.reduce((a, b) => reversibilityRank[b.impact.reversibility] > reversibilityRank[a] ? b.impact.reversibility : a, assessments[0].impact.reversibility);
          const financialRisk = assessments.reduce((a, b) => financialRank[b.impact.financialRisk] > financialRank[a] ? b.impact.financialRisk : a, assessments[0].impact.financialRisk);
          const classes = Array.from(new Set(assessments.map((x) => x.impact.impactClass)));
          const impactClass = classes.length === 1 ? classes[0] : `Mixed: ${classes.join(' + ')}`;
          const criticalActions = assessments.filter((x) => x.impact.severity === 'critical');

          issues.push(makeIssue({
            ruleId: 'WEBHOOK_SIDE_EFFECT_NO_DEDUP', title: 'Webhook can reach side effects without visible deduplication', category: 'Reliability', severity, scorePenalty,
            node: webhook,
            summary: severity === 'critical'
              ? `Webhook can repeat ${sideEffects.length} side effect(s), including at least one high-impact action.`
              : `Webhook can repeat ${sideEffects.length} operational side effect(s) without an obvious idempotency guard.`,
            whyItMatters: severity === 'critical'
              ? 'Webhook providers commonly retry deliveries. Here, duplicate delivery can repeat a financial, destructive or access-changing action.'
              : 'Webhook providers commonly retry deliveries. The same event can therefore create duplicate records, messages or external writes and leave systems inconsistent.',
            recommendation: 'Persist a stable event identifier before side effects, reject already-processed events and only mark success after the business action completes.',
            evidence: assessments.slice(0, 8).map(({ node, impact }) => `Reachable side effect: ${node.name} — ${impact.impactClass} — ${impact.severity.toUpperCase()}`),
            autoFixable: false,
            impact: {
              impactClass,
              reversibility,
              financialRisk,
              affectedActions: assessments.map((x) => x.node.name),
              rationale: criticalActions.length
                ? `Critical classification is driven by: ${criticalActions.map((x) => x.node.name).join(', ')}. ${criticalActions[0].impact.rationale}`
                : `No direct financial, destructive, or access-changing action was detected. Highest observed blast radius is operational/data-integrity impact, so this finding is High rather than Critical.`,
            },
          }));
        }
      }
      return issues;
    },
  },
  perNodeRule(
    { id: 'PAYMENT_NO_DEDUP_HINT', title: 'Payment-related action lacks visible idempotency hint', category: 'Data Safety', severity: 'critical', scorePenalty: 12 },
    (n, ctx) => /(stripe|paypal|payment|charge|invoice)/i.test(nodeBlob(n)) && !Array.from(ancestorsOf(ctx.graph, n.name)).some((name) => { const ancestor = ctx.graph.get(name)?.node; return ancestor ? /(dedup|idempot|event.?id|duplicate)/i.test(nodeBlob(ancestor)) : false; }),
    () => ({
      summary: 'A payment-related action appears reachable without a visible deduplication/idempotency stage.',
      whyItMatters: 'Retries or duplicate events around money movement can cause duplicate charges, invoices or irreversible financial actions.',
      recommendation: 'Use provider idempotency keys and an application-level processed-event store before the payment side effect.',
      autoFixable: false,
      impact: {
        impactClass: 'Financial',
        reversibility: 'Low',
        financialRisk: 'Direct',
        rationale: 'A payment-related mutation is visible in the workflow, so duplicate execution can have direct financial consequences.',
      },
    }),
  ),
  perNodeRule(
    { id: 'AI_NO_STRUCTURED_OUTPUT_HINT', title: 'AI output may be unstructured', category: 'AI Safety', severity: 'high', scorePenalty: 6 },
    (n) => isAi(n) && !/(json|schema|structured|output parser|zod|format)/i.test(nodeBlob(n)),
    () => ({
      summary: 'No obvious schema or structured-output constraint was detected for this AI node.',
      whyItMatters: 'Free-form model output is brittle when downstream nodes expect stable keys, types or machine-readable decisions.',
      recommendation: 'Constrain output to a schema and validate it before any downstream side effect.',
      autoFixable: false,
    }),
  ),
  perNodeRule(
    { id: 'AI_DIRECT_SIDE_EFFECT', title: 'AI decision appears close to an external side effect', category: 'AI Safety', severity: 'high', scorePenalty: 7 },
    (n, ctx) => {
      if (!isAi(n)) return false;
      const primary = ctx.workflow.connections?.[n.name]?.main?.[0] || [];
      return primary.some((target) => {
        const targetNode = ctx.graph.get(target.node)?.node;
        return targetNode ? isExternalSideEffect(targetNode) : false;
      });
    },
    (n, ctx) => ({
      summary: `AI output flows directly into: ${(ctx.workflow.connections?.[n.name]?.main?.[0] || []).map((x) => x.node).join(', ')}.`,
      whyItMatters: 'A hallucinated or malformed model response can immediately trigger messages, writes or external actions.',
      recommendation: 'Insert deterministic validation, allow-listing and—where impact is high—human approval before the side effect.',
      autoFixable: false,
    }),
  ),
  perNodeRule(
    { id: 'AI_PROMPT_INJECTION_SURFACE', title: 'AI node may consume untrusted text without visible guardrails', category: 'AI Safety', severity: 'medium', scorePenalty: 4 },
    (n, ctx) => isAi(n) && Array.from(ancestorsOf(ctx.graph, n.name)).some((name) => {
      const a = ctx.graph.get(name)?.node;
      return a ? isWebhook(a) || /form|email|chat|telegram|slack|discord|whatsapp/i.test(nodeBlob(a)) : false;
    }) && !/(sanitize|instruction|untrusted|prompt injection|system message|guardrail)/i.test(nodeBlob(n)),
    () => ({
      summary: 'This AI node appears downstream of user-controlled input without an obvious prompt-injection boundary.',
      whyItMatters: 'Untrusted content can attempt to override instructions, exfiltrate context or manipulate automated decisions.',
      recommendation: 'Separate trusted instructions from untrusted content, minimize tool permissions and validate model outputs independently.',
      autoFixable: false,
    }),
  ),
  perNodeRule(
    { id: 'CODE_WITHOUT_ERROR_PATH', title: 'Code node has no visible failure strategy', category: 'Recovery', severity: 'medium', scorePenalty: 4 },
    (n, ctx) => isCode(n) && !hasContinueOnFail(n) && !hasErrorOutput(n) && !/try[\s\S]*catch/i.test(nodeBlob(n)) && (ctx.graph.get(n.name)?.outgoing.length || 0) <= 1,
    () => ({
      summary: 'Custom code executes without an obvious alternate error/recovery path.',
      whyItMatters: 'Parsing, transformations and custom API logic are common sources of runtime exceptions that can stop an entire workflow.',
      recommendation: 'Validate assumptions inside the code and route failures to a dedicated error workflow or recovery branch.',
      autoFixable: false,
    }),
  ),
  perNodeRule(
    { id: 'CODE_DYNAMIC_EVAL', title: 'Dynamic code execution pattern detected', category: 'Security', severity: 'high', scorePenalty: 7 },
    (n) => isCode(n) && /\beval\s*\(|new\s+Function\s*\(/i.test(params(n)),
    () => ({
      summary: 'The code appears to use eval() or Function() style dynamic execution.',
      whyItMatters: 'Dynamic execution increases injection risk and makes behavior harder to review or constrain.',
      recommendation: 'Replace dynamic execution with explicit parsing and allow-listed operations.',
      autoFixable: false,
    }),
  ),
  perNodeRule(
    { id: 'DB_WRITE_NO_GUARD', title: 'Database write may lack input validation', category: 'Data Safety', severity: 'high', scorePenalty: 6 },
    (n, ctx) => /(postgres|mysql|mssql|mongodb|supabase|database)/i.test(nodeBlob(n)) && /(insert|update|delete|execute)/i.test(nodeBlob(n)) && !Array.from(ancestorsOf(ctx.graph, n.name)).some((name) => {
      const a = ctx.graph.get(name)?.node;
      return a ? isIfLike(a) || /(validate|schema|sanitize|guard)/i.test(nodeBlob(a)) : false;
    }),
    () => ({
      summary: 'A database write is reachable without an obvious upstream validation gate.',
      whyItMatters: 'Malformed or unexpected input can create bad records, destructive updates or hard-to-repair data quality issues.',
      recommendation: 'Validate required fields, types and invariants before executing the write.',
      autoFixable: false,
    }),
  ),
  perNodeRule(
    { id: 'DESTRUCTIVE_OPERATION', title: 'Potential destructive operation detected', category: 'Data Safety', severity: 'high', scorePenalty: 6 },
    (n) => /\b(delete|remove|truncate|drop|cancel|refund|archive)\b/i.test(`${lower((n.parameters || {}).operation)} ${lower((n.parameters || {}).resource)} ${lower(n.name)}`) && isExternalSideEffect(n),
    () => ({
      summary: 'This node appears capable of deleting, refunding, cancelling or otherwise destructively changing external state.',
      whyItMatters: 'Destructive operations are difficult or impossible to reverse when triggered by bad input or duplicate execution.',
      recommendation: 'Add strict predicates, idempotency protection and human approval for high-impact cases.',
      autoFixable: false,
    }),
  ),
  perNodeRule(
    { id: 'IF_SINGLE_BRANCH', title: 'Conditional node appears to use only one outcome', category: 'Maintainability', severity: 'medium', scorePenalty: 3 },
    (n, ctx) => isIfLike(n) && (ctx.graph.get(n.name)?.outgoing.length || 0) <= 1,
    () => ({
      summary: 'Only one downstream destination was detected from this conditional node.',
      whyItMatters: 'Unhandled outcomes can silently terminate items or make exceptional cases invisible.',
      recommendation: 'Handle both expected and unexpected outcomes explicitly, especially around business-critical decisions.',
      autoFixable: false,
    }),
  ),
  {
    id: 'ORPHAN_NODE', title: 'Disconnected node', category: 'Maintainability', severity: 'low', scorePenalty: 1,
    evaluate: (ctx) => ctx.enabledNodes.filter((n) => {
      const g = ctx.graph.get(n.name);
      return g && !isTrigger(n) && g.incoming.length === 0 && g.outgoing.length === 0;
    }).map((node) => makeIssue({
      ruleId: 'ORPHAN_NODE', title: 'Disconnected node', category: 'Maintainability', severity: 'low', scorePenalty: 1,
      node,
      summary: 'This enabled node is disconnected from the workflow graph.',
      whyItMatters: 'Dead or forgotten nodes increase maintenance cost and can mislead reviewers about intended behavior.',
      recommendation: 'Remove the node or reconnect it if it is still part of the intended workflow.',
      autoFixable: true,
    })),
  },
  {
    id: 'DISABLED_NODE', title: 'Disabled node remains in workflow', category: 'Maintainability', severity: 'low', scorePenalty: 1,
    evaluate: (ctx) => ctx.nodes.filter((n) => Boolean(n.disabled)).map((node) => makeIssue({
      ruleId: 'DISABLED_NODE', title: 'Disabled node remains in workflow', category: 'Maintainability', severity: 'low', scorePenalty: 1,
      node,
      summary: 'A disabled node remains in the exported workflow.',
      whyItMatters: 'Disabled production nodes can represent unfinished migrations, stale logic or confusing dead code.',
      recommendation: 'Remove stale nodes or document why they intentionally remain disabled.',
      autoFixable: false,
    })),
  },
  perNodeRule(
    { id: 'NODE_WITHOUT_NOTES_CRITICAL', title: 'High-impact node is undocumented', category: 'Maintainability', severity: 'low', scorePenalty: 1 },
    (n) => (isWebhook(n) || isHttp(n) || /(payment|stripe|paypal|delete|refund|database)/i.test(nodeBlob(n))) && !n.notes,
    () => ({
      summary: 'This high-impact integration has no node notes.',
      whyItMatters: 'Operational context, invariants and provider assumptions are easily lost when workflows change hands.',
      recommendation: 'Document purpose, failure expectations and any non-obvious assumptions directly on the node.',
      autoFixable: true,
    }),
  ),
  {
    id: 'NO_ERROR_WORKFLOW', title: 'No workflow-level error workflow configured', category: 'Recovery', severity: 'high', scorePenalty: 6,
    evaluate: (ctx) => {
      const s = stringify(ctx.workflow.settings || {}).toLowerCase();
      if (/errorworkflow/.test(s)) return [];
      if (ctx.enabledNodes.length < 3) return [];
      return [workflowIssue(
        { id: 'NO_ERROR_WORKFLOW', title: 'No workflow-level error workflow configured', category: 'Recovery', severity: 'high', scorePenalty: 6 },
        'No workflow-level error workflow reference was detected.',
        'Unhandled failures can disappear into execution history instead of entering an operational recovery process.',
        'Configure an error workflow that captures context, alerts an owner and preserves enough data for replay.',
      )];
    },
  },
  {
    id: 'NO_TRIGGER', title: 'No trigger detected', category: 'Maintainability', severity: 'medium', scorePenalty: 3,
    evaluate: (ctx) => hasNodeMatching(ctx, isTrigger) ? [] : [workflowIssue(
      { id: 'NO_TRIGGER', title: 'No trigger detected', category: 'Maintainability', severity: 'medium', scorePenalty: 3 },
      'No obvious trigger or webhook node was detected.',
      'The workflow may be intended as a sub-workflow, but if not, it has no visible production entry point.',
      'Confirm that this is intentionally called by another workflow; otherwise add an explicit trigger.',
    )],
  },
  {
    id: 'MULTIPLE_TRIGGER_COMPLEXITY', title: 'Multiple entry points increase behavior complexity', category: 'Maintainability', severity: 'low', scorePenalty: 1,
    evaluate: (ctx) => {
      const triggers = ctx.enabledNodes.filter(isTrigger);
      if (triggers.length <= 2) return [];
      return [workflowIssue(
        { id: 'MULTIPLE_TRIGGER_COMPLEXITY', title: 'Multiple entry points increase behavior complexity', category: 'Maintainability', severity: 'low', scorePenalty: 1 },
        `${triggers.length} trigger-like nodes were detected.`,
        'Different entry points can exercise different assumptions and make testing coverage harder to reason about.',
        'Document each entry point and ensure test cases exist for all of them.',
        triggers.map((n) => n.name),
      )];
    },
  },
  {
    id: 'LARGE_WORKFLOW', title: 'Large workflow may be difficult to operate safely', category: 'Maintainability', severity: 'medium', scorePenalty: 3,
    evaluate: (ctx) => ctx.enabledNodes.length > 40 ? [workflowIssue(
      { id: 'LARGE_WORKFLOW', title: 'Large workflow may be difficult to operate safely', category: 'Maintainability', severity: 'medium', scorePenalty: 3 },
      `${ctx.enabledNodes.length} enabled nodes were detected.`,
      'Large workflows have wider blast radius, are harder to test comprehensively and often mix unrelated responsibilities.',
      'Consider extracting stable sub-workflows around clear business boundaries.',
    )] : [],
  },
  {
    id: 'NO_PINNED_TEST_DATA', title: 'No pinned example data detected', category: 'Maintainability', severity: 'info', scorePenalty: 0,
    evaluate: (ctx) => Object.keys(ctx.workflow.pinData || {}).length ? [] : [workflowIssue(
      { id: 'NO_PINNED_TEST_DATA', title: 'No pinned example data detected', category: 'Maintainability', severity: 'info', scorePenalty: 0 },
      'The export contains no pinned example data.',
      'Pinned data is not required in production, but realistic fixtures can make regression testing and review easier during development.',
      'Maintain representative test fixtures outside production if you intentionally avoid pinning data in the workflow.',
    )],
  },
  {
    id: 'NO_VALIDATION_NODES', title: 'No obvious validation layer detected', category: 'Data Safety', severity: 'medium', scorePenalty: 4,
    evaluate: (ctx) => {
      const riskyInput = hasNodeMatching(ctx, (n) => isWebhook(n) || /form|email|chat|telegram|whatsapp/i.test(nodeBlob(n)));
      const validation = hasNodeMatching(ctx, (n) => isIfLike(n) || /(validate|schema|sanitize|guard)/i.test(nodeBlob(n)));
      if (!riskyInput || validation) return [];
      return [workflowIssue(
        { id: 'NO_VALIDATION_NODES', title: 'No obvious validation layer detected', category: 'Data Safety', severity: 'medium', scorePenalty: 4 },
        'External input enters the workflow without an obvious validation/sanitization stage.',
        'Unexpected nulls, wrong types and malicious payloads can propagate deep into integrations before failing.',
        'Validate required fields, types, allowed values and size limits near the workflow boundary.',
      )];
    },
  },
  perNodeRule(
    { id: 'PII_TO_EXTERNAL_AI', title: 'Possible personal data sent to AI provider', category: 'Security', severity: 'medium', scorePenalty: 4 },
    (n) => isAi(n) && /(email|phone|address|name|customer|patient|dob|birth|cpf|ssn)/i.test(nodeBlob(n)),
    () => ({
      summary: 'Prompt/configuration references fields commonly associated with personal data.',
      whyItMatters: 'Sending personal data to a model provider can create privacy, retention or contractual obligations depending on the use case.',
      recommendation: 'Minimize data sent to the model, redact unnecessary identifiers and verify the provider configuration fits your privacy requirements.',
      autoFixable: false,
    }),
  ),
  perNodeRule(
    { id: 'LOGGING_SENSITIVE_DATA_HINT', title: 'Sensitive data may be logged or forwarded', category: 'Security', severity: 'medium', scorePenalty: 4 },
    (n) => /(slack|discord|email|telegram|log)/i.test(nodeBlob(n)) && /(password|token|secret|authorization|credit.?card|ssn|cpf)/i.test(nodeBlob(n)),
    () => ({
      summary: 'A notification/logging-like node references fields that may be sensitive.',
      whyItMatters: 'Operational alerts can accidentally become a secondary store for credentials or regulated data.',
      recommendation: 'Redact sensitive fields before notifications and log only identifiers needed for debugging.',
      autoFixable: false,
    }),
  ),
  perNodeRule(
    { id: 'RAW_EXPRESSION_URL', title: 'Dynamic URL may need allow-listing', category: 'Security', severity: 'medium', scorePenalty: 4 },
    (n) => {
      if (!isHttp(n)) return false;
      const url = String((n.parameters || {}).url || '');
      return /https?:\/\/.*\{\{|\{\{.*https?:\/\//i.test(url);
    },
    () => ({
      summary: 'The HTTP target appears to be dynamically constructed from an expression.',
      whyItMatters: 'User-controlled or weakly validated URLs can enable server-side request forgery or accidental calls to unintended hosts.',
      recommendation: 'Prefer fixed provider base URLs or validate the hostname against an explicit allow-list.',
      autoFixable: false,
    }),
  ),
  perNodeRule(
    { id: 'BATCHLESS_BULK_HINT', title: 'Bulk processing may lack batching', category: 'Reliability', severity: 'medium', scorePenalty: 3 },
    (n, ctx) => isExternalSideEffect(n) && /(all items|each item|bulk|many|rows|contacts|records)/i.test(nodeBlob(n)) && !hasNodeMatching(ctx, (x) => /(splitinbatches|loop over items|batch)/i.test(nodeBlob(x))),
    () => ({
      summary: 'A potentially bulk external action is present without an obvious batching node.',
      whyItMatters: 'Large item counts can hit provider rate limits, memory pressure or execution time limits.',
      recommendation: 'Process bounded batches with backoff and checkpoint progress for resumability.',
      autoFixable: false,
    }),
  ),
  {
    id: 'SIDE_EFFECT_WITHOUT_RECOVERY', title: 'External side effects lack visible recovery path', category: 'Recovery', severity: 'high', scorePenalty: 6,
    evaluate: (ctx) => {
      const effects = ctx.enabledNodes.filter(isExternalSideEffect);
      const risky = effects.filter((n) => !hasRetry(n) && !hasContinueOnFail(n) && !hasErrorOutput(n) && (ctx.graph.get(n.name)?.outgoing.length || 0) <= 1);
      if (!risky.length) return [];
      return [workflowIssue(
        { id: 'SIDE_EFFECT_WITHOUT_RECOVERY', title: 'External side effects lack visible recovery path', category: 'Recovery', severity: 'high', scorePenalty: 6 },
        `${risky.length} external action node(s) have no obvious retry or recovery strategy.`,
        'Failures after partial external writes can leave systems inconsistent or require manual reconstruction.',
        'Add bounded retries, explicit failure handling and a replayable dead-letter mechanism for high-value operations.',
        risky.slice(0, 8).map((n) => n.name),
      )];
    },
  },
  {
    id: 'NO_ALERTING_HINT', title: 'No operational alerting hint detected', category: 'Recovery', severity: 'medium', scorePenalty: 3,
    evaluate: (ctx) => {
      const hasExternal = hasNodeMatching(ctx, isExternalSideEffect);
      const hasAlert = hasNodeMatching(ctx, (n) => /(alert|ops|error|incident|failure|slack|telegram|discord|email)/i.test(nodeBlob(n)));
      if (!hasExternal || hasAlert) return [];
      return [workflowIssue(
        { id: 'NO_ALERTING_HINT', title: 'No operational alerting hint detected', category: 'Recovery', severity: 'medium', scorePenalty: 3 },
        'The workflow performs external actions but no obvious alerting/incident path was detected.',
        'Silent production failures extend time-to-detection and can compound data loss or missed customer actions.',
        'Send actionable failure alerts containing execution ID, failing node and a replay reference—without leaking secrets.',
      )];
    },
  },
  {
    id: 'NO_WAIT_AROUND_RATE_LIMITED_APIS', title: 'No pacing detected around multiple API calls', category: 'Reliability', severity: 'low', scorePenalty: 2,
    evaluate: (ctx) => {
      const httpCount = ctx.enabledNodes.filter(isHttp).length;
      const waitCount = ctx.enabledNodes.filter((n) => nodeTypeIncludes(n, 'wait')).length;
      if (httpCount < 4 || waitCount > 0) return [];
      return [workflowIssue(
        { id: 'NO_WAIT_AROUND_RATE_LIMITED_APIS', title: 'No pacing detected around multiple API calls', category: 'Reliability', severity: 'low', scorePenalty: 2 },
        `${httpCount} HTTP nodes were detected with no Wait/pacing node.`,
        'Bursty workflows can exceed third-party quotas even if individual requests are valid.',
        'Confirm provider rate limits and add batching/backoff where the same execution can generate bursts.',
      )];
    },
  },
  perNodeRule(
    { id: 'HARDCODED_ENV_URL', title: 'Environment-specific URL appears hard-coded', category: 'Maintainability', severity: 'low', scorePenalty: 2 },
    (n) => isHttp(n) && /(localhost|127\.0\.0\.1|staging\.|dev\.|test\.)/i.test(params(n)),
    () => ({
      summary: 'An environment-specific host appears directly in an HTTP node.',
      whyItMatters: 'Hard-coded environment URLs make promotion from development to production error-prone.',
      recommendation: 'Move base URLs into environment variables or a centralized configuration layer.',
      autoFixable: false,
    }),
  ),
  perNodeRule(
    { id: 'EXPRESSION_DEFAULT_MISSING', title: 'Expression may lack a fallback for missing data', category: 'Data Safety', severity: 'low', scorePenalty: 2 },
    (n) => deepFindStrings(n.parameters, (s) => /\{\{[^}]*\$json\.[^}]+\}\}/.test(s) && !/(\?\?|\|\||optional|default)/i.test(s)).length >= 3,
    (n) => ({
      summary: 'Several direct $json field expressions were detected without obvious fallback handling.',
      whyItMatters: 'Missing fields from upstream schema drift can create undefined values or runtime failures.',
      recommendation: 'Validate input at boundaries and use explicit defaults only where semantically safe.',
      evidence: deepFindStrings(n.parameters, (s) => /\{\{[^}]*\$json\.[^}]+\}\}/.test(s)).slice(0, 3),
      autoFixable: false,
    }),
  ),
  perNodeRule(
    { id: 'PUBLIC_WEBHOOK_SENSITIVE_ACTION', title: 'Public webhook reaches sensitive action', category: 'Security', severity: 'critical', scorePenalty: 10 },
    (n, ctx) => {
      if (!isWebhook(n)) return false;
      const reach = reachableFrom(ctx.graph, n.name);
      return ctx.enabledNodes.some((x) => reach.has(x.name) && /(payment|stripe|paypal|delete|refund|admin|database)/i.test(nodeBlob(x)));
    },
    () => ({
      summary: 'This webhook can reach a sensitive financial, destructive or database-like action.',
      whyItMatters: 'Any weakness in authentication, validation or replay protection at the webhook boundary has a high blast radius.',
      recommendation: 'Require signed requests, strict validation, replay protection and least-privilege credentials before the sensitive path.',
      autoFixable: false,
    }),
  ),
  {
    id: 'ALL_SIDE_EFFECTS_AFTER_TRIGGER', title: 'Workflow has a wide external blast radius', category: 'Reliability', severity: 'medium', scorePenalty: 4,
    evaluate: (ctx) => {
      const effects = ctx.enabledNodes.filter(isExternalSideEffect);
      if (effects.length < 7) return [];
      return [workflowIssue(
        { id: 'ALL_SIDE_EFFECTS_AFTER_TRIGGER', title: 'Workflow has a wide external blast radius', category: 'Reliability', severity: 'medium', scorePenalty: 4 },
        `${effects.length} nodes can affect external systems.`,
        'A single bad input or regression can fan out across many systems, increasing rollback and incident complexity.',
        'Split unrelated responsibilities, add checkpoints and verify high-impact branches independently.',
        effects.slice(0, 10).map((n) => n.name),
      )];
    },
  },
  {
    id: 'NO_EXPLICIT_ACTIVE_SETTING', title: 'Workflow export does not indicate active state', category: 'Maintainability', severity: 'info', scorePenalty: 0,
    evaluate: (ctx) => typeof ctx.workflow.active === 'boolean' ? [] : [workflowIssue(
      { id: 'NO_EXPLICIT_ACTIVE_SETTING', title: 'Workflow export does not indicate active state', category: 'Maintainability', severity: 'info', scorePenalty: 0 },
      'No explicit active flag was found in the export.',
      'This may be normal for some export formats, but deployment reviews should know whether activation is intentional.',
      'Confirm activation state during deployment rather than relying only on the file.',
    )],
  },
  perNodeRule(
    { id: 'CREDENTIAL_REFERENCE_MISSING', title: 'Integration may not use n8n credential storage', category: 'Security', severity: 'low', scorePenalty: 2 },
    (n) => isExternalSideEffect(n) && isHttp(n) && !n.credentials && /(authorization|api.?key|token|secret)/i.test(params(n)),
    () => ({
      summary: 'An HTTP integration references authentication-related parameters but no n8n credential object is attached.',
      whyItMatters: 'Manual auth headers are easier to leak and harder to rotate consistently than managed credentials.',
      recommendation: 'Prefer n8n credentials where the provider is supported, or centralize secret injection outside the exported workflow.',
      autoFixable: false,
    }),
  ),
  perNodeRule(
    { id: 'FIXED_EMAIL_RECIPIENT', title: 'Hard-coded notification recipient', category: 'Maintainability', severity: 'low', scorePenalty: 1 },
    (n) => /(gmail|email|sendgrid|mailgun)/i.test(nodeBlob(n)) && /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(params(n)),
    () => ({
      summary: 'A fixed email address appears directly in node parameters.',
      whyItMatters: 'Hard-coded recipients make environment changes and team ownership transitions easy to miss.',
      recommendation: 'Move operational recipients to configuration unless the address is intentionally part of the business logic.',
      autoFixable: false,
    }),
  ),
  {
    id: 'NO_TERMINAL_CHECKPOINT', title: 'No obvious success checkpoint', category: 'Recovery', severity: 'low', scorePenalty: 2,
    evaluate: (ctx) => {
      const terminal = ctx.enabledNodes.filter((n) => (ctx.graph.get(n.name)?.outgoing.length || 0) === 0);
      const ok = terminal.some((n) => /(success|complete|done|mark|status|log|notify|respond)/i.test(nodeBlob(n)));
      if (ctx.enabledNodes.length < 5 || ok) return [];
      return [workflowIssue(
        { id: 'NO_TERMINAL_CHECKPOINT', title: 'No obvious success checkpoint', category: 'Recovery', severity: 'low', scorePenalty: 2 },
        'No terminal node clearly records or communicates successful completion.',
        'Without a durable completion checkpoint, partial runs can be difficult to distinguish from completed business operations.',
        'Record a stable success state or completion event for workflows that mutate important external systems.',
      )];
    },
  },
  {
    id: 'NO_VERSION_NOTE', title: 'Workflow lacks visible version/change note', category: 'Maintainability', severity: 'info', scorePenalty: 0,
    evaluate: (ctx) => {
      const blob = lower(ctx.workflow.meta) + ' ' + lower(ctx.workflow.name) + ' ' + ctx.enabledNodes.map((n) => lower(n.notes)).join(' ');
      return /(version|v\d+|changelog|release)/i.test(blob) ? [] : [workflowIssue(
        { id: 'NO_VERSION_NOTE', title: 'Workflow lacks visible version/change note', category: 'Maintainability', severity: 'info', scorePenalty: 0 },
        'No human-readable version/change marker was detected.',
        'Automation changes can alter external behavior without the deployment discipline commonly used for application code.',
        'Keep workflow JSON in source control and document meaningful production changes.',
      )];
    },
  },
  perNodeRule(
    { id: 'GOOGLE_SHEETS_AS_CRITICAL_STATE', title: 'Spreadsheet may be used as critical state store', category: 'Data Safety', severity: 'medium', scorePenalty: 4 },
    (n) => /(google.?sheets)/i.test(nodeBlob(n)) && /(append|update|write|lookup)/i.test(nodeBlob(n)),
    () => ({
      summary: 'Google Sheets appears to participate in workflow state or persistence.',
      whyItMatters: 'Sheets can work well operationally but have weaker transactional guarantees and concurrency controls than a database.',
      recommendation: 'If this state prevents duplicates or controls money/customer actions, use a transactional store with a uniqueness constraint.',
      autoFixable: false,
    }),
  ),
  perNodeRule(
    { id: 'UNBOUNDED_AI_AGENT_TOOLS', title: 'AI agent may have broad tool access', category: 'AI Safety', severity: 'high', scorePenalty: 7 },
    (n) => /(aiagent|agent)/i.test(nodeBlob(n)) && /(tool|tools)/i.test(nodeBlob(n)) && !/(approval|human|allowlist|allowed|read.?only)/i.test(nodeBlob(n)),
    () => ({
      summary: 'An AI agent appears to have tool access without an obvious approval or allow-list boundary.',
      whyItMatters: 'Agents can take unintended actions when instructions are ambiguous, adversarial or based on incorrect model reasoning.',
      recommendation: 'Apply least privilege, separate read/write tools and require deterministic policy checks for impactful actions.',
      autoFixable: false,
    }),
  ),
  {
    id: 'NO_REPLAY_HINT', title: 'No replay/dead-letter mechanism detected', category: 'Recovery', severity: 'medium', scorePenalty: 4,
    evaluate: (ctx) => {
      const hasSideEffects = hasNodeMatching(ctx, isExternalSideEffect);
      const hint = hasNodeMatching(ctx, (n) => /(dead.?letter|dlq|replay|failed queue|retry queue|failed events)/i.test(nodeBlob(n)));
      if (!hasSideEffects || hint) return [];
      return [workflowIssue(
        { id: 'NO_REPLAY_HINT', title: 'No replay/dead-letter mechanism detected', category: 'Recovery', severity: 'medium', scorePenalty: 4 },
        'No explicit failed-event queue or replay mechanism was detected.',
        'Manual recovery becomes difficult when transient incidents affect many events or external writes are only partially completed.',
        'Persist failed event context in a replayable store for critical workflows.',
      )];
    },
  },
  {
    id: 'DIRECT_TRIGGER_TO_SIDE_EFFECT', title: 'Trigger reaches side effect with minimal checks', category: 'Data Safety', severity: 'high', scorePenalty: 6,
    evaluate: (ctx) => {
      const issues: RuleIssue[] = [];
      for (const trigger of ctx.enabledNodes.filter(isTrigger)) {
        const out = ctx.graph.get(trigger.name)?.outgoing || [];
        for (const name of out) {
          const target = ctx.graph.get(name)?.node;
          if (target && isExternalSideEffect(target) && !isIfLike(target)) {
            issues.push(makeIssue({
              ruleId: 'DIRECT_TRIGGER_TO_SIDE_EFFECT', title: 'Trigger reaches side effect with minimal checks', category: 'Data Safety', severity: 'high', scorePenalty: 6,
              node: trigger,
              summary: `Trigger connects directly to external action “${target.name}”.`,
              whyItMatters: 'Unvalidated events can mutate external systems immediately, leaving no boundary for schema validation, authorization or deduplication.',
              recommendation: 'Insert validation and, for retryable event sources, an idempotency guard before the side effect.',
              autoFixable: false,
            }));
          }
        }
      }
      return issues;
    },
  },
  perNodeRule(
    { id: 'UNSAFE_CONTINUE_ON_FAIL_SIDE_EFFECT', title: 'Side-effect failure is configured to continue', category: 'Recovery', severity: 'high', scorePenalty: 7 },
    (n) => isExternalSideEffect(n) && hasContinueOnFail(n),
    () => ({
      summary: 'This external action can fail while downstream execution continues.',
      whyItMatters: 'Later nodes may assume the external action succeeded, creating inconsistent state across systems.',
      recommendation: 'Branch on failure explicitly and only continue normal processing after success is confirmed.',
      autoFixable: false,
    }),
  ),
  {
    id: 'DUPLICATE_NODE_NAMES_CASE', title: 'Node names differ only by case/spacing', category: 'Maintainability', severity: 'low', scorePenalty: 1,
    evaluate: (ctx) => {
      const normalized = new Map<string, string[]>();
      for (const n of ctx.nodes) {
        const key = n.name.toLowerCase().replace(/\s+/g, ' ').trim();
        normalized.set(key, [...(normalized.get(key) || []), n.name]);
      }
      const dupes = Array.from(normalized.values()).filter((v) => v.length > 1);
      return dupes.map((names) => workflowIssue(
        { id: 'DUPLICATE_NODE_NAMES_CASE', title: 'Node names differ only by case/spacing', category: 'Maintainability', severity: 'low', scorePenalty: 1 },
        `Ambiguous node names: ${names.join(', ')}`,
        'Similar names make expressions, reviews and incident debugging more error-prone.',
        'Use unique, descriptive names that explain the business action performed by each node.',
      ));
    },
  },
  perNodeRule(
    { id: 'HTTP_PLAINTEXT_REMOTE_URL', title: 'Remote HTTP endpoint is not encrypted', category: 'Security', severity: 'high', scorePenalty: 7 },
    (n) => isHttp(n) && deepFindStrings(n.parameters, (value) => /^http:\/\//i.test(value) && !/^http:\/\/(?:localhost|127\.0\.0\.1|\[?::1\]?)(?::|\/|$)/i.test(value)).length > 0,
    (n) => ({
      summary: 'An HTTP node appears to call a remote endpoint over plaintext HTTP.',
      whyItMatters: 'Credentials, personal data and business payloads can be exposed or modified in transit when TLS is not used.',
      recommendation: 'Use HTTPS/TLS for remote services or document a private-network exception with compensating controls.',
      evidence: deepFindStrings(n.parameters, (value) => /^http:\/\//i.test(value)).slice(0, 2),
      autoFixable: false,
    }),
  ),
  perNodeRule(
    { id: 'HTTP_SENSITIVE_QUERY_PARAM', title: 'Possible secret embedded in URL query parameters', category: 'Security', severity: 'critical', scorePenalty: 12 },
    (n) => isHttp(n) && deepFindStrings(n.parameters, (value) => /[?&](?:api[_-]?key|token|secret|password|access[_-]?token)=([^&{]{8,})/i.test(value)).length > 0,
    () => ({
      summary: 'A token/password-like value appears directly in an HTTP URL query string.',
      whyItMatters: 'URLs are frequently logged by proxies, providers and execution tooling, making query-string secrets especially easy to leak.',
      recommendation: 'Move the secret into managed n8n credentials or a protected header and rotate any exposed value.',
      evidence: ['Potential query-string secret detected; value intentionally redacted.'],
      autoFixable: false,
    }),
  ),
  perNodeRule(
    { id: 'MUTATING_HTTP_RETRY_NO_IDEMPOTENCY', title: 'Mutating HTTP request retries without visible idempotency', category: 'Reliability', severity: 'high', scorePenalty: 7 },
    (n) => {
      if (!isHttp(n) || !hasRetry(n)) return false;
      const method = lower((n.parameters || {}).method || (n.parameters || {}).httpMethod || 'get');
      return ['post', 'put', 'patch', 'delete'].includes(method) && !/(idempot|dedup|event.?id|request.?id|unique)/i.test(nodeBlob(n));
    },
    () => ({
      summary: 'This mutating HTTP action is configured to retry, but no idempotency key or duplicate-protection hint is visible on the node.',
      whyItMatters: 'A timeout after the provider accepted the write can cause a retry to repeat the same business action.',
      recommendation: 'Use the provider idempotency mechanism or a stable request/event key before enabling automatic retries for writes.',
      autoFixable: false,
    }),
  ),
  {
    id: 'GET_WEBHOOK_TO_SIDE_EFFECT', title: 'GET webhook can trigger external side effects', category: 'Security', severity: 'high', scorePenalty: 7,
    evaluate: (ctx) => {
      const issues: RuleIssue[] = [];
      for (const webhook of ctx.enabledNodes.filter(isWebhook)) {
        const method = lower((webhook.parameters || {}).httpMethod || 'get');
        if (method !== 'get') continue;
        const reachable = reachableFrom(ctx.graph, webhook.name);
        const effects = ctx.enabledNodes.filter((node) => reachable.has(node.name) && isExternalSideEffect(node));
        if (!effects.length) continue;
        issues.push(makeIssue({
          ruleId: 'GET_WEBHOOK_TO_SIDE_EFFECT', title: 'GET webhook can trigger external side effects', category: 'Security', severity: 'high', scorePenalty: 7,
          node: webhook,
          summary: `GET webhook reaches ${effects.length} externally visible action(s).`,
          whyItMatters: 'GET endpoints can be pre-fetched, cached, crawled or triggered unintentionally and are expected to be safe/read-only by many systems.',
          recommendation: 'Use POST/PUT/PATCH for state-changing webhook operations and require authentication/replay protection.',
          evidence: effects.slice(0, 6).map((node) => `Reachable side effect: ${node.name}`),
          autoFixable: false,
        }));
      }
      return issues;
    },
  },
  perNodeRule(
    { id: 'EXECUTE_COMMAND_NODE', title: 'Execute Command node has host-level blast radius', category: 'Security', severity: 'critical', scorePenalty: 12 },
    (n) => nodeTypeIncludes(n, 'executecommand') || /execute command/i.test(n.name),
    () => ({
      summary: 'This workflow can execute operating-system commands on the n8n host/container.',
      whyItMatters: 'Command execution can access files, network resources and process-level privileges far beyond normal workflow scope.',
      recommendation: 'Remove the node where possible; otherwise isolate the runtime, use strict allow-lists and require explicit human review before production.',
      autoFixable: false,
    }),
  ),
  perNodeRule(
    { id: 'SSH_MUTATING_COMMAND', title: 'SSH node appears to run a mutating remote command', category: 'Security', severity: 'high', scorePenalty: 7 },
    (n) => nodeTypeIncludes(n, 'ssh') && /(\brm\b|\bmv\b|chmod|chown|systemctl|service\s+|docker\s+|kubectl\s+(?:delete|apply|patch)|shutdown|reboot|>\s*\/)/i.test(nodeBlob(n)),
    () => ({
      summary: 'An SSH integration appears to run a command that can modify remote system state.',
      whyItMatters: 'Remote shell actions can be difficult to roll back and may bypass application-level validation or audit controls.',
      recommendation: 'Use least-privilege credentials, allow-listed commands and an approval boundary for destructive or administrative actions.',
      autoFixable: false,
    }),
  ),
  {
    id: 'PINNED_SECRET_DATA', title: 'Pinned example data may contain a secret', category: 'Security', severity: 'high', scorePenalty: 7,
    evaluate: (ctx) => {
      if (!ctx.workflow.pinData) return [];
      const blob = stringify(ctx.workflow.pinData);
      if (!/(?:api[_-]?key|secret|token|password|authorization)["']?\s*[:=]\s*["'][^"']{8,}/i.test(blob) && !/bearer\s+[a-z0-9._-]{12,}/i.test(blob)) return [];
      return [workflowIssue(
        { id: 'PINNED_SECRET_DATA', title: 'Pinned example data may contain a secret', category: 'Security', severity: 'high', scorePenalty: 7 },
        'Pinned workflow fixture data contains a credential/token-like pattern.',
        'Pinned data is exported with the workflow and can leak through source control, demos or support bundles.',
        'Remove the secret from pinned data, rotate it if real, and replace it with a synthetic fixture value.',
        ['Potential secret detected in pinData; value intentionally redacted.'],
      )];
    },
  },
  {
    id: 'PINNED_PII_DATA', title: 'Pinned example data contains personal-data patterns', category: 'Data Safety', severity: 'medium', scorePenalty: 4,
    evaluate: (ctx) => {
      if (!ctx.workflow.pinData) return [];
      const blob = stringify(ctx.workflow.pinData);
      const matches = [] as string[];
      if (/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(blob)) matches.push('email address');
      if (/\+?\d[\d\s().-]{7,}\d/.test(blob)) matches.push('phone-like value');
      if (!matches.length) return [];
      return [workflowIssue(
        { id: 'PINNED_PII_DATA', title: 'Pinned example data contains personal-data patterns', category: 'Data Safety', severity: 'medium', scorePenalty: 4 },
        `Pinned fixture data contains ${matches.join(' and ')} patterns.`,
        'Real personal data in workflow fixtures can be copied into repositories, tickets and screenshots.',
        'Use synthetic/anonymized fixtures and keep real customer data out of exported pinData.',
        matches,
      )];
    },
  },
  {
    id: 'ERROR_WORKFLOW_SELF_REFERENCE', title: 'Workflow appears to reference itself as its Error Workflow', category: 'Recovery', severity: 'critical', scorePenalty: 12,
    evaluate: (ctx) => {
      const configured = String((ctx.workflow.settings || {}).errorWorkflow || '');
      const id = String(ctx.workflow.id || '');
      if (!configured || !id || configured !== id) return [];
      return [workflowIssue(
        { id: 'ERROR_WORKFLOW_SELF_REFERENCE', title: 'Workflow appears to reference itself as its Error Workflow', category: 'Recovery', severity: 'critical', scorePenalty: 12 },
        `settings.errorWorkflow points back to workflow ID ${id}.`,
        'An error handler that recursively invokes the same failing workflow can create repeated failures and incident amplification.',
        'Select a separate workflow beginning with an Error Trigger and keep its responsibilities minimal.',
      )];
    },
  },
  perNodeRule(
    { id: 'EXCESSIVE_RETRY_COUNT', title: 'Retry count is unusually high', category: 'Reliability', severity: 'medium', scorePenalty: 4 },
    (n) => Number(n.maxTries || 0) > 8,
    (n) => ({
      summary: `This node is configured for ${Number(n.maxTries || 0)} attempts.`,
      whyItMatters: 'Aggressive retries can amplify provider outages, increase duplicate side effects and extend execution duration.',
      recommendation: 'Use a bounded retry budget with backoff and move prolonged recovery to a queue/dead-letter process.',
      autoFixable: false,
    }),
  ),
  perNodeRule(
    { id: 'VERY_LONG_HTTP_TIMEOUT', title: 'HTTP timeout is unusually long', category: 'Reliability', severity: 'low', scorePenalty: 2 },
    (n) => {
      if (!isHttp(n)) return false;
      const options = (n.parameters || {}).options;
      const timeout = options && typeof options === 'object' && !Array.isArray(options) ? Number((options as Record<string, unknown>).timeout || 0) : 0;
      return timeout > 120000;
    },
    () => ({
      summary: 'The HTTP request can wait more than two minutes before timing out.',
      whyItMatters: 'Very long waits tie up executions and can interact poorly with webhook/provider time limits and retry behavior.',
      recommendation: 'Use a shorter request timeout and move long-running work to asynchronous polling/callback patterns where possible.',
      autoFixable: false,
    }),
  ),
  {
    id: 'EMPTY_WORKFLOW', title: 'Workflow contains no nodes', category: 'Maintainability', severity: 'critical', scorePenalty: 20,
    evaluate: (ctx) => ctx.nodes.length ? [] : [workflowIssue(
      { id: 'EMPTY_WORKFLOW', title: 'Workflow contains no nodes', category: 'Maintainability', severity: 'critical', scorePenalty: 20 },
      'The imported JSON contains an empty nodes array.',
      'There is no executable workflow to audit.',
      'Export a complete n8n workflow JSON and try again.',
    )],
  },
];

export const RULE_COUNT = RULES.length;
