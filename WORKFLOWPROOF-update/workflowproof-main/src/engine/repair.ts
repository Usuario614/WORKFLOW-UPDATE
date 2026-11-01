import type { RepairGuidance, RepairPlanItem, RuleIssue } from '../types/workflow';

const auto: Record<string, RepairGuidance> = {
  HTTP_NO_RETRY: {
    mode: 'auto',
    label: 'SAFE AUTO-FIX',
    summary: 'Enable bounded n8n node retries for this HTTP request.',
    steps: ['Enable retryOnFail.', 'Use at least 3 attempts.', 'Wait at least 2 seconds between attempts.'],
    caution: 'Retries reduce transient failures but do not replace idempotency for APIs that may partially succeed.',
  },
  HTTP_NO_TIMEOUT_HINT: {
    mode: 'auto',
    label: 'SAFE AUTO-FIX',
    summary: 'Add a finite request timeout without changing the workflow route.',
    steps: ['Set HTTP Request options.timeout to 30000 ms.', 'Keep the existing success/error connections unchanged.'],
  },
};

const guided: Record<string, RepairGuidance> = {
  HTTP_PLAINTEXT_REMOTE_URL: {
    mode: 'guided',
    label: 'GUIDED FIX',
    summary: 'Move the remote endpoint to HTTPS or document a private-network exception.',
    steps: [
      'Confirm whether the remote service supports HTTPS.',
      'Replace the plaintext origin with the provider HTTPS endpoint.',
      'If traffic is intentionally private, document the network boundary and compensating controls.',
      'Re-test authentication and certificates after the endpoint change.',
    ],
  },
  MUTATING_HTTP_RETRY_NO_IDEMPOTENCY: {
    mode: 'guided',
    label: 'GUIDED FIX',
    summary: 'Add a provider-supported idempotency key before retrying the write.',
    steps: [
      'Identify the stable business/event identifier for this write.',
      'Map it to the provider idempotency header/body field when available.',
      'Ensure retries reuse the same key rather than generating a new one.',
      'Test the ambiguous-success case: provider commits the write but the response times out.',
    ],
    caution: 'WorkflowProof will not invent an idempotency key because the correct value is business-specific.',
  },
  GET_WEBHOOK_TO_SIDE_EFFECT: {
    mode: 'guided',
    label: 'GUIDED FIX',
    summary: 'Use a state-changing HTTP method and protect the webhook boundary.',
    steps: [
      'Confirm the sender can call POST/PUT/PATCH instead of GET.',
      'Change the webhook method only after the sender is updated.',
      'Require authentication/signature validation.',
      'Add replay/idempotency protection before external writes.',
    ],
    caution: 'Changing the HTTP method without coordinating the sender will break incoming events.',
  },
  WEBHOOK_SIDE_EFFECT_NO_DEDUP: {
    mode: 'guided',
    label: 'GUIDED FIX',
    summary: 'Add an idempotency boundary before externally visible side effects.',
    steps: [
      'Choose a stable event key from the webhook payload (provider event ID is preferred).',
      'Check that key in a durable store before side effects run.',
      'Stop or acknowledge the execution when the key already exists.',
      'Only mark the key as completed after the business action succeeds.',
      'Define replay behavior for failed/partial executions.',
    ],
    caution: 'WorkflowProof cannot safely guess the correct business event key or persistence store from static JSON alone.',
  },
  WEBHOOK_NO_AUTH_HINT: {
    mode: 'guided',
    label: 'GUIDED FIX',
    summary: 'Protect the webhook with authentication or provider signature verification.',
    steps: [
      'Identify the webhook sender/provider.',
      'Prefer the provider signature/HMAC scheme when available.',
      'Validate the signature before any write, notification or AI action.',
      'Reject invalid requests with a deterministic response.',
    ],
    caution: 'Authentication details are provider-specific; inserting a generic secret could break legitimate callers.',
  },
  NO_ERROR_WORKFLOW: {
    mode: 'guided',
    label: 'GUIDED FIX',
    summary: 'Attach a workflow-level error workflow for production failures.',
    steps: [
      'Create or select an n8n Error Trigger workflow.',
      'Capture workflow name, execution ID, failing node and error message.',
      'Send a concise operational alert without secrets.',
      'Persist enough context for replay when the process is business-critical.',
      'Select that workflow under the production workflow error settings.',
    ],
    caution: 'The exported JSON does not include a safe target workflow ID that WorkflowProof can invent automatically.',
  },
  SIDE_EFFECT_WITHOUT_RECOVERY: {
    mode: 'guided',
    label: 'GUIDED FIX',
    summary: 'Add explicit recovery to side-effect nodes that can leave external state inconsistent.',
    steps: [
      'Identify which listed actions are safe to retry and which require idempotency first.',
      'Add bounded retries only to retry-safe actions.',
      'Route exhausted failures to an error output or recovery branch.',
      'Store failed event context when manual replay may be required.',
    ],
    caution: 'Automatically retrying a non-idempotent write can itself create duplicates, so this is intentionally guided.',
  },
  NO_REPLAY_HINT: {
    mode: 'guided',
    label: 'GUIDED FIX',
    summary: 'Create a replay/dead-letter path for failed events.',
    steps: [
      'Persist the original event plus execution/failure metadata.',
      'Use a stable replay identifier.',
      'Provide a controlled path to retry after the underlying issue is fixed.',
      'Prevent replay from bypassing deduplication safeguards.',
    ],
  },
  DIRECT_TRIGGER_TO_SIDE_EFFECT: {
    mode: 'guided',
    label: 'GUIDED FIX',
    summary: 'Insert a deterministic validation boundary before the external action.',
    steps: [
      'Validate required fields and data types.',
      'Reject/quarantine malformed input.',
      'Add authorization or deduplication checks when the trigger can be replayed.',
      'Only continue to the external write after validation passes.',
    ],
  },
  AI_NO_STRUCTURED_OUTPUT_HINT: {
    mode: 'guided',
    label: 'GUIDED FIX',
    summary: 'Enforce a machine-validated output contract around the model response.',
    steps: [
      'Define the expected JSON/schema fields and allowed values.',
      'Parse model output deterministically.',
      'Reject or quarantine malformed responses.',
      'Use safe defaults only when they cannot trigger harmful downstream actions.',
    ],
  },
  AI_DIRECT_SIDE_EFFECT: {
    mode: 'guided',
    label: 'GUIDED FIX',
    summary: 'Separate model judgment from the node that mutates external state.',
    steps: [
      'Insert deterministic validation after the model.',
      'Allow-list the values/actions the model may request.',
      'Require human approval for high-impact actions.',
      'Keep the write/action node downstream of that policy boundary.',
    ],
  },
  AI_PROMPT_INJECTION_SURFACE: {
    mode: 'guided',
    label: 'GUIDED FIX',
    summary: 'Reduce prompt-injection authority before model output can influence actions.',
    steps: [
      'Keep untrusted user content distinct from trusted instructions.',
      'Minimize model tool/credential permissions.',
      'Validate model outputs independently of prompt instructions.',
      'Do not let model text directly choose arbitrary URLs, commands or recipients.',
    ],
  },
  GOOGLE_SHEETS_AS_CRITICAL_STATE: {
    mode: 'guided',
    label: 'GUIDED FIX',
    summary: 'Decide whether the spreadsheet is operational storage or a correctness-critical state store.',
    steps: [
      'Identify whether duplicate prevention or business correctness depends on the sheet.',
      'If yes, move that state to a store with uniqueness/transaction guarantees.',
      'If no, document the sheet as reporting/operational storage and keep critical state elsewhere.',
    ],
  },
  CODE_WITHOUT_ERROR_PATH: {
    mode: 'guided',
    label: 'GUIDED FIX',
    summary: 'Give the Code node an explicit failure contract instead of letting exceptions terminate invisibly.',
    steps: [
      'List the expected input shape and the errors the code can intentionally raise.',
      'Wrap provider/parsing logic so expected failures produce a structured error object.',
      'Route failed items to an error/recovery branch or deliberately stop the workflow.',
      'Preserve the execution/event identifier so the failed item can be replayed safely.',
    ],
    caution: 'Automatically converting exceptions into continue-on-fail behavior could hide real defects, so WorkflowProof does not change this silently.',
  },
  PII_TO_EXTERNAL_AI: {
    mode: 'guided',
    label: 'GUIDED FIX',
    summary: 'Minimize or redact personal data before sending content to an AI provider.',
    steps: [
      'Identify which input fields are actually required by the model task.',
      'Remove or pseudonymize names, emails, phone numbers and identifiers that are not required.',
      'Send the smallest useful payload to the provider.',
      'Document retention/data-processing expectations for the selected provider.',
    ],
    caution: 'WorkflowProof cannot determine the lawful purpose or contractual data-processing terms from workflow JSON alone.',
  },
  HARDCODED_ENV_URL: {
    mode: 'guided',
    label: 'GUIDED FIX',
    summary: 'Move the environment-specific endpoint out of workflow logic.',
    steps: [
      'Create an environment/config value for the endpoint or host.',
      'Reference that value from the HTTP node instead of a fixed development/localhost URL.',
      'Define separate development and production values.',
      'Re-scan the exported production workflow to confirm the endpoint is intentional.',
    ],
  },
  EXPRESSION_DEFAULT_MISSING: {
    mode: 'guided',
    label: 'GUIDED FIX',
    summary: 'Define what should happen when the referenced value is missing or empty.',
    steps: [
      'Identify whether the field is required or optional.',
      'For required data, validate and stop/quarantine before the side effect.',
      'For optional data, add an explicit safe fallback value.',
      'Test null, empty string and missing-field inputs.',
    ],
    caution: 'A generic fallback can corrupt business data, so WorkflowProof will not invent one.',
  },
  FIXED_EMAIL_RECIPIENT: {
    mode: 'guided',
    label: 'GUIDED FIX',
    summary: 'Make the notification recipient an explicit configuration choice.',
    steps: [
      'Confirm whether the fixed recipient is intentional for production.',
      'If it varies by environment/client, move it to configuration.',
      'Validate the resolved recipient before sending.',
      'Avoid letting untrusted workflow input freely select a privileged recipient.',
    ],
  },
  NO_TERMINAL_CHECKPOINT: {
    mode: 'guided',
    label: 'GUIDED FIX',
    summary: 'Add an explicit completion checkpoint for the business operation.',
    steps: [
      'Define what successful completion means for this workflow.',
      'Record or emit a stable success marker only after required side effects finish.',
      'Include the event/execution identifier in that marker.',
      'Use the checkpoint to distinguish completed work from partial executions during replay.',
    ],
  },
  NO_ALERTING_HINT: {
    mode: 'guided',
    label: 'GUIDED FIX',
    summary: 'Add an operational alert for failures that require attention.',
    steps: [
      'Choose an owner/channel for actionable alerts.',
      'Include workflow, execution and failing-node context.',
      'Avoid logging credentials or full sensitive payloads.',
      'Rate-limit/deduplicate alerts so an outage does not create an alert storm.',
    ],
  },
  NO_VALIDATION_NODES: {
    mode: 'guided',
    label: 'GUIDED FIX',
    summary: 'Insert deterministic input validation before external writes or model-driven actions.',
    steps: [
      'List required fields, types and allowed values.',
      'Reject or quarantine malformed input before side effects.',
      'Keep validation independent from AI/model output.',
      'Add fixtures for missing, null, malformed and oversized inputs.',
    ],
  },
  UNBOUNDED_AI_AGENT_TOOLS: {
    mode: 'guided',
    label: 'GUIDED FIX',
    summary: 'Reduce the tools/actions an AI agent can invoke without deterministic policy checks.',
    steps: [
      'List the minimum tools the agent actually needs.',
      'Remove unused write-capable tools.',
      'Validate tool arguments against an allow-list/schema.',
      'Require human approval for destructive, financial or access-changing actions.',
    ],
  },
};

export function guidanceForIssue(issue: RuleIssue): RepairGuidance {
  if (issue.ruleId === 'HTTP_NO_RETRY' && issue.autoFixable === false) {
    return {
      mode: 'guided',
      label: 'GUIDED FIX',
      summary: 'Add idempotency before enabling retries on this mutating HTTP request.',
      steps: [
        'Identify whether the provider supports an idempotency key or duplicate request identifier.',
        'Derive that key from a stable business/event identifier.',
        'Ensure every retry reuses the same key.',
        'Only then enable bounded retries with backoff.',
      ],
      caution: 'WorkflowProof intentionally does not auto-enable retries on mutating HTTP methods because ambiguous success can duplicate side effects.',
    };
  }
  const known = auto[issue.ruleId] || guided[issue.ruleId];
  if (known) return known;

  return {
    mode: 'manual',
    label: 'MANUAL REVIEW',
    summary: issue.recommendation,
    steps: ['Review the evidence and recommendation.', 'Confirm the business intent before changing workflow behavior.'],
    caution: 'WorkflowProof does not have enough static evidence to modify this safely.',
  };
}

export function attachRepairGuidance(issue: RuleIssue): RuleIssue {
  return { ...issue, repair: guidanceForIssue(issue) };
}

export function buildRepairPlan(issues: RuleIssue[]): RepairPlanItem[] {
  return issues.map((issue) => {
    const guidance = issue.repair || guidanceForIssue(issue);
    return {
      issueId: issue.id,
      ruleId: issue.ruleId,
      nodeName: issue.nodeName,
      severity: issue.severity,
      mode: guidance.mode,
      title: issue.title,
      summary: guidance.summary,
      steps: guidance.steps,
      caution: guidance.caution,
    };
  });
}
