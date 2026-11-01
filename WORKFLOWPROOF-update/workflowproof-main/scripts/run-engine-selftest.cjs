/* Runs the deterministic engine suite without adding a test-framework dependency.
   TypeScript is already a pinned project dependency; this hook compiles only the
   imported engine modules in memory and never writes generated files. */
const fs = require('fs');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      strict: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const { runSelfTest } = require('../src/engine/selftest.ts');
const result = runSelfTest();
for (const test of result.cases) console.log(`${test.passed ? 'PASS' : 'FAIL'}  ${test.name} — ${test.details}`);
console.log(`\nWorkflowProof engine self-test: ${result.cases.filter((test) => test.passed).length}/${result.cases.length} passed`);
process.exitCode = result.passed ? 0 : 1;
