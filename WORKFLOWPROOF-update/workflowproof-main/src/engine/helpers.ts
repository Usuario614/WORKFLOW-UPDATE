import type { ImpactAssessment, N8nNode, RuleIssue, Severity } from '../types/workflow';

export const lower = (value: unknown) => String(value ?? '').toLowerCase();

export const nodeTypeIncludes = (node: N8nNode, ...needles: string[]) => {
  const t = lower(node.type);
  return needles.some((needle) => t.includes(needle.toLowerCase()));
};

export const nodeNameIncludes = (node: N8nNode, ...needles: string[]) => {
  const t = lower(node.name);
  return needles.some((needle) => t.includes(needle.toLowerCase()));
};

export const stringify = (value: unknown) => {
  try { return JSON.stringify(value ?? {}); } catch { return String(value ?? ''); }
};

export const nodeBlob = (node: N8nNode) => lower(stringify({
  type: node.type,
  name: node.name,
  parameters: node.parameters,
  settings: {
    retryOnFail: node.retryOnFail,
    maxTries: node.maxTries,
    waitBetweenTries: node.waitBetweenTries,
    continueOnFail: node.continueOnFail,
    onError: node.onError,
    alwaysOutputData: node.alwaysOutputData,
  }
}));

// Names are user-authored labels, not reliable execution semantics. Matching a
// node called e.g. "Trigger notification" caused false positive graph findings.
export const isTrigger = (node: N8nNode) => nodeTypeIncludes(node, 'trigger', 'webhook');
export const isWebhook = (node: N8nNode) => nodeTypeIncludes(node, 'webhook');
export const isHttp = (node: N8nNode) => nodeTypeIncludes(node, 'httprequest', 'httpRequest');
export const isCode = (node: N8nNode) => nodeTypeIncludes(node, '.code', 'function', 'code');
export const isIfLike = (node: N8nNode) => nodeTypeIncludes(node, '.if', 'switch', 'filter');
export const isWait = (node: N8nNode) => nodeTypeIncludes(node, 'wait');
export const isMerge = (node: N8nNode) => nodeTypeIncludes(node, 'merge');
export const isSet = (node: N8nNode) => nodeTypeIncludes(node, 'set', 'editfields');
export const isAi = (node: N8nNode) => {
  const typeAndName = lower(node.type) + ' ' + lower(node.name);
  if (/openai|anthropic|gemini|ollama|langchain|llm|chatmodel|aiagent|\bagent\b/.test(typeAndName)) return true;

  // Generic HTTP nodes can still be model calls (for example a local Ollama endpoint).
  if (isHttp(node)) {
    const blob = nodeBlob(node);
    return /ollama|llama\d*|mistral|qwen|deepseek|api\/(?:generate|chat)|"model"\s*:/.test(blob);
  }

  return false;
};

export const isExternalSideEffect = (node: N8nNode) => {
  const blob = nodeBlob(node);
  const typeAndName = lower(node.type) + ' ' + lower(node.name);

  // AI inference calls are external interactions, but not business side effects by themselves.
  if (isAi(node)) return false;

  if (isHttp(node)) {
    const method = lower((node.parameters || {}).method || (node.parameters || {}).httpMethod || 'get');
    return !['get', 'head', 'options'].includes(method);
  }

  if (/google.?sheets/.test(typeAndName)) {
    return /(append|update|delete|clear|create|upsert|write)/.test(blob);
  }

  if (/postgres|mysql|mssql|mongodb/.test(typeAndName)) {
    if (/\b(select|find|get|read|search|list)\b/.test(blob) && !/\b(insert|update|delete|upsert|write|execute)\b/.test(blob)) return false;
    return true;
  }

  if (/hubspot|salesforce|notion|airtable|shopify|woocommerce/.test(typeAndName)) {
    if (/\b(get|read|search|list|lookup|retrieve)\b/.test(blob) && !/\b(create|update|delete|upsert|send|write|add|append)\b/.test(blob)) return false;
    return true;
  }

  return /(stripe|paypal|gmail|email|slack|discord|twilio|whatsapp|telegram|sendgrid|mailgun)/.test(typeAndName);
};



export interface SideEffectImpact extends ImpactAssessment {
  severity: 'critical' | 'high';
  scorePenalty: number;
}

/**
 * Context-aware blast-radius estimate for an external side effect.
 * This intentionally stays deterministic: it does not claim to know business
 * semantics that are not visible in the exported workflow.
 */
export function classifyExternalSideEffectImpact(node: N8nNode): SideEffectImpact {
  const blob = nodeBlob(node);
  const typeAndName = lower(node.type) + ' ' + lower(node.name);
  const all = `${typeAndName} ${blob}`;

  // Direct money movement / financial mutation.
  if (/(stripe|paypal|payment|charge|refund|payout|money transfer|bank transfer|capture payment|authorize payment)/.test(all)) {
    return {
      severity: 'critical',
      scorePenalty: 11,
      impactClass: 'Financial',
      reversibility: 'Low',
      financialRisk: 'Direct',
      rationale: 'The node appears capable of creating or changing a money-related transaction. Duplicate execution may have direct financial consequences.',
    };
  }

  // Privilege / access mutation.
  if (/(grant access|revoke access|permission|role assignment|add role|remove role|create user|disable user|enable user|invite user|credential|access control)/.test(all)) {
    return {
      severity: 'critical',
      scorePenalty: 11,
      impactClass: 'Security / access',
      reversibility: 'Low',
      financialRisk: 'None detected',
      rationale: 'The node appears capable of changing access, identity or privileges. Repeated execution can create a security-impacting state change.',
    };
  }

  // Destructive mutations. Do not classify generic words like "remove" alone;
  // require an action-like context to reduce false positives.
  if (/\b(delete|drop|purge|truncate|destroy|erase)\b/.test(all) || /(operation|action|method)[^}]{0,80}\b(clear|delete)\b/.test(all)) {
    return {
      severity: 'critical',
      scorePenalty: 11,
      impactClass: 'Destructive data',
      reversibility: 'Low',
      financialRisk: 'None detected',
      rationale: 'The node appears capable of destructive data mutation. Duplicate or unintended execution can remove or irreversibly alter data.',
    };
  }

  // Communication side effects are externally visible but generally do not
  // justify a Critical label by themselves.
  if (/(gmail|email|telegram|slack|discord|twilio|whatsapp|sendgrid|mailgun)/.test(typeAndName)) {
    return {
      severity: 'high',
      scorePenalty: 7,
      impactClass: 'Operational',
      reversibility: 'Medium',
      financialRisk: 'None detected',
      rationale: 'The node sends an externally visible communication. Duplicate execution can notify customers or operators more than once.',
    };
  }

  // Spreadsheet, CRM, SaaS and database writes primarily threaten data integrity.
  if (/(google.?sheets|hubspot|salesforce|notion|airtable|shopify|woocommerce|postgres|mysql|mssql|mongodb)/.test(typeAndName)) {
    return {
      severity: 'high',
      scorePenalty: 7,
      impactClass: 'Data integrity',
      reversibility: 'High',
      financialRisk: /invoice|order|checkout|subscription/.test(all) ? 'Possible' : 'None detected',
      rationale: 'The node mutates external business data. Duplicate execution can create duplicate records or inconsistent state, but no direct irreversible financial action was detected.',
    };
  }

  // Unknown non-GET HTTP mutation: meaningful risk, but do not call it
  // Critical without evidence of destructive, financial, or access impact.
  if (isHttp(node)) {
    const method = lower((node.parameters || {}).method || (node.parameters || {}).httpMethod || 'get').toUpperCase();
    return {
      severity: 'high',
      scorePenalty: 7,
      impactClass: 'Unknown mutation',
      reversibility: 'Unknown',
      financialRisk: 'Possible',
      rationale: `The node performs an external ${method || 'mutating'} request. Its exact business impact cannot be proven from static analysis, so severity is conservatively High rather than Critical.`,
    };
  }

  return {
    severity: 'high',
    scorePenalty: 7,
    impactClass: 'Operational',
    reversibility: 'Unknown',
    financialRisk: 'None detected',
    rationale: 'The node performs an externally visible side effect. Duplicate execution can create operational inconsistency.',
  };
}

export const hasRetry = (node: N8nNode) => Boolean(node.retryOnFail || node.maxTries && node.maxTries > 1);
export const hasContinueOnFail = (node: N8nNode) => Boolean(node.continueOnFail || lower(node.onError).includes('continueregularoutput'));
export const hasErrorOutput = (node: N8nNode) => lower(node.onError).includes('continueerroroutput');

export function makeIssue(args: {
  ruleId: string;
  title: string;
  severity: Severity;
  category: string;
  scorePenalty: number;
  summary: string;
  whyItMatters: string;
  recommendation: string;
  node?: N8nNode;
  evidence?: string[];
  autoFixable?: boolean;
  impact?: ImpactAssessment;
}): RuleIssue {
  // The fingerprint is intentionally derived from the inspected node state.
  // Rule + node name alone allowed a risk acceptance to follow a materially
  // changed node into a version comparison.
  const nodeFingerprint = args.node ? stringify({
    type: args.node.type,
    name: args.node.name,
    parameters: args.node.parameters,
    credentials: args.node.credentials,
    retryOnFail: args.node.retryOnFail,
    maxTries: args.node.maxTries,
    waitBetweenTries: args.node.waitBetweenTries,
    continueOnFail: args.node.continueOnFail,
    onError: args.node.onError,
  }) : 'workflow';
  const seed = `${args.ruleId}:${nodeFingerprint}:${args.summary}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  return {
    id: `${args.ruleId}-${Math.abs(hash)}`,
    ruleId: args.ruleId,
    title: args.title,
    severity: args.severity,
    category: args.category,
    scorePenalty: args.scorePenalty,
    summary: args.summary,
    whyItMatters: args.whyItMatters,
    recommendation: args.recommendation,
    nodeName: args.node?.name,
    nodeType: args.node?.type,
    evidence: args.evidence,
    autoFixable: args.autoFixable,
    impact: args.impact,
  };
}

export function deepFindStrings(value: unknown, predicate: (text: string) => boolean): string[] {
  const found: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === 'string') {
      if (predicate(v)) found.push(path ? `${path}: ${v}` : v);
      return;
    }
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`));
    if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, path ? `${path}.${k}` : k);
    }
  };
  walk(value, '');
  return found;
}
