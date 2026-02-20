import { renderMermaidAscii } from 'beautiful-mermaid';
import type { Edge, Traverser, User } from '@/lib/types';
import { ROOT_TRAVERSER_PREFIX } from '../traverserConstants';
import type { GraphNodeData } from '../types';

// --- Types ---

export type AsciiFormatId = 'indented-tree' | 'topological-list' | 'mermaid' | 'ascii-box-art';

export interface NodeAnnotation {
  burned: boolean;
  traverserUserName: string | null;
}

export interface AnnotatedNode {
  id: string;
  title: string;
  annotation: NodeAnnotation;
}

// --- Annotation builder ---

export function buildAnnotatedNodes(
  visibleNodes: GraphNodeData[],
  edges: Edge[],
  traversers: Traverser[],
  users: User[],
): AnnotatedNode[] {
  const userById = new Map(users.map(u => [u.id, u]));
  const edgeById = new Map(edges.map(e => [e.id, e]));

  // Map traverser → target node id → user name
  const nodeTraverserUser = new Map<string, string>();
  for (const t of traversers) {
    let targetNodeId: string | null = null;
    if (t.edgeId.startsWith(ROOT_TRAVERSER_PREFIX)) {
      targetNodeId = t.edgeId.slice(ROOT_TRAVERSER_PREFIX.length);
    } else {
      const edge = edgeById.get(t.edgeId);
      if (edge) targetNodeId = edge.target;
    }
    if (targetNodeId) {
      const user = userById.get(t.userId);
      if (user) nodeTraverserUser.set(targetNodeId, user.name);
    }
  }

  return visibleNodes.map(node => {
    const burned = node.status === 'done';
    const traverserUserName = burned ? null : (nodeTraverserUser.get(node.id) ?? null);
    return {
      id: node.id,
      title: node.title || '(untitled)',
      annotation: { burned, traverserUserName },
    };
  });
}

export function formatAnnotation(a: NodeAnnotation): string {
  if (a.burned) return ' [burned]';
  if (a.traverserUserName) return ` [${a.traverserUserName}]`;
  return '';
}

// --- Format 1: Indented Tree ---

export function generateIndentedTree(nodes: AnnotatedNode[], edges: Edge[]): string {
  if (nodes.length === 0) return '(empty graph)';

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();

  for (const edge of edges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) continue;
    const list = children.get(edge.source) ?? [];
    list.push(edge.target);
    children.set(edge.source, list);
    hasParent.add(edge.target);
  }

  const roots = nodes.filter(n => !hasParent.has(n.id));
  const visited = new Set<string>();
  const lines: string[] = [];

  function walk(nodeId: string, prefix: string, isLast: boolean, isRoot: boolean) {
    const node = nodeMap.get(nodeId);
    if (!node) return;

    const connector = isRoot ? '' : (isLast ? '└── ' : '├── ');
    const ann = formatAnnotation(node.annotation);

    if (visited.has(nodeId)) {
      lines.push(`${prefix}${connector}${node.title}${ann} (see above)`);
      return;
    }

    visited.add(nodeId);
    lines.push(`${prefix}${connector}${node.title}${ann}`);

    const childIds = (children.get(nodeId) ?? []).filter(id => nodeMap.has(id));
    const childPrefix = isRoot ? '' : (prefix + (isLast ? '    ' : '│   '));
    childIds.forEach((childId, i) => {
      walk(childId, childPrefix, i === childIds.length - 1, false);
    });
  }

  roots.forEach((root, i) => {
    if (i > 0) lines.push('');
    walk(root.id, '', true, true);
  });

  return lines.join('\n');
}

// --- Format 2: Topological List ---

export function generateTopologicalList(nodes: AnnotatedNode[], edges: Edge[]): string {
  if (nodes.length === 0) return '(empty graph)';

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  for (const node of nodes) {
    outgoing.set(node.id, []);
    indegree.set(node.id, 0);
  }

  for (const edge of edges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) continue;
    outgoing.get(edge.source)!.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  // Kahn's algorithm
  const queue = nodes.filter(n => (indegree.get(n.id) ?? 0) === 0).map(n => n.id);
  const sorted: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(id);
    for (const childId of outgoing.get(id) ?? []) {
      const newDeg = (indegree.get(childId) ?? 1) - 1;
      indegree.set(childId, newDeg);
      if (newDeg === 0) queue.push(childId);
    }
  }

  // Append any remaining (cycles)
  const sortedSet = new Set(sorted);
  for (const node of nodes) {
    if (!sortedSet.has(node.id)) sorted.push(node.id);
  }

  const lines: string[] = [];
  for (const id of sorted) {
    const node = nodeMap.get(id);
    if (!node) continue;
    const ann = formatAnnotation(node.annotation);
    const targets = (outgoing.get(id) ?? [])
      .map(tid => nodeMap.get(tid)?.title ?? tid)
      .join(', ');
    lines.push(targets ? `${node.title}${ann} → ${targets}` : `${node.title}${ann}`);
  }

  return lines.join('\n');
}

// --- Format 3: Mermaid ---

export function generateMermaid(nodes: AnnotatedNode[], edges: Edge[]): string {
  if (nodes.length === 0) return 'graph TD\n    empty["(empty graph)"]';

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const sanitize = (id: string) => id.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = ['graph TD'];

  for (const node of nodes) {
    const ann = formatAnnotation(node.annotation);
    const label = `${node.title}${ann}`.replace(/"/g, "'");
    lines.push(`    ${sanitize(node.id)}["${label}"]`);
  }

  for (const edge of edges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) continue;
    lines.push(`    ${sanitize(edge.source)} --> ${sanitize(edge.target)}`);
  }

  return lines.join('\n');
}

// --- Format 4: ASCII Box Art (via beautiful-mermaid) ---

export function generateAsciiBoxArt(nodes: AnnotatedNode[], edges: Edge[]): string {
  if (nodes.length === 0) return '(empty graph)';

  // Build Mermaid input specifically for beautiful-mermaid:
  // - Use [label] instead of ["label"] to avoid literal quotes in output
  // - Replace [] in annotations with () to avoid closing the Mermaid bracket
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const sanitize = (id: string) => id.replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = ['graph TD'];

  for (const node of nodes) {
    const ann = formatAnnotation(node.annotation)
      .replace(/\[/g, '(')
      .replace(/\]/g, ')');
    const label = `${node.title}${ann}`;
    lines.push(`    ${sanitize(node.id)}[${label}]`);
  }

  for (const edge of edges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) continue;
    lines.push(`    ${sanitize(edge.source)} --> ${sanitize(edge.target)}`);
  }

  const mermaid = lines.join('\n');
  return renderMermaidAscii(mermaid, { useAscii: true, paddingX: 2, paddingY: 1, boxBorderPadding: 0 });
}
