import type {
  GuidedFixProposal,
  MaterializedProposal,
  N8nNode,
  N8nWorkflow,
  ProposalChange,
  ProposalInput,
  RuleIssue,
} from '../types/workflow';

type Template = {
  title: string;
  description: string;
  inputs: (issue: RuleIssue, workflow: N8nWorkflow) => ProposalInput[];
  safetyChecks: string[];
  materialize: (issue: RuleIssue, workflow: N8nWorkflow, values: Record<string, string>) => MaterializedProposal;
};

function clone<T>(value: T): T { return structuredClone(value); }
function safeEnvName(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^([0-9])/, '_$1') || 'WORKFLOWPROOF_VALUE';
}
function nodeByName(workflow: N8nWorkflow, nodeName?: string) {
  return nodeName ? workflow.nodes.find((node) => node.name === nodeName) : undefined;
}
function stringifyValue(value: unknown) {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}
function setAtPath(target: Record<string, unknown>, path: string[], value: unknown) {
  let cursor: Record<string, unknown> = target;
  path.forEach((key, idx) => {
    if (idx === path.length - 1) { cursor[key] = value; return; }
    const next = cursor[key];
    if (!next || typeof next !== 'object' || Array.isArray(next)) cursor[key] = {};
    cursor = cursor[key] as Record<string, unknown>;
  });
}
function getAtPath(target: unknown, path: string[]): unknown {
  let cursor: unknown = target;
  for (const key of path) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}
function findFirstEmailPath(value: unknown, path: string[] = []): string[] | null {
  if (typeof value === 'string') return /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(value) ? path : null;
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const found = findFirstEmailPath(value[i], [...path, String(i)]);
      if (found) return found;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const found = findFirstEmailPath(child, [...path, key]);
    if (found) return found;
  }
  return null;
}
function setAtMixedPath(target: unknown, path: string[], value: unknown) {
  let cursor: any = target;
  path.forEach((key, idx) => {
    if (idx === path.length - 1) { cursor[key] = value; return; }
    cursor = cursor[key];
  });
}
function error(message: string, proposalId: string, issueId: string): MaterializedProposal {
  return { proposalId, issueId, ready: false, changes: [], warnings: [message] };
}
function materialized(
  proposalId: string,
  issue: RuleIssue,
  workflow: N8nWorkflow,
  changes: ProposalChange[],
  warnings: string[] = [],
): MaterializedProposal {
  return { proposalId, issueId: issue.id, ruleId: issue.ruleId, nodeName: issue.nodeName, ready: true, changes, warnings, workflow };
}
function required(values: Record<string, string>, key: string) {
  return (values[key] || '').trim();
}

const templates: Record<string, Template> = {
  NO_ERROR_WORKFLOW: {
    title: 'Attach an existing n8n Error Workflow',
    description: 'WorkflowProof can safely write the selected Error Workflow ID into workflow.settings after you provide the target ID.',
    inputs: () => [{
      key: 'errorWorkflowId', label: 'Error Workflow ID', placeholder: 'Example: 42 or J5nS7...', required: true,
      help: 'Create/select the Error Trigger workflow in n8n first, then paste its workflow ID here.',
    }],
    safetyChecks: [
      'Does not create or guess an Error Workflow.',
      'Only changes workflow.settings.errorWorkflow.',
      'Original workflow remains unchanged until you approve the preview.',
    ],
    materialize: (issue, original, values) => {
      const proposalId = `${issue.ruleId}:${issue.nodeName || 'workflow'}`;
      const id = required(values, 'errorWorkflowId');
      if (!id) return error('Enter an Error Workflow ID before approval.', proposalId, issue.id);
      const workflow = clone(original);
      if (workflow.id && id === String(workflow.id)) {
        return error('An Error Workflow cannot reference this same workflow. Select a separate workflow with an Error Trigger.', proposalId, issue.id);
      }
      const before = (workflow.settings || {}).errorWorkflow;
      workflow.settings = { ...(workflow.settings || {}), errorWorkflow: id };
      return materialized(proposalId, issue, workflow, [{
        path: 'settings.errorWorkflow', before: stringifyValue(before ?? '(not set)'), after: id,
        description: `Reference Error Workflow ${id} from this workflow.`,
      }]);
    },
  },
  WEBHOOK_NO_AUTH_HINT: {
    title: 'Attach existing n8n authentication to the Webhook',
    description: 'WorkflowProof can configure a Webhook to use an existing Basic, Header or Bearer credential. It never creates or stores the secret itself.',
    inputs: () => [
      {
        key: 'authMode', label: 'Authentication mode', type: 'select', defaultValue: 'headerAuth', required: true,
        options: [
          { label: 'Header Auth', value: 'headerAuth' },
          { label: 'Bearer Auth', value: 'bearerAuth' },
          { label: 'Basic Auth', value: 'basicAuth' },
        ],
        help: 'Create the credential in n8n first. Choose the same credential type here.',
      },
      { key: 'credentialId', label: 'Existing credential ID', required: true, placeholder: 'Example: aBc123...', help: 'Use the ID of an existing n8n credential; WorkflowProof never asks for the secret value.' },
      { key: 'credentialName', label: 'Credential display name', required: true, placeholder: 'Webhook Header Auth', help: 'The visible name of the same credential in n8n.' },
    ],
    safetyChecks: [
      'Never writes a secret value into workflow JSON.',
      'Only changes the target Webhook authentication setting and credential reference.',
      'Requires an existing n8n credential ID and display name.',
      'Preview shows the exact credential reference before approval.',
    ],
    materialize: (issue, original, values) => {
      const proposalId = `${issue.ruleId}:${issue.nodeName || 'workflow'}`;
      const mode = required(values, 'authMode');
      const credentialId = required(values, 'credentialId');
      const credentialName = required(values, 'credentialName');
      const allowed = ['headerAuth', 'bearerAuth', 'basicAuth'];
      if (!allowed.includes(mode)) return error('Choose a supported authentication mode.', proposalId, issue.id);
      if (!credentialId || !credentialName) return error('Enter the existing credential ID and display name before approval.', proposalId, issue.id);
      const workflow = clone(original);
      const node = nodeByName(workflow, issue.nodeName);
      if (!node) return error('The target Webhook node could not be found in the current workflow.', proposalId, issue.id);
      const credentialKey = mode === 'headerAuth' ? 'httpHeaderAuth' : mode === 'bearerAuth' ? 'httpBearerAuth' : 'httpBasicAuth';
      const beforeAuth = stringifyValue((node.parameters || {}).authentication ?? 'none');
      const beforeCredential = stringifyValue((node.credentials || {})[credentialKey] ?? '(not set)');
      node.parameters = { ...(node.parameters || {}), authentication: mode };
      node.credentials = { ...(node.credentials || {}), [credentialKey]: { id: credentialId, name: credentialName } };
      return materialized(proposalId, issue, workflow, [
        {
          path: `nodes[${node.name}].parameters.authentication`, before: beforeAuth, after: mode,
          description: `Require ${mode} authentication on the Webhook.`,
        },
        {
          path: `nodes[${node.name}].credentials.${credentialKey}`, before: beforeCredential,
          after: JSON.stringify({ id: credentialId, name: credentialName }),
          description: `Reference the existing n8n credential “${credentialName}”.`,
        },
      ], ['Confirm the caller is updated to send the required authentication before activating the patched workflow.']);
    },
  },
  HARDCODED_ENV_URL: {
    title: 'Move the HTTP base URL to an environment variable',
    description: 'WorkflowProof preserves the request path and replaces only the environment-specific origin with an n8n $env expression.',
    inputs: (issue) => [{
      key: 'envVarName', label: 'Environment variable name',
      defaultValue: safeEnvName(`${issue.nodeName || 'API'}_BASE_URL`), required: true,
      placeholder: 'OLLAMA_BASE_URL', help: 'Define this variable in the n8n runtime before importing the patched workflow.',
    }],
    safetyChecks: [
      'Preserves the original URL path/query when the URL can be parsed.',
      'Does not create or store the environment variable value.',
      'Preview shows the exact before/after expression.',
    ],
    materialize: (issue, original, values) => {
      const proposalId = `${issue.ruleId}:${issue.nodeName || 'workflow'}`;
      const envName = safeEnvName(required(values, 'envVarName'));
      if (!required(values, 'envVarName')) return error('Enter an environment variable name before approval.', proposalId, issue.id);
      const workflow = clone(original);
      const node = nodeByName(workflow, issue.nodeName);
      if (!node) return error('The target HTTP node could not be found in the current workflow.', proposalId, issue.id);
      const params = (node.parameters || {}) as Record<string, unknown>;
      const before = typeof params.url === 'string' ? params.url : '';
      if (!before) return error('No string URL was found on the target HTTP node.', proposalId, issue.id);
      let after = `={{ $env.${envName} }}`;
      try {
        const parsed = new URL(before);
        const suffix = `${parsed.pathname === '/' ? '' : parsed.pathname}${parsed.search}${parsed.hash}`;
        if (suffix) after = `={{ $env.${envName} + ${JSON.stringify(suffix)} }}`;
      } catch {
        // Non-standard URL: replace the whole value with the environment variable.
      }
      node.parameters = { ...params, url: after };
      return materialized(proposalId, issue, workflow, [{
        path: `nodes[${node.name}].parameters.url`, before, after,
        description: `Replace the environment-specific URL with $env.${envName}.`,
      }], [`Define ${envName} in the target n8n environment before activation.`]);
    },
  },
  FIXED_EMAIL_RECIPIENT: {
    title: 'Move the notification recipient to configuration',
    description: 'WorkflowProof finds the literal email recipient in this node and replaces it with a named n8n environment variable.',
    inputs: (issue) => [{
      key: 'envVarName', label: 'Environment variable name',
      defaultValue: safeEnvName(`${issue.nodeName || 'NOTIFICATION'}_EMAIL`), required: true,
      placeholder: 'SUPPORT_REPORT_EMAIL', help: 'Set this variable in the n8n runtime to the intended production recipient.',
    }],
    safetyChecks: [
      'Only the first literal email address found in the affected node is replaced.',
      'Credentials and message content are not changed.',
      'The exact parameter path appears in the preview.',
    ],
    materialize: (issue, original, values) => {
      const proposalId = `${issue.ruleId}:${issue.nodeName || 'workflow'}`;
      const rawName = required(values, 'envVarName');
      if (!rawName) return error('Enter an environment variable name before approval.', proposalId, issue.id);
      const envName = safeEnvName(rawName);
      const workflow = clone(original);
      const node = nodeByName(workflow, issue.nodeName);
      if (!node) return error('The target email node could not be found in the current workflow.', proposalId, issue.id);
      const path = findFirstEmailPath(node.parameters || {});
      if (!path) return error('No literal email address could be located in this node.', proposalId, issue.id);
      const before = getAtPath(node.parameters || {}, path);
      const after = `={{ $env.${envName} }}`;
      setAtMixedPath(node.parameters || {}, path, after);
      return materialized(proposalId, issue, workflow, [{
        path: `nodes[${node.name}].parameters.${path.join('.')}`,
        before: stringifyValue(before), after,
        description: `Replace the fixed recipient with $env.${envName}.`,
      }], [`Define ${envName} in the target n8n environment before activation.`]);
    },
  },
};

export function canGenerateGuidedProposal(issue: RuleIssue) {
  return Boolean(templates[issue.ruleId]) && issue.repair?.mode === 'guided';
}

export function createGuidedProposal(issue: RuleIssue, workflow: N8nWorkflow): GuidedFixProposal | null {
  const template = templates[issue.ruleId];
  if (!template || issue.repair?.mode !== 'guided') return null;
  const inputs = template.inputs(issue, workflow);
  return {
    id: `${issue.ruleId}:${issue.nodeName || 'workflow'}`,
    issueId: issue.id,
    ruleId: issue.ruleId,
    nodeName: issue.nodeName,
    title: template.title,
    description: template.description,
    inputs,
    safetyChecks: template.safetyChecks,
    companionArtifact: issue.ruleId === 'NO_ERROR_WORKFLOW' ? {
      label: 'Download companion Error Workflow',
      fileName: 'workflowproof-error-handler.json',
      description: 'Import this minimal Error Trigger workflow into n8n, save it, then paste its generated workflow ID into this proposal.',
    } : undefined,
  };
}

export function defaultProposalValues(proposal: GuidedFixProposal) {
  return Object.fromEntries(proposal.inputs.map((input) => [input.key, input.defaultValue || '']));
}

export function materializeGuidedProposal(
  proposal: GuidedFixProposal,
  issue: RuleIssue,
  workflow: N8nWorkflow,
  values: Record<string, string>,
): MaterializedProposal {
  const template = templates[proposal.ruleId];
  if (!template) return error('This proposal type is no longer available.', proposal.id, proposal.issueId);
  return template.materialize(issue, workflow, values);
}

export function proposalReadyCount(issues: RuleIssue[]) {
  return issues.filter(canGenerateGuidedProposal).length;
}


export function buildCompanionArtifact(ruleId: string, sourceWorkflow?: N8nWorkflow): N8nWorkflow | null {
  if (ruleId !== 'NO_ERROR_WORKFLOW') return null;
  return {
    name: `WorkflowProof Error Handler${sourceWorkflow?.name ? ` - ${sourceWorkflow.name}` : ''}`,
    active: false,
    nodes: [
      {
        id: 'workflowproof-error-trigger',
        name: 'Error Trigger',
        type: 'n8n-nodes-base.errorTrigger',
        typeVersion: 1,
        position: [0, 0],
        parameters: {},
      },
      {
        id: 'workflowproof-error-context',
        name: 'Prepare Error Context',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [280, 0],
        parameters: {
          jsCode: `const source = $json || {};\nconst execution = source.execution || {};\nconst workflow = source.workflow || {};\nreturn [{ json: {\n  workflowName: workflow.name || source.workflowName || 'unknown',\n  workflowId: workflow.id || source.workflowId || null,\n  executionId: execution.id || source.executionId || null,\n  lastNodeExecuted: execution.lastNodeExecuted || source.lastNodeExecuted || null,\n  errorMessage: execution.error?.message || source.error?.message || source.message || 'Unknown error',\n  errorStack: execution.error?.stack || source.error?.stack || null,\n  capturedAt: new Date().toISOString(),\n  workflowProof: { replayRequired: true, redactBeforeAlerting: true }\n} }];`,
        },
      },
    ],
    connections: {
      'Error Trigger': { main: [[{ node: 'Prepare Error Context', type: 'main', index: 0 }]] },
    },
    settings: { executionOrder: 'v1' },
  };
}
