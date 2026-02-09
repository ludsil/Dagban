'use client';

import { useCallback } from 'react';
import DagbanGraph from '@/components/DagbanGraph';
import { sampleGraph } from '@/lib/sample-data';
import { usePersistedGraph } from '@/lib/storage';
import type { DagbanGraph as GraphData, Card } from '@/lib/types';

export default function Home() {
  const [graph, setGraph] = usePersistedGraph(sampleGraph);

  // Handle edge progress changes
  const handleEdgeProgressChange = useCallback((edgeId: string, progress: number) => {
    setGraph({
      ...graph,
      edges: graph.edges.map(edge =>
        edge.id === edgeId ? { ...edge, progress } : edge
      ),
    });
  }, [graph, setGraph]);

  // Handle card updates
  const handleCardChange = useCallback((cardId: string, updates: Partial<GraphData['cards'][0]>) => {
    setGraph({
      ...graph,
      cards: graph.cards.map(card =>
        card.id === cardId ? { ...card, ...updates, updatedAt: new Date().toISOString() } : card
      ),
    });
  }, [graph, setGraph]);

  // Handle category updates
  const handleCategoryChange = useCallback((categoryId: string, updates: Partial<GraphData['categories'][0]>) => {
    setGraph({
      ...graph,
      categories: graph.categories.map(cat =>
        cat.id === categoryId ? { ...cat, ...updates } : cat
      ),
    });
  }, [graph, setGraph]);

  // Handle card creation
  const handleCardCreate = useCallback((card: Card) => {
    setGraph({
      ...graph,
      cards: [...graph.cards, card],
    });
  }, [graph, setGraph]);

  return (
    <div className="w-screen h-screen">
      <DagbanGraph
        data={graph}
        onEdgeProgressChange={handleEdgeProgressChange}
        onCardChange={handleCardChange}
        onCategoryChange={handleCategoryChange}
        onCardCreate={handleCardCreate}
      />
    </div>
  );
}
