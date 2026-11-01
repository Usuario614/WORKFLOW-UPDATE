import type { AdversarialTest } from '../engine/tests';

export function TestPlan({ tests }: { tests: AdversarialTest[] }) {
  return (
    <section className="panel">
      <div className="section-head"><div><div className="eyebrow">BREAK IT</div><h3>{tests.length} adversarial scenarios</h3></div></div>
      <p className="muted">Generated from the workflow structure. These are test cases only; WorkflowProof never executes them against your live services.</p>
      <div className="test-table-wrap">
        <table className="test-table">
          <thead><tr><th>ID</th><th>Priority</th><th>Target</th><th>Scenario</th><th>Expected behavior</th></tr></thead>
          <tbody>{tests.slice(0, 20).map((t) => <tr key={t.id}><td>{t.id}</td><td><span className={`severity severity-${t.priority}`}>{t.priority}</span></td><td>{t.target}</td><td>{t.title}<small>{t.input}</small></td><td>{t.expected}</td></tr>)}</tbody>
        </table>
      </div>
      {tests.length > 20 && <p className="muted">Showing 20 of {tests.length}. Export the full plan from the actions above.</p>}
    </section>
  );
}
