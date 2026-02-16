// Dagban core types

// User type for team members
export interface User {
  id: string;
  name: string;
  avatar?: string; // URL to avatar image (optional)
  color?: string;
}

// Placeholder users for development
export const placeholderUsers: User[] = [
  { id: 'alice', name: 'Alice Chen' },
  { id: 'bob', name: 'Bob Smith' },
  { id: 'charlie', name: 'Charlie Davis' },
  { id: 'diana', name: 'Diana Evans' },
  { id: 'ethan', name: 'Ethan Foster' },
];

// D3 schemePaired colors - matches react-force-graph nodeAutoColorBy
// These are the exact colors used by the react-force-graph examples
export const schemePaired = [
  '#a6cee3', // light blue
  '#1f78b4', // blue
  '#b2df8a', // light green
  '#33a02c', // green
  '#fb9a99', // light red/pink
  '#e31a1c', // red
  '#fdbf6f', // light orange
  '#ff7f00', // orange
  '#cab2d6', // light purple
  '#6a3d9a', // purple
  '#ffff99', // light yellow
  '#b15928', // brown
];

export interface Category {
  id: string;
  name: string;
  color: string; // hex color
}

export interface Card {
  id: string;
  title: string;
  description?: string;
  categoryId: string;
  assignee?: string; // user id
  createdAt: string;
  updatedAt: string;
  burntAt?: string;
}

export interface Edge {
  id: string;
  source: string; // card id
  target: string; // card id (unlocked by source)
}

export interface Traverser {
  id: string;
  edgeId: string;
  userId: string;
  position: number; // 0..1 along the edge
  createdAt: string;
  updatedAt: string;
}

export type CardStatus = 'blocked' | 'active' | 'done';

export interface DagbanGraph {
  cards: Card[];
  edges: Edge[];
  categories: Category[];
  users: User[];
  traversers: Traverser[];
}

// Computed state for a card based on graph
export function getCardStatus(card: Card, edges: Edge[], _cards: Card[]): CardStatus {
  if (card.burntAt) {
    return 'done';
  }

  const cardById = new Map(_cards.map(c => [c.id, c]));
  const incomingEdges = edges.filter(e => e.target === card.id);
  const hasBlockingIncoming = incomingEdges.some(edge => {
    const source = cardById.get(edge.source);
    return !source?.burntAt;
  });

  if (hasBlockingIncoming) {
    return 'blocked';
  }

  return 'active';
}

// Get color for a card based on its status and category
// Uses the category's own color field
export function getCardColor(
  card: Card,
  status: CardStatus,
  categories: Category[]
): string {
  const category = categories.find(c => c.id === card.categoryId);
  const baseColor = category?.color || '#6b7280'; // gray fallback

  switch (status) {
    case 'done':
      return '#111827'; // gray-900 (burnt)
    case 'blocked':
    case 'active':
      return baseColor;
  }
}

// Utility to create a faded version of a hex color
function fadeColor(hex: string, factor: number): string {
  // Convert to RGB, blend toward white, convert back
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  const fadedR = Math.round(r + (255 - r) * (1 - factor));
  const fadedG = Math.round(g + (255 - g) * (1 - factor));
  const fadedB = Math.round(b + (255 - b) * (1 - factor));

  return `#${fadedR.toString(16).padStart(2, '0')}${fadedG.toString(16).padStart(2, '0')}${fadedB.toString(16).padStart(2, '0')}`;
}
