require('./register-engine.cjs');
const { runSelfTest } = require('../src/engine/selftest.ts');
const result = runSelfTest();
for (const test of result.cases) console.log(`${test.passed ? 'PASS' : 'FAIL'}  ${test.name} — ${test.details}`);
console.log(`\nWorkflowProof engine self-test: ${result.cases.filter((test) => test.passed).length}/${result.cases.length} passed`);
process.exitCode = result.passed ? 0 : 1;
