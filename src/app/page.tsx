'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import DagbanGraph from '@/components/DagbanGraph';
import { convertMiserablesToDagban } from '@/lib/miserables-converter';
import miserablesData from '@/lib/miserables.json';
import { saveGraph, usePersistedGraph } from '@/lib/storage';
import { useGraphUndo, type GraphUpdateOptions } from '@/lib/graph-undo';
import type { DagbanGraph as GraphData, Card, Category, Traverser, User } from '@/lib/types';
import { createUserId } from '@/lib/users';
import { getProjects, createProject, deleteProject, updateProject, ensureDefaultProject, getEmptyGraph, type Project } from '@/lib/projects';

type DatasetMode = 'sample' | 'miserables';

function GraphHost({
  datasetMode,
  onDatasetModeChange,
  projectId,
  projectName,
  projects,
  onProjectSwitch,
  onProjectCreate,
  onProjectDelete,
  onProjectRename,
}: {
  datasetMode: DatasetMode;
  onDatasetModeChange: (mode: DatasetMode) => void;
  projectId: string;
  projectName: string;
  projects: Project[];
  onProjectSwitch: (projectId: string) => void;
  onProjectCreate: (name: string) => void;
  onProjectDelete: (projectId: string) => void;
  onProjectRename: (projectId: string, name: string) => void;
}) {
  const miserablesGraph = useMemo(() => convertMiserablesToDagban(miserablesData), []);
  const emptyGraph = useMemo(() => getEmptyGraph(), []);
  const initialGraph = datasetMode === 'miserables'
    ? miserablesGraph
    : emptyGraph;
  const effectiveProjectId = datasetMode === 'miserables'
    ? 'miserables-temp'
    : projectId;

  const [graph, setGraph] = usePersistedGraph(initialGraph, effectiveProjectId);
  const { applyGraphUpdate, handleUndo, handleRedo } = useGraphUndo(setGraph);

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

  const handleCategoryAdd = useCallback((category: Category) => {
    applyGraphUpdate(prev => ({
      ...prev,
      categories: [...prev.categories, category],
    }));
  }, [applyGraphUpdate]);

  const handleCategoryDelete = useCallback((categoryId: string) => {
    applyGraphUpdate(prev => ({
      ...prev,
      categories: prev.categories.filter(cat => cat.id !== categoryId),
    }));
  }, [applyGraphUpdate]);

  // Handle card creation (with optional parent for downstream or child for upstream)
  const handleCardCreate = useCallback((card: Card, parentCardId?: string, childCardId?: string) => {
    let nextGraphSnapshot: GraphData | null = null;

    applyGraphUpdate(prev => {
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

      const nextGraph: GraphData = {
        ...prev,
        cards: [...prev.cards, card],
        edges: newEdges,
      };
      nextGraphSnapshot = nextGraph;
      return nextGraph;
    });

    if (nextGraphSnapshot) {
      saveGraph(nextGraphSnapshot, effectiveProjectId);
    }
  }, [applyGraphUpdate, effectiveProjectId]);

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

  const handleUserDelete = useCallback((userId: string) => {
    applyGraphUpdate(prev => ({
      ...prev,
      users: prev.users.filter(u => u.id !== userId),
      // Unassign cards that referenced this user
      cards: prev.cards.map(c => c.assignee === userId ? { ...c, assignee: undefined } : c),
      // Remove traversers owned by this user
      traversers: prev.traversers.filter(t => t.userId !== userId),
    }));
  }, [applyGraphUpdate]);

  const handleUserChange = useCallback((userId: string, updates: Partial<User>) => {
    applyGraphUpdate(prev => ({
      ...prev,
      users: prev.users.map(u => u.id === userId ? { ...u, ...updates } : u),
    }));
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

  const handleGraphImport = useCallback((nextGraph: GraphData) => {
    applyGraphUpdate(() => nextGraph);
  }, [applyGraphUpdate]);

  return (
    <DagbanGraph
      data={graph}
      onCardChange={handleCardChange}
      onCategoryChange={handleCategoryChange}
      onCategoryAdd={handleCategoryAdd}
      onCategoryDelete={handleCategoryDelete}
      onCardCreate={handleCardCreate}
      onCardDelete={handleCardDelete}
      onEdgeCreate={handleEdgeCreate}
      onEdgeDelete={handleEdgeDelete}
      onUserAdd={handleUserAdd}
      onUserDelete={handleUserDelete}
      onUserChange={handleUserChange}
      onTraverserCreate={handleTraverserCreate}
      onTraverserUpdate={handleTraverserUpdate}
      onTraverserDelete={handleTraverserDelete}
      onGraphImport={handleGraphImport}
      onUndo={handleUndo}
      onRedo={handleRedo}
      projectName={projectName}
      projects={projects}
      onProjectSwitch={onProjectSwitch}
      onProjectCreate={onProjectCreate}
      onProjectDelete={onProjectDelete}
      onProjectRename={onProjectRename}
      devDatasetMode={datasetMode}
      onDevDatasetModeChange={onDatasetModeChange}
    />
  );
}

export default function Home() {
  const [datasetMode, setDatasetMode] = useState<DatasetMode>('sample');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);

  // Load projects on mount — must run before GraphHost renders
  useEffect(() => {
    const defaultProject = ensureDefaultProject();
    const allProjects = getProjects();
    setProjects(allProjects);
    setProjectId(defaultProject.id);
  }, []);

  const currentProject = projectId ? projects.find(p => p.id === projectId) : null;
  const projectName = currentProject?.name || 'Default Project';

  const handleProjectSwitch = useCallback((id: string) => {
    setProjectId(id);
  }, []);

  const handleProjectCreate = useCallback((name: string) => {
    const project = createProject(name);
    // Save an empty graph for the new project
    saveGraph(getEmptyGraph(), project.id);
    setProjects(getProjects());
    setProjectId(project.id);
  }, []);

  const handleProjectDelete = useCallback((id: string) => {
    deleteProject(id);
    const remaining = getProjects();
    setProjects(remaining);
    if (id === projectId && remaining.length > 0) {
      setProjectId(remaining[0].id);
    }
  }, [projectId]);

  const handleProjectRename = useCallback((id: string, name: string) => {
    updateProject(id, { name });
    setProjects(getProjects());
  }, []);

  // Don't render until projects are loaded from localStorage
  if (!projectId) return <div className="w-screen h-screen" />;

  return (
    <div className="w-screen h-screen">
      <GraphHost
        key={`${datasetMode}-${projectId}`}
        datasetMode={datasetMode}
        onDatasetModeChange={setDatasetMode}
        projectId={projectId}
        projectName={projectName}
        projects={projects}
        onProjectSwitch={handleProjectSwitch}
        onProjectCreate={handleProjectCreate}
        onProjectDelete={handleProjectDelete}
        onProjectRename={handleProjectRename}
      />
    </div>
  );
}
