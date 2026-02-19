import type { Edge } from './types';

/**
 * Find all edge IDs that participate in a cycle using Tarjan's SCC algorithm.
 * Any edge whose source and target are in the same strongly connected component
 * (of size > 1) is part of a cycle.
 */
export function findCycleEdgeIds(edges: Edge[]): Set<string> {
  // Build adjacency list
  const adj = new Map<string, string[]>();
  for (const edge of edges) {
    let list = adj.get(edge.source);
    if (!list) {
      list = [];
      adj.set(edge.source, list);
    }
    list.push(edge.target);
    // Ensure target node exists in map
    if (!adj.has(edge.target)) adj.set(edge.target, []);
  }

  // Tarjan's SCC
  let index = 0;
  const nodeIndex = new Map<string, number>();
  const nodeLowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: Set<string>[] = [];

  function strongConnect(v: string) {
    nodeIndex.set(v, index);
    nodeLowlink.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) || []) {
      if (!nodeIndex.has(w)) {
        strongConnect(w);
        nodeLowlink.set(v, Math.min(nodeLowlink.get(v)!, nodeLowlink.get(w)!));
      } else if (onStack.has(w)) {
        nodeLowlink.set(v, Math.min(nodeLowlink.get(v)!, nodeIndex.get(w)!));
      }
    }

    if (nodeLowlink.get(v) === nodeIndex.get(v)) {
      const scc = new Set<string>();
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.add(w);
      } while (w !== v);

      // Only keep SCCs with more than one node (actual cycles)
      if (scc.size > 1) {
        sccs.push(scc);
      }
    }
  }

  for (const node of adj.keys()) {
    if (!nodeIndex.has(node)) {
      strongConnect(node);
    }
  }

  // Build lookup: node → its SCC (only for cycle SCCs)
  const nodeToScc = new Map<string, Set<string>>();
  for (const scc of sccs) {
    for (const node of scc) {
      nodeToScc.set(node, scc);
    }
  }

  // An edge is in a cycle if both endpoints are in the same SCC
  const cycleEdgeIds = new Set<string>();
  for (const edge of edges) {
    const scc = nodeToScc.get(edge.source);
    if (scc && scc.has(edge.target)) {
      cycleEdgeIds.add(edge.id);
    }
  }

  return cycleEdgeIds;
}
