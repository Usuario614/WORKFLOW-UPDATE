require('./register-engine.cjs');
const { readFileSync } = require('node:fs');
const { auditWorkflow } = require('../src/engine/audit.ts');

try {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/audit-workflow.cjs <workflow.json>');
  const workflow = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const report = auditWorkflow(workflow);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.exitCode = report.summary.openCritical || report.summary.openHigh ? 1 : 0;
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
