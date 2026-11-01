import type { GraphNode, N8nWorkflow } from '../types/workflow';

export function buildGraph(workflow: N8nWorkflow): Map<string, GraphNode> {
  const graph = new Map<string, GraphNode>();

  for (const node of workflow.nodes || []) {
    graph.set(node.name, { node, incoming: [], outgoing: [] });
  }

  for (const [sourceName, typedConnections] of Object.entries(workflow.connections || {})) {
    const source = graph.get(sourceName);
    if (!source) continue;

    for (const outputGroups of Object.values(typedConnections || {})) {
      for (const group of outputGroups || []) {
        for (const target of group || []) {
          if (!target?.node) continue;
          if (!source.outgoing.includes(target.node)) source.outgoing.push(target.node);
          const targetNode = graph.get(target.node);
          if (targetNode && !targetNode.incoming.includes(sourceName)) {
            targetNode.incoming.push(sourceName);
          }
        }
      }
    }
  }

  return graph;
}

export function countConnections(workflow: N8nWorkflow): number {
  let count = 0;
  for (const typedConnections of Object.values(workflow.connections || {})) {
    for (const outputGroups of Object.values(typedConnections || {})) {
      for (const group of outputGroups || []) count += group?.length || 0;
    }
  }
  return count;
}

export function reachableFrom(graph: Map<string, GraphNode>, start: string): Set<string> {
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of graph.get(current)?.outgoing || []) {
      if (!seen.has(next)) queue.push(next);
    }
  }
  return seen;
}

export function ancestorsOf(graph: Map<string, GraphNode>, start: string): Set<string> {
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const prev of graph.get(current)?.incoming || []) {
      if (!seen.has(prev)) queue.push(prev);
    }
  }
  return seen;
}
