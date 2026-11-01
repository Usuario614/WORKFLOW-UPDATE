import type { N8nWorkflow } from '../types/workflow';

export interface SanitizationResult<T> {
  value: T;
  redactions: number;
}

const exactOperationalKey = /^(id|webhookId|credentials?|credential|staticData|pinData|meta|tags|versionId|instance(?:Id|Url)?|host(?:name)?|url|baseUrl|callbackUrl|path)$/i;
const identityKey = /^(workflowName|sourceFile|nodeName|executionId)$/i;
const secretKey = /(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|passphrase|cookie|set-cookie|private[_-]?key|client[_-]?secret)/i;
const sensitiveHeaderName = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api[_-]?key|token|secret|password)$/i;
const replacement = '[REDACTED]';

function redactString(value: string): { value: string; changed: boolean } {
  let result = value;
  result = result.replace(/(?:https?|wss?):\/\/[^\s"'<>]+/gi, '[REDACTED-URL]');
  result = result.replace(/\bBearer\s+[A-Za-z0-9._~+\/-]{8,}\b/gi, 'Bearer [REDACTED]');
  result = result.replace(/\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|secret)\s*[:=]\s*["']?[^\s,"'}\]]{6,}/gi, (match) => `${match.slice(0, Math.max(match.indexOf(':'), match.indexOf('=')) + 1)} [REDACTED]`);
  result = result.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED-JWT]');
  result = result.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED-EMAIL]');
  return { value: result, changed: result !== value };
}

function isSensitiveField(key: string | undefined, parent: Record<string, unknown> | undefined) {
  if (key && (exactOperationalKey.test(key) || identityKey.test(key) || secretKey.test(key))) return true;
  if (!key || !parent || !/^(value|values?|data)$/i.test(key)) return false;
  const declaredName = parent.name ?? parent.key ?? parent.parameterName ?? parent.header;
  return typeof declaredName === 'string' && sensitiveHeaderName.test(declaredName);
}

function redact(value: unknown, key?: string, parent?: Record<string, unknown>): SanitizationResult<unknown> {
  if (isSensitiveField(key, parent)) return { value: replacement, redactions: 1 };
  if (typeof value === 'string') {
    const sanitized = redactString(value);
    return { value: sanitized.value, redactions: sanitized.changed ? 1 : 0 };
  }
  if (Array.isArray(value)) {
    return value.reduce<SanitizationResult<unknown[]>>((result, item) => {
      const child = redact(item);
      result.value.push(child.value);
      result.redactions += child.redactions;
      return result;
    }, { value: [], redactions: 0 });
  }
  if (value && typeof value === 'object') {
    const input = value as Record<string, unknown>;
    return Object.entries(input).reduce<SanitizationResult<Record<string, unknown>>>((result, [childKey, childValue]) => {
      const child = redact(childValue, childKey, input);
      result.value[childKey] = child.value;
      result.redactions += child.redactions;
      return result;
    }, { value: {}, redactions: 0 });
  }
  return { value, redactions: 0 };
}

/** Produces an aggressively redacted copy. It never mutates the source object. */
export function sanitizeForSharingWithSummary<T>(value: T): SanitizationResult<T> {
  const result = redact(structuredClone(value));
  return { value: result.value as T, redactions: result.redactions };
}

export function sanitizeForSharing<T>(value: T): T {
  return sanitizeForSharingWithSummary(value).value;
}

export function sanitizeWorkflowForSharing(workflow: N8nWorkflow): N8nWorkflow {
  return sanitizeForSharing(workflow);
}
