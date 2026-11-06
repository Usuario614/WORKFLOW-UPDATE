const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflowproof-'));
const nodes = ['Start', 'End'].map(name => ({ name, type: 'n8n-nodes-base.manualTrigger' }));
const edge = { node: 'End', type: 'main', index: 0 };
function run(connections, expected, workflowNodes = nodes) {
  const file = path.join(dir, 'workflow.json');
  fs.writeFileSync(file, JSON.stringify({ nodes: workflowNodes, connections }));
  const result = spawnSync(process.execPath, [path.join(__dirname, 'audit-workflow.cjs'), file], { encoding: 'utf8' });
  assert.equal(result.status, expected, result.stderr || result.stdout);
  if (expected === 2) { assert.equal(result.stdout, ''); return; }
  const report = JSON.parse(result.stdout);
  if (expected === 1) {
    assert.ok(report.score <= 69);
    assert.ok(report.issues.some(issue => issue.ruleId === 'GRAPH_INTEGRITY'));
  }
}
try {
  run({ Start: { main: [null, [edge]] } }, 0);
  run({ Start: { main: [[{ ...edge, node: 'Missing' }]] } }, 1);
  run({ Missing: { main: [[edge]] } }, 1);
  run({}, 1, [nodes[0], nodes[0]]);
  run({ Start: { ai_tool: [[{ ...edge, type: 'ai_tool' }]] } }, 0);
  run({ Start: { main: [[{ ...edge, index: -1 }]] } }, 2);
  run({ Start: { main: {} } }, 2);
  console.log('PASS 7 CLI and graph regression cases');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
