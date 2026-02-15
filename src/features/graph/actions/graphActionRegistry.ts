export type GraphActionKind = 'domain' | 'ui';
export type GraphActionDomain = 'project' | 'node' | 'edge' | 'traverser' | 'user' | 'hud' | 'hotkeys';
export type GraphActionFieldType = 'string' | 'number' | 'boolean' | 'enum' | 'object' | 'array';

export interface GraphActionFieldSchema {
  name: string;
  type: GraphActionFieldType;
  required: boolean;
  description: string;
  values?: readonly string[];
}

export interface GraphActionPayloadSchema {
  type: 'object';
  fields: readonly GraphActionFieldSchema[];
}

export const GRAPH_ACTION_IDS = [
  'graph.project.import',
  'graph.project.export',
  'graph.project.undo',
  'graph.node.create',
  'graph.node.update',
  'graph.node.delete',
  'graph.edge.create',
  'graph.edge.delete',
  'graph.user.add',
  'graph.traverser.attach',
  'graph.traverser.update',
  'graph.traverser.detach',
  'ui.hud.focus_search',
  'ui.hotkeys.toggle_map',
] as const;

export type GraphActionId = (typeof GRAPH_ACTION_IDS)[number];

export interface GraphActionDefinition {
  id: GraphActionId;
  label: string;
  kind: GraphActionKind;
  domain: GraphActionDomain;
  payload: GraphActionPayloadSchema;
  preconditions: readonly string[];
  undoable: boolean;
  apiCandidate: boolean;
  triggers: readonly string[];
  handlerRefs: readonly string[];
  notes?: string;
}

// Canonical action registry for graph behavior and future API mapping.
export const graphActionRegistry: readonly GraphActionDefinition[] = [
  {
    id: 'graph.project.import',
    label: 'Import Graph',
    kind: 'domain',
    domain: 'project',
    payload: {
      type: 'object',
      fields: [
        { name: 'graph', type: 'object', required: true, description: 'Full Dagban graph payload.' },
      ],
    },
    preconditions: [
      'Imported payload must contain cards, edges, categories, users, and traversers arrays.',
    ],
    undoable: true,
    apiCandidate: true,
    triggers: ['Project bar menu: Import graph', 'Graph HUD import callback'],
    handlerRefs: [
      'src/components/ProjectView.tsx#handleUploadGraph',
      'src/components/ProjectView.tsx#handleGraphImport',
      'src/app/page.tsx#handleGraphImport',
    ],
  },
  {
    id: 'graph.project.export',
    label: 'Export Graph',
    kind: 'domain',
    domain: 'project',
    payload: {
      type: 'object',
      fields: [],
    },
    preconditions: ['Current graph must be serializable to JSON.'],
    undoable: false,
    apiCandidate: true,
    triggers: ['Project bar menu: Export graph'],
    handlerRefs: ['src/components/ProjectView.tsx#handleDownloadGraph'],
  },
  {
    id: 'graph.project.undo',
    label: 'Undo',
    kind: 'domain',
    domain: 'project',
    payload: {
      type: 'object',
      fields: [],
    },
    preconditions: ['Undo stack must contain a snapshot.'],
    undoable: false,
    apiCandidate: false,
    triggers: ['Cmd/Ctrl+Z'],
    handlerRefs: [
      'src/lib/graph-undo.ts#handleUndo',
      'src/features/graph/DagbanGraph.tsx#keyboard-handler',
    ],
    notes: 'Action reverts previous mutations; it is not itself recorded as an undoable mutation.',
  },
  {
    id: 'graph.node.create',
    label: 'Create Node',
    kind: 'domain',
    domain: 'node',
    payload: {
      type: 'object',
      fields: [
        { name: 'card', type: 'object', required: true, description: 'Card payload for the new node.' },
        { name: 'parentCardId', type: 'string', required: false, description: 'If set, create downstream edge parent -> card.' },
        { name: 'childCardId', type: 'string', required: false, description: 'If set, create upstream edge card -> child.' },
      ],
    },
    preconditions: [
      'Card payload must include id, categoryId, and timestamps.',
      'Blank titles are allowed for fast hotkey root-node spawn; form-driven creation enforces non-empty title.',
    ],
    undoable: true,
    apiCandidate: true,
    triggers: [
      'Project bar: New node',
      'Node detail: upstream/downstream create',
      'Graph background create flow',
      'Hotkey: N (new blank root node)',
    ],
    handlerRefs: [
      'src/components/ProjectView.tsx#handleCardCreate',
      'src/app/page.tsx#handleCardCreate',
      'src/features/graph/DagbanGraph.tsx#handleCardCreation',
      'src/features/graph/DagbanGraph.tsx#createEmptyRootNode',
    ],
  },
  {
    id: 'graph.node.update',
    label: 'Update Node',
    kind: 'domain',
    domain: 'node',
    payload: {
      type: 'object',
      fields: [
        { name: 'cardId', type: 'string', required: true, description: 'Target node id.' },
        { name: 'updates', type: 'object', required: true, description: 'Partial card fields to update.' },
      ],
    },
    preconditions: ['Target card must exist.'],
    undoable: true,
    apiCandidate: true,
    triggers: ['Card detail edits', 'Status/burn state changes', 'Assignee changes'],
    handlerRefs: [
      'src/components/ProjectView.tsx#handleCardChange',
      'src/app/page.tsx#handleCardChange',
    ],
  },
  {
    id: 'graph.node.delete',
    label: 'Delete Node',
    kind: 'domain',
    domain: 'node',
    payload: {
      type: 'object',
      fields: [
        { name: 'cardId', type: 'string', required: true, description: 'Node id to delete.' },
      ],
    },
    preconditions: ['Target card must exist.'],
    undoable: true,
    apiCandidate: true,
    triggers: ['Node detail: delete', 'Node context controls'],
    handlerRefs: [
      'src/components/ProjectView.tsx#handleCardDelete',
      'src/app/page.tsx#handleCardDelete',
      'src/features/graph/DagbanGraph.tsx#handleDeleteNode',
    ],
    notes: 'Cascade behavior: connected edges and invalid traversers are removed.',
  },
  {
    id: 'graph.edge.create',
    label: 'Create Edge',
    kind: 'domain',
    domain: 'edge',
    payload: {
      type: 'object',
      fields: [
        { name: 'sourceId', type: 'string', required: true, description: 'Source node id.' },
        { name: 'targetId', type: 'string', required: true, description: 'Target node id.' },
      ],
    },
    preconditions: [
      'Source and target must both exist.',
      'Source and target cannot be the same.',
      'Duplicate directed edge is disallowed.',
    ],
    undoable: true,
    apiCandidate: true,
    triggers: ['Node link mode', 'Context edge creation'],
    handlerRefs: [
      'src/components/ProjectView.tsx#handleEdgeCreate',
      'src/app/page.tsx#handleEdgeCreate',
      'src/features/graph/DagbanGraph.tsx#completeConnection',
    ],
  },
  {
    id: 'graph.edge.delete',
    label: 'Delete Edge',
    kind: 'domain',
    domain: 'edge',
    payload: {
      type: 'object',
      fields: [
        { name: 'edgeId', type: 'string', required: true, description: 'Edge id to delete.' },
      ],
    },
    preconditions: ['Target edge must exist.'],
    undoable: true,
    apiCandidate: true,
    triggers: ['Edge menu: delete'],
    handlerRefs: [
      'src/components/ProjectView.tsx#handleEdgeDelete',
      'src/app/page.tsx#handleEdgeDelete',
      'src/features/graph/DagbanGraph.tsx#handleDeleteEdge',
    ],
    notes: 'Cascade behavior: traverser attached to the deleted edge is removed.',
  },
  {
    id: 'graph.user.add',
    label: 'Add User',
    kind: 'domain',
    domain: 'user',
    payload: {
      type: 'object',
      fields: [
        { name: 'name', type: 'string', required: true, description: 'Display name for the new user.' },
      ],
    },
    preconditions: ['Name must be non-empty after trimming.'],
    undoable: true,
    apiCandidate: true,
    triggers: ['User tray: add user dialog'],
    handlerRefs: [
      'src/components/ProjectView.tsx#handleUserAdd',
      'src/app/page.tsx#handleUserAdd',
    ],
  },
  {
    id: 'graph.traverser.attach',
    label: 'Attach Traverser',
    kind: 'domain',
    domain: 'traverser',
    payload: {
      type: 'object',
      fields: [
        { name: 'traverser', type: 'object', required: true, description: 'Traverser payload to attach on edge or root orbit.' },
      ],
    },
    preconditions: ['Target edge/root slot must be available.', 'Only one traverser per edge/root slot.'],
    undoable: true,
    apiCandidate: true,
    triggers: ['Drag user to edge/root', 'Edge menu: assign'],
    handlerRefs: [
      'src/components/ProjectView.tsx#handleTraverserCreate',
      'src/app/page.tsx#handleTraverserCreate',
      'src/features/graph/hooks/useTraverserSystem.ts',
    ],
  },
  {
    id: 'graph.traverser.update',
    label: 'Update Traverser',
    kind: 'domain',
    domain: 'traverser',
    payload: {
      type: 'object',
      fields: [
        { name: 'traverserId', type: 'string', required: true, description: 'Traverser id to update.' },
        { name: 'updates', type: 'object', required: true, description: 'Partial traverser updates (position, edgeId, userId).' },
        { name: 'transient', type: 'boolean', required: false, description: 'Use true for high-frequency drag updates.' },
      ],
    },
    preconditions: ['Traverser id must exist.'],
    undoable: true,
    apiCandidate: true,
    triggers: ['Traverser drag and magnetism flows'],
    handlerRefs: [
      'src/components/ProjectView.tsx#handleTraverserUpdate',
      'src/app/page.tsx#handleTraverserUpdate',
      'src/features/graph/hooks/useTraverserSystem.ts',
    ],
  },
  {
    id: 'graph.traverser.detach',
    label: 'Detach Traverser',
    kind: 'domain',
    domain: 'traverser',
    payload: {
      type: 'object',
      fields: [
        { name: 'traverserId', type: 'string', required: true, description: 'Traverser id to remove.' },
      ],
    },
    preconditions: ['Traverser id must exist.'],
    undoable: true,
    apiCandidate: true,
    triggers: ['Edge menu: detach traverser', 'Drop traverser on background'],
    handlerRefs: [
      'src/components/ProjectView.tsx#handleTraverserDelete',
      'src/app/page.tsx#handleTraverserDelete',
      'src/features/graph/hooks/useTraverserSystem.ts',
    ],
  },
  {
    id: 'ui.hud.focus_search',
    label: 'Focus HUD Search',
    kind: 'ui',
    domain: 'hud',
    payload: {
      type: 'object',
      fields: [],
    },
    preconditions: ['No text input is currently focused.'],
    undoable: false,
    apiCandidate: false,
    triggers: ['/', 'Cmd/Ctrl+K'],
    handlerRefs: ['src/features/graph/components/FilterHud.tsx#keyboard-handler'],
  },
  {
    id: 'ui.hotkeys.toggle_map',
    label: 'Toggle Hotkey Map',
    kind: 'ui',
    domain: 'hotkeys',
    payload: {
      type: 'object',
      fields: [],
    },
    preconditions: [],
    undoable: false,
    apiCandidate: false,
    triggers: ['M', '?'],
    handlerRefs: ['src/features/graph/DagbanGraph.tsx#keyboard-handler'],
  },
] as const;

export const graphActionRegistryById = new Map<GraphActionId, GraphActionDefinition>(
  graphActionRegistry.map(action => [action.id, action])
);

export function getGraphActionDefinition(actionId: GraphActionId): GraphActionDefinition {
  const action = graphActionRegistryById.get(actionId);
  if (!action) {
    throw new Error(`Unknown graph action id: ${actionId}`);
  }
  return action;
}
