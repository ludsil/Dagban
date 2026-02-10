import { DagbanGraph } from './types';

// Sample data for development
export const sampleGraph: DagbanGraph = {
  categories: [
    { id: 'design', name: 'Design', color: '#8b5cf6' },      // purple
    { id: 'frontend', name: 'Frontend', color: '#3b82f6' },   // blue
    { id: 'backend', name: 'Backend', color: '#10b981' },     // green
    { id: 'devops', name: 'DevOps', color: '#f59e0b' },       // amber
  ],
  cards: [
    {
      id: 'wireframes',
      title: 'Create wireframes',
      description: 'Design initial wireframes for the app',
      categoryId: 'design',
      assignee: 'Alice Chen',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    },
    {
      id: 'ui-components',
      title: 'Build UI components',
      description: 'Create reusable React components',
      categoryId: 'frontend',
      assignee: 'Bob Smith',
      createdAt: '2024-01-02',
      updatedAt: '2024-01-02',
    },
    {
      id: 'api-design',
      title: 'Design API',
      description: 'Define REST API endpoints',
      categoryId: 'backend',
      assignee: 'Charlie Davis',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    },
    {
      id: 'api-impl',
      title: 'Implement API',
      description: 'Build the backend API',
      categoryId: 'backend',
      createdAt: '2024-01-03',
      updatedAt: '2024-01-03',
    },
    {
      id: 'integration',
      title: 'Frontend-Backend integration',
      description: 'Connect UI to API',
      categoryId: 'frontend',
      createdAt: '2024-01-04',
      updatedAt: '2024-01-04',
    },
    {
      id: 'deploy',
      title: 'Deploy to production',
      description: 'Set up CI/CD and deploy',
      categoryId: 'devops',
      createdAt: '2024-01-05',
      updatedAt: '2024-01-05',
    },
  ],
  edges: [
    { id: 'e1', source: 'wireframes', target: 'ui-components', progress: 100 },
    { id: 'e2', source: 'api-design', target: 'api-impl', progress: 75 },
    { id: 'e3', source: 'ui-components', target: 'integration', progress: 30 },
    { id: 'e4', source: 'api-impl', target: 'integration', progress: 0 },
    { id: 'e5', source: 'integration', target: 'deploy', progress: 0 },
  ],
};
