import type { SelfTestResult } from '../types/workflow';

export function SelfTestPanel({ result, onClose }: { result: SelfTestResult; onClose: () => void }) {
  return (
    <section className="selftest-panel">
      <div className="selftest-head"><div><b>{result.passed ? '✓ Engine self-test passed' : '✕ Engine self-test failed'}</b><span>{result.cases.filter((x) => x.passed).length}/{result.cases.length} checks passed</span></div><button onClick={onClose}>Close</button></div>
      {result.cases.map((item) => <div className={item.passed ? 'selftest-case passed' : 'selftest-case failed'} key={item.name}><b>{item.passed ? '✓' : '✕'} {item.name}</b><span>{item.details}</span></div>)}
    </section>
  );
}
