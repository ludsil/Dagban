/**
 * Converter function to transform miserables.json format to DagbanGraph format
 *
 * miserables.json format:
 *   nodes: { id: string, group: number }[]
 *   links: { source: string, target: string, value: number }[]
 *
 * DagbanGraph format:
 *   cards: Card[]
 *   edges: Edge[]
 *   categories: Category[]
 */

import type { DagbanGraph, Card, Edge, Category } from './types';
import { schemePaired } from './types';

interface MiserablesNode {
  id: string;
  group: number;
}

interface MiserablesLink {
  source: string;
  target: string;
  value: number;
}

interface MiserablesData {
  nodes: MiserablesNode[];
  links: MiserablesLink[];
}

/**
 * Generate categories from group numbers (0-10)
 * Uses schemePaired colors for consistency with force-graph defaults
 */
function generateCategories(): Category[] {
  const categories: Category[] = [];
  for (let i = 0; i <= 10; i++) {
    categories.push({
      id: `group-${i}`,
      name: `Group ${i}`,
      color: schemePaired[i % schemePaired.length],
    });
  }
  return categories;
}

/**
 * Convert miserables.json format to DagbanGraph format
 */
export function convertMiserablesToDagban(data: MiserablesData): DagbanGraph {
  const now = new Date().toISOString();
  const categories = generateCategories();

  // Map nodes to cards
  const cards: Card[] = data.nodes.map((node) => ({
    id: node.id,
    title: node.id,
    categoryId: `group-${node.group}`,
    createdAt: now,
    updatedAt: now,
  }));

  // Map links to edges
  const edges: Edge[] = data.links.map((link, index) => ({
    id: `edge-${index}`,
    source: link.source,
    target: link.target,
    progress: 0, // Default progress
  }));

  return {
    cards,
    edges,
    categories,
  };
}
