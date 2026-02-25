'use client';

import { useCallback, useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import DagbanGraph from '@/components/DagbanGraph';
import { getEmptyGraph, getProjects, Project } from '@/lib/projects';
import { saveGraph, usePersistedGraph } from '@/lib/storage';
import { useGraphUndo, type GraphUpdateOptions } from '@/lib/graph-undo';
import type { DagbanGraph as GraphData, Card, Traverser, User } from '@/lib/types';
import { createUserId } from '@/lib/users';

interface ProjectViewProps {
  projectId: string;
}

export default function ProjectView({ projectId }: ProjectViewProps) {
  const router = useRouter();
  const [allProjects] = useState<Project[]>(() => getProjects());

  // Derive current project from allProjects and projectId
  const project = useMemo(() => {
    return allProjects.find(p => p.id === projectId) || null;
  }, [allProjects, projectId]);

  // Redirect if project not found
  useEffect(() => {
    if (!project) {
      router.push('/');
    }
  }, [project, router]);

  const emptyGraph = useMemo(() => getEmptyGraph(), []);
  // Use persisted graph with project-specific storage
  const [graph, setGraph] = usePersistedGraph(emptyGraph, projectId);
  const { applyGraphUpdate, handleUndo } = useGraphUndo(setGraph);

  // Handle card updates
  const handleCardChange = useCallback((cardId: string, updates: Partial<GraphData['cards'][0]>) => {
    applyGraphUpdate(prev => ({
      ...prev,
      cards: prev.cards.map(card =>
        card.id === cardId ? { ...card, ...updates, updatedAt: new Date().toISOString() } : card
      ),
    }));
  }, [applyGraphUpdate]);

  // Handle category updates
  const handleCategoryChange = useCallback((categoryId: string, updates: Partial<GraphData['categories'][0]>) => {
    applyGraphUpdate(prev => ({
      ...prev,
      categories: prev.categories.map(cat =>
        cat.id === categoryId ? { ...cat, ...updates } : cat
      ),
    }));
  }, [applyGraphUpdate]);

  // Handle card creation (with optional parent for downstream or child for upstream)
  const handleCardCreate = useCallback((card: Card, parentCardId?: string, childCardId?: string) => {
    let nextGraphSnapshot: GraphData | null = null;

    applyGraphUpdate(prev => {
      const newEdges = [...prev.edges];

      if (parentCardId) {
        newEdges.push({
          id: `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          source: parentCardId,
          target: card.id,
        });
      }

      if (childCardId) {
        newEdges.push({
          id: `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-up`,
          source: card.id,
          target: childCardId,
        });
      }

      const nextGraph: GraphData = {
        ...prev,
        cards: [...prev.cards, card],
        edges: newEdges,
      };
      nextGraphSnapshot = nextGraph;
      return nextGraph;
    });

    if (nextGraphSnapshot) {
      saveGraph(nextGraphSnapshot, projectId);
    }
  }, [applyGraphUpdate, projectId]);

  // Handle card deletion (also removes connected edges)
  const handleCardDelete = useCallback((cardId: string) => {
    applyGraphUpdate(prev => {
      const remainingEdges = prev.edges.filter(edge => edge.source !== cardId && edge.target !== cardId);
      const remainingEdgeIds = new Set(remainingEdges.map(edge => edge.id));
      const remainingCardIds = new Set(prev.cards.filter(card => card.id !== cardId).map(card => card.id));
      return {
        ...prev,
        cards: prev.cards.filter(card => card.id !== cardId),
        edges: remainingEdges,
        traversers: prev.traversers.filter(traverser => {
          if (remainingEdgeIds.has(traverser.edgeId)) return true;
          if (traverser.edgeId.startsWith('root:')) {
            const nodeId = traverser.edgeId.slice('root:'.length);
            return remainingCardIds.has(nodeId);
          }
          return false;
        }),
      };
    });
  }, [applyGraphUpdate]);

  // Handle edge creation between existing nodes
  const handleEdgeCreate = useCallback((sourceId: string, targetId: string) => {
    applyGraphUpdate(prev => ({
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
  }, [applyGraphUpdate]);

  const handleEdgeDelete = useCallback((edgeId: string) => {
    applyGraphUpdate(prev => {
      const remainingEdges = prev.edges.filter(edge => edge.id !== edgeId);
      return {
        ...prev,
        edges: remainingEdges,
        traversers: prev.traversers.filter(traverser => traverser.edgeId !== edgeId),
      };
    });
  }, [applyGraphUpdate]);

  const handleUserAdd = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    applyGraphUpdate(prev => {
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
  }, [applyGraphUpdate]);

  const handleTraverserCreate = useCallback((traverser: Traverser) => {
    applyGraphUpdate(prev => {
      if (prev.traversers.some(existing => existing.edgeId === traverser.edgeId)) return prev;
      return {
        ...prev,
        traversers: [...prev.traversers, traverser],
      };
    });
  }, [applyGraphUpdate]);

  const handleTraverserUpdate = useCallback((
    traverserId: string,
    updates: Partial<Traverser>,
    options?: GraphUpdateOptions
  ) => {
    applyGraphUpdate(prev => ({
      ...prev,
      traversers: prev.traversers.map(traverser =>
        traverser.id === traverserId ? { ...traverser, ...updates } : traverser
      ),
    }), { transient: options?.transient, recordUndo: options?.recordUndo });
  }, [applyGraphUpdate]);

  const handleTraverserDelete = useCallback((traverserId: string) => {
    applyGraphUpdate(prev => ({
      ...prev,
      traversers: prev.traversers.filter(traverser => traverser.id !== traverserId),
    }));
  }, [applyGraphUpdate]);

  // Handle assigning an agent to a card
  const handleAssignAgent = useCallback((cardId: string, agentConfig: NonNullable<Card['agentConfig']>) => {
    applyGraphUpdate(prev => ({
      ...prev,
      cards: prev.cards.map(card =>
        card.id === cardId
          ? { ...card, workerType: 'agent' as const, agentConfig, agentStatus: 'idle' as const, updatedAt: new Date().toISOString() }
          : card
      ),
    }));
  }, [applyGraphUpdate]);

  // Handle updating agent status on a card
  const handleUpdateAgentStatus = useCallback((
    cardId: string,
    agentStatus: NonNullable<Card['agentStatus']>,
    extras?: { agentBranch?: string; agentSessionId?: string },
    options?: GraphUpdateOptions
  ) => {
    applyGraphUpdate(prev => ({
      ...prev,
      cards: prev.cards.map(card =>
        card.id === cardId
          ? { ...card, agentStatus, ...extras, updatedAt: new Date().toISOString() }
          : card
      ),
    }), { recordUndo: options?.recordUndo });
  }, [applyGraphUpdate]);

  // Handle clearing agent assignment from a card
  const handleClearAgent = useCallback((cardId: string) => {
    applyGraphUpdate(prev => ({
      ...prev,
      cards: prev.cards.map(card =>
        card.id === cardId
          ? {
              ...card,
              workerType: undefined,
              agentConfig: undefined,
              agentStatus: undefined,
              agentBranch: undefined,
              agentSessionId: undefined,
              updatedAt: new Date().toISOString(),
            }
          : card
      ),
    }));
  }, [applyGraphUpdate]);

  const handleGraphImport = useCallback((nextGraph: GraphData) => {
    applyGraphUpdate(() => nextGraph);
  }, [applyGraphUpdate]);

  const handleProjectSelect = useCallback((newProjectId: string) => {
    router.push(`/project/${newProjectId}`);
  }, [router]);

  const handleBackToProjects = useCallback(() => {
    router.push('/');
  }, [router]);

  if (!project) {
    return (
      <div className="w-screen h-screen bg-black flex items-center justify-center">
        <div className="text-gray-500">Loading project...</div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen">
      <DagbanGraph
        data={graph}
        onCardChange={handleCardChange}
        onCategoryChange={handleCategoryChange}
        onCardCreate={handleCardCreate}
        onCardDelete={handleCardDelete}
        onEdgeCreate={handleEdgeCreate}
        onEdgeDelete={handleEdgeDelete}
        onUserAdd={handleUserAdd}
        onTraverserCreate={handleTraverserCreate}
        onTraverserUpdate={handleTraverserUpdate}
        onTraverserDelete={handleTraverserDelete}
        onUndo={handleUndo}
        projectId={project.id}
        projectName={project.name}
        projects={allProjects}
        onProjectSwitch={handleProjectSelect}
        onBackToProjects={handleBackToProjects}
        onGraphImport={handleGraphImport}
        onAssignAgent={handleAssignAgent}
        onUpdateAgentStatus={handleUpdateAgentStatus}
        onClearAgent={handleClearAgent}
      />
    </div>
  );
}
