'use client';

import { useCallback, useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import DagbanGraph from '@/components/DagbanGraph';
import { getEmptyGraph, getProjects, Project } from '@/lib/projects';
import { usePersistedGraph } from '@/lib/storage';
import type { DagbanGraph as GraphData, Card } from '@/lib/types';

interface ProjectHeaderProps {
  project: Project;
  projects: Project[];
  onProjectSelect: (projectId: string) => void;
  onNewRootNode: () => void;
  onLogoClick: () => void;
  onBackToProjects: () => void;
}

function ProjectHeader({
  project,
  projects,
  onProjectSelect,
  onNewRootNode,
  onLogoClick,
  onBackToProjects,
}: ProjectHeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setDropdownOpen(false);
    if (dropdownOpen) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => document.removeEventListener('click', handleClickOutside);
  }, [dropdownOpen]);

  return (
    <div className="header-panel">
      <button
        className="header-logo"
        onClick={onLogoClick}
        title="Settings"
      >
        <div className="header-logo-ball" />
      </button>

      <button
        className="header-back-btn"
        onClick={onBackToProjects}
        title="Back to projects"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 3h7l2 3h9v12a2 2 0 01-2 2H5a2 2 0 01-2-2V3z" />
        </svg>
      </button>

      <div className="header-project-switcher">
        <button
          className="header-project-btn"
          onClick={(e) => {
            e.stopPropagation();
            setDropdownOpen(!dropdownOpen);
          }}
        >
          <span className="header-project-name">{project.name}</span>
          <svg
            className={`header-chevron ${dropdownOpen ? 'open' : ''}`}
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {dropdownOpen && (
          <div className="header-dropdown">
            {projects.map(p => (
              <button
                key={p.id}
                className={`header-dropdown-item ${p.id === project.id ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onProjectSelect(p.id);
                  setDropdownOpen(false);
                }}
              >
                {p.name}
              </button>
            ))}
            <div className="header-dropdown-divider" />
            <button
              className="header-dropdown-item"
              onClick={(e) => {
                e.stopPropagation();
                onBackToProjects();
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3h7l2 3h9v12a2 2 0 01-2 2H5a2 2 0 01-2-2V3z" />
              </svg>
              All Projects
            </button>
          </div>
        )}
      </div>

      <button
        className="new-root-btn"
        onClick={onNewRootNode}
        title="Create new root node"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span>New</span>
      </button>
    </div>
  );
}

interface ProjectViewProps {
  projectId: string;
}

export default function ProjectView({ projectId }: ProjectViewProps) {
  const router = useRouter();
  const [allProjects] = useState<Project[]>(() => getProjects());
  const [showSettings, setShowSettings] = useState(true);
  const [triggerNewNode, setTriggerNewNode] = useState(false);

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

  const emptyGraph = useMemo(() => getEmptyGraph(), [projectId]);
  // Use persisted graph with project-specific storage
  const [graph, setGraph] = usePersistedGraph(emptyGraph, projectId);

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

  // Handle card creation (with optional parent for downstream tasks)
  const handleCardCreate = useCallback((card: Card, parentCardId?: string) => {
    const newGraph = {
      ...graph,
      cards: [...graph.cards, card],
      edges: parentCardId
        ? [
            ...graph.edges,
            {
              id: `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              source: parentCardId,
              target: card.id,
              progress: 0,
            },
          ]
        : graph.edges,
    };
    setGraph(newGraph);
  }, [graph, setGraph]);

  // Handle card deletion (also removes connected edges)
  const handleCardDelete = useCallback((cardId: string) => {
    setGraph({
      ...graph,
      cards: graph.cards.filter(card => card.id !== cardId),
      edges: graph.edges.filter(edge => edge.source !== cardId && edge.target !== cardId),
    });
  }, [graph, setGraph]);

  // Handle edge creation between existing nodes
  const handleEdgeCreate = useCallback((sourceId: string, targetId: string) => {
    setGraph({
      ...graph,
      edges: [
        ...graph.edges,
        {
          id: `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          source: sourceId,
          target: targetId,
          progress: 0,
        },
      ],
    });
  }, [graph, setGraph]);

  const handleProjectSelect = useCallback((newProjectId: string) => {
    router.push(`/project/${newProjectId}`);
  }, [router]);

  const handleBackToProjects = useCallback(() => {
    router.push('/');
  }, [router]);

  const handleNewRootNode = useCallback(() => {
    setTriggerNewNode(true);
    // Reset trigger after a short delay
    setTimeout(() => setTriggerNewNode(false), 100);
  }, []);

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
        onEdgeProgressChange={handleEdgeProgressChange}
        onCardChange={handleCardChange}
        onCategoryChange={handleCategoryChange}
        onCardCreate={handleCardCreate}
        onCardDelete={handleCardDelete}
        onEdgeCreate={handleEdgeCreate}
        projectHeader={
          <ProjectHeader
            project={project}
            projects={allProjects}
            onProjectSelect={handleProjectSelect}
            onNewRootNode={handleNewRootNode}
            onLogoClick={() => setShowSettings(!showSettings)}
            onBackToProjects={handleBackToProjects}
          />
        }
        showSettingsProp={showSettings}
        triggerNewNode={triggerNewNode}
      />
    </div>
  );
}
