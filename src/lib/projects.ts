// Project management types and storage utilities
import { DagbanGraph, defaultUser } from './types';
import { STANDARD_COLORS } from './colors';

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

const PROJECTS_KEY = 'dagban:projects';

/**
 * Generate a unique project ID
 */
export function generateProjectId(): string {
  return `project-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get all projects from localStorage
 */
export function getProjects(): Project[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (error) {
    console.error('Failed to load projects:', error);
    return [];
  }
}

/**
 * Save all projects to localStorage
 */
export function saveProjects(projects: Project[]): boolean {
  if (typeof window === 'undefined') return false;

  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
    return true;
  } catch (error) {
    console.error('Failed to save projects:', error);
    return false;
  }
}

/**
 * Get a single project by ID
 */
export function getProject(projectId: string): Project | null {
  const projects = getProjects();
  return projects.find(p => p.id === projectId) || null;
}

/**
 * Create a new project
 */
export function createProject(name: string, description?: string): Project {
  const now = new Date().toISOString();
  const project: Project = {
    id: generateProjectId(),
    name,
    description,
    createdAt: now,
    updatedAt: now,
  };

  const projects = getProjects();
  projects.push(project);
  saveProjects(projects);

  return project;
}

/**
 * Update an existing project
 */
export function updateProject(projectId: string, updates: Partial<Omit<Project, 'id' | 'createdAt'>>): Project | null {
  const projects = getProjects();
  const index = projects.findIndex(p => p.id === projectId);

  if (index === -1) return null;

  projects[index] = {
    ...projects[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  saveProjects(projects);
  return projects[index];
}

/**
 * Delete a project and its associated graph data
 */
export function deleteProject(projectId: string): boolean {
  if (typeof window === 'undefined') return false;

  const projects = getProjects();
  const filtered = projects.filter(p => p.id !== projectId);

  if (filtered.length === projects.length) return false;

  // Remove project from list
  saveProjects(filtered);

  // Also remove the project's graph data
  const graphKey = `dagban:project:${projectId}`;
  localStorage.removeItem(graphKey);

  return true;
}

/**
 * Get the default empty graph for a new project
 */
export function getEmptyGraph(): DagbanGraph {
  const now = new Date().toISOString();
  const ts = Date.now();
  const card1Id = `card-${ts}-a`;
  const card2Id = `card-${ts}-b`;
  // Pick two different random categories from all standard colors
  const idx1 = Math.floor(Math.random() * STANDARD_COLORS.length);
  let idx2 = Math.floor(Math.random() * (STANDARD_COLORS.length - 1));
  if (idx2 >= idx1) idx2++;
  const cat1 = STANDARD_COLORS[idx1];
  const cat2 = STANDARD_COLORS[idx2];
  return {
    users: [{ ...defaultUser }],
    traversers: [],
    categories: [
      { id: cat1.id, name: 'Untitled 1', color: cat1.color },
      { id: cat2.id, name: 'Untitled 2', color: cat2.color },
    ],
    cards: [
      {
        id: card1Id,
        title: 'Start here',
        description: 'Add notes or connect tasks from this root node.',
        categoryId: cat1.id,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: card2Id,
        title: 'Next step',
        description: 'Chain more nodes to map out your workflow.',
        categoryId: cat2.id,
        createdAt: now,
        updatedAt: now,
      },
    ],
    edges: [
      { id: `edge-${ts}`, source: card1Id, target: card2Id },
    ],
  };
}

/**
 * Check if any projects exist, create default if not
 */
export function ensureDefaultProject(): Project {
  const projects = getProjects();

  if (projects.length === 0) {
    return createProject('My First Project', 'Welcome to Dagban!');
  }

  return projects[0];
}
