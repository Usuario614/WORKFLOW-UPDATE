// Synthetic traversal microbenchmark, not an end-to-end audit speed claim.
require('./register-engine.cjs');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { reachableFrom, ancestorsOf } = require('../src/engine/graph.ts');
const graph = new Map();
const width = 15000;
graph.set('root', { node: {name:'root'}, incoming: [], outgoing: Array.from({length:width},(_,i)=>String(i)) });
for(let i=0;i<width;i++) graph.set(String(i), {node:{name:String(i)}, incoming:['root'], outgoing:['sink']});
graph.set('sink', {node:{name:'sink'}, incoming:Array.from({length:width},(_,i)=>String(i)), outgoing:[]});
function legacy(graph, start, field) {
  const seen = new Set(); const queue = [start];
  while(queue.length) {
    const current=queue.shift(); if(seen.has(current)) continue; seen.add(current);
    for(const next of graph.get(current)?.[field] || []) if(!seen.has(next)) queue.push(next);
  }
  return seen;
}
function measure(fn) {
  fn(); const times=[];
  for(let i=0;i<7;i++) { const start=performance.now(); fn(); times.push(performance.now()-start); }
  return times.sort((a,b)=>a-b)[3];
}
const result={fixture:'synthetic fan-out/fan-in', nodes:graph.size, samples:7, metric:'median milliseconds', results:[]};
for(const [field,start,fn] of [['outgoing','root',reachableFrom],['incoming','sink',ancestorsOf]]) {
  assert.deepEqual([...legacy(graph,start,field)],[...fn(graph,start)]);
  const before=measure(()=>legacy(graph,start,field)); const after=measure(()=>fn(graph,start));
  result.results.push({direction:field,beforeMs:+before.toFixed(2),afterMs:+after.toFixed(2),speedup:+(before/after).toFixed(2)});
}
console.log(JSON.stringify(result,null,2));
