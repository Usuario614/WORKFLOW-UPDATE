import type { N8nWorkflow } from '../types/workflow';

// Deliberately synthetic. It is safe to load, contains no credentials or live endpoints,
// and is designed to show that findings need review rather than automatic business changes.
export const DEMO_WORKFLOW: N8nWorkflow = {
  name: 'WorkflowProof safe demo',
  active: false,
  nodes: [
    { id: 'demo-manual-trigger', name: 'Manual trigger', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0], parameters: {} },
    {
      id: 'demo-http-request', name: 'Example read request', type: 'n8n-nodes-base.httpRequest', typeVersion: 4,
      position: [280, 0], parameters: { method: 'GET', url: 'https://example.invalid/catalog' },
    },
  ],
  connections: { 'Manual trigger': { main: [[{ node: 'Example read request', type: 'main', index: 0 }]] } },
  settings: { executionOrder: 'v1' },
};
