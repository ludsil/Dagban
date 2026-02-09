// Dagban core types

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
  assignee?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Edge {
  id: string;
  source: string; // card id
  target: string; // card id (unlocked by source)
  progress: number; // 0-100, the "fuse" progress
}

export type CardStatus = 'blocked' | 'active' | 'done';

export interface DagbanGraph {
  cards: Card[];
  edges: Edge[];
  categories: Category[];
}

// Computed state for a card based on graph
export function getCardStatus(card: Card, edges: Edge[], _cards: Card[]): CardStatus {
  // Find all edges where this card is the target (dependencies)
  const incomingEdges = edges.filter(e => e.target === card.id);

  // If any incoming edge is not complete (progress < 100), card is blocked
  const hasIncompleteIncoming = incomingEdges.some(e => e.progress < 100);
  if (hasIncompleteIncoming) {
    return 'blocked';
  }

  // Find all edges where this card is the source (what it unlocks)
  const outgoingEdges = edges.filter(e => e.source === card.id);

  // If all outgoing edges are complete (progress = 100), card is done
  const allOutgoingComplete = outgoingEdges.length > 0 &&
    outgoingEdges.every(e => e.progress >= 100);
  if (allOutgoingComplete) {
    return 'done';
  }

  // Otherwise active
  return 'active';
}

// Get color for a card based on its status and category
export function getCardColor(
  card: Card,
  status: CardStatus,
  categories: Category[]
): string {
  const category = categories.find(c => c.id === card.categoryId);
  const baseColor = category?.color || '#6b7280'; // gray fallback

  switch (status) {
    case 'done':
      return '#9ca3af'; // gray-400
    case 'blocked':
      return fadeColor(baseColor, 0.4); // 40% opacity effect
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
