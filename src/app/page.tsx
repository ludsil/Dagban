'use client';

import { useCallback, useMemo, useState } from 'react';
import DagbanGraph from '@/components/DagbanGraph';
import { sampleGraph } from '@/lib/sample-data';
import { convertMiserablesToDagban } from '@/lib/miserables-converter';
import miserablesData from '@/lib/miserables.json';
import { usePersistedGraph } from '@/lib/storage';
import type { DagbanGraph as GraphData, Card, Traverser, User } from '@/lib/types';
import { createUserId } from '@/lib/users';

type DatasetMode = 'sample' | 'miserables';

function GraphHost({
  datasetMode,
  onDatasetModeChange,
}: {
  datasetMode: DatasetMode;
  onDatasetModeChange: (mode: DatasetMode) => void;
}) {
  const miserablesGraph = useMemo(() => convertMiserablesToDagban(miserablesData), []);
  const initialGraph = datasetMode === 'miserables' ? miserablesGraph : sampleGraph;
  const projectId = datasetMode === 'miserables' ? 'miserables-temp' : 'default';

  const [graph, setGraph] = usePersistedGraph(initialGraph, projectId);

  // Handle card updates
  const handleCardChange = useCallback((cardId: string, updates: Partial<GraphData['cards'][0]>) => {
    setGraph(prev => ({
      ...prev,
      cards: prev.cards.map(card =>
        card.id === cardId ? { ...card, ...updates, updatedAt: new Date().toISOString() } : card
      ),
    }));
  }, [setGraph]);

  // Handle category updates
  const handleCategoryChange = useCallback((categoryId: string, updates: Partial<GraphData['categories'][0]>) => {
    setGraph(prev => ({
      ...prev,
      categories: prev.categories.map(cat =>
        cat.id === categoryId ? { ...cat, ...updates } : cat
      ),
    }));
  }, [setGraph]);

  // Handle card creation (with optional parent for downstream or child for upstream)
  const handleCardCreate = useCallback((card: Card, parentCardId?: string, childCardId?: string) => {
    setGraph(prev => {
      const newEdges = [...prev.edges];

      // Add edge for downstream (new card is target of parent)
      if (parentCardId) {
        newEdges.push({
          id: `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          source: parentCardId,
          target: card.id,
        });
      }

      // Add edge for upstream (new card is source, child is target)
      if (childCardId) {
        newEdges.push({
          id: `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-up`,
          source: card.id,
          target: childCardId,
        });
      }

      return {
        ...prev,
        cards: [...prev.cards, card],
        edges: newEdges,
      };
    });
  }, [setGraph]);

  // Handle card deletion (also removes connected edges)
  const handleCardDelete = useCallback((cardId: string) => {
    setGraph(prev => {
      const remainingEdges = prev.edges.filter(edge => edge.source !== cardId && edge.target !== cardId);
      return {
        ...prev,
        cards: prev.cards.filter(card => card.id !== cardId),
        edges: remainingEdges,
        traversers: prev.traversers.filter(traverser => remainingEdges.some(edge => edge.id === traverser.edgeId)),
      };
    });
  }, [setGraph]);

  // Handle edge creation between existing nodes
  const handleEdgeCreate = useCallback((sourceId: string, targetId: string) => {
    setGraph(prev => ({
      ...prev,
      edges: [
        ...prev.edges,
        {
          id: `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          source: sourceId,
          target: targetId,
        },
      ],
    }));
  }, [setGraph]);

  const handleUserAdd = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setGraph(prev => {
      const existingIds = new Set(prev.users.map(user => user.id));
      const id = createUserId(trimmed, existingIds);
      const newUser: User = {
        id,
        name: trimmed,
      };
      return {
        ...prev,
        users: [...prev.users, newUser],
      };
    });
  }, [setGraph]);

  const handleTraverserCreate = useCallback((traverser: Traverser) => {
    setGraph(prev => {
      if (prev.traversers.some(existing => existing.edgeId === traverser.edgeId)) return prev;
      return {
        ...prev,
        traversers: [...prev.traversers, traverser],
      };
    });
  }, [setGraph]);

  const handleTraverserUpdate = useCallback((traverserId: string, updates: Partial<Traverser>) => {
    setGraph(prev => ({
      ...prev,
      traversers: prev.traversers.map(traverser =>
        traverser.id === traverserId ? { ...traverser, ...updates } : traverser
      ),
    }));
  }, [setGraph]);

  const handleTraverserDelete = useCallback((traverserId: string) => {
    setGraph(prev => ({
      ...prev,
      traversers: prev.traversers.filter(traverser => traverser.id !== traverserId),
    }));
  }, [setGraph]);

  return (
    <DagbanGraph
      data={graph}
      onCardChange={handleCardChange}
      onCategoryChange={handleCategoryChange}
      onCardCreate={handleCardCreate}
      onCardDelete={handleCardDelete}
      onEdgeCreate={handleEdgeCreate}
      onUserAdd={handleUserAdd}
      onTraverserCreate={handleTraverserCreate}
      onTraverserUpdate={handleTraverserUpdate}
      onTraverserDelete={handleTraverserDelete}
      devDatasetMode={datasetMode}
      onDevDatasetModeChange={onDatasetModeChange}
    />
  );
}

export default function Home() {
  const [datasetMode, setDatasetMode] = useState<DatasetMode>('sample');

  return (
    <div className="w-screen h-screen">
      <GraphHost
        key={datasetMode}
        datasetMode={datasetMode}
        onDatasetModeChange={setDatasetMode}
      />
    </div>
  );
}
