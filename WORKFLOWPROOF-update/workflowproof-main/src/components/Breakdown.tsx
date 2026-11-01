import type { ScoreBreakdown } from '../types/workflow';

const labels: Record<keyof ScoreBreakdown, string> = {
  reliability: 'Reliability', recovery: 'Recovery', dataSafety: 'Data safety', security: 'Security', maintainability: 'Maintainability', aiSafety: 'AI safety'
};

export function Breakdown({ data }: { data: ScoreBreakdown }) {
  return (
    <section className="panel">
      <div className="section-head"><div><div className="eyebrow">SYSTEM VIEW</div><h3>Risk dimensions</h3></div></div>
      <div className="bars">
        {(Object.keys(data) as Array<keyof ScoreBreakdown>).map((key) => (
          <div className="bar-row" key={key}>
            <div className="bar-label"><span>{labels[key]}</span><b>{data[key]}</b></div>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${data[key]}%` }} /></div>
          </div>
        ))}
      </div>
    </section>
  );
}
