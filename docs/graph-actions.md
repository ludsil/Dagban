# Graph Actions Catalog

Canonical source of truth: `src/features/graph/actions/graphActionRegistry.ts`.

This document is the human-readable mirror of the registry and should stay in sync.

## Purpose

- Define every supported graph action in one place.
- Separate domain mutations from UI-only interactions.
- Make future API design explicit and low-risk.

## Action Kinds

- `domain`: mutates graph/project state or represents a project-level capability.
- `ui`: interaction only, does not mutate graph domain state.

## Current Actions

| Action ID | Kind | Domain | Undoable | API Candidate | Description |
| --- | --- | --- | --- | --- | --- |
| `graph.project.import` | `domain` | `project` | Yes | Yes | Replace current graph with imported Dagban payload. |
| `graph.project.export` | `domain` | `project` | No | Yes | Export current graph as JSON. |
| `graph.project.undo` | `domain` | `project` | No | No | Restore latest graph snapshot from undo stack. |
| `graph.node.create` | `domain` | `node` | Yes | Yes | Create a node, optionally linked upstream/downstream. |
| `graph.node.update` | `domain` | `node` | Yes | Yes | Update card fields (title, description, assignee, etc.). |
| `graph.node.assign_agent` | `domain` | `node` | Yes | Yes | Assign agent worker type/config to a node. |
| `graph.node.update_agent_status` | `domain` | `node` | Yes | Yes | Update agent execution/review status for a node. |
| `graph.node.clear_agent` | `domain` | `node` | Yes | Yes | Remove agent assignment and runtime metadata from a node. |
| `graph.node.delete` | `domain` | `node` | Yes | Yes | Delete node and cascade cleanup of edges/traversers. |
| `graph.edge.create` | `domain` | `edge` | Yes | Yes | Create directed edge between two nodes. |
| `graph.edge.delete` | `domain` | `edge` | Yes | Yes | Delete edge and attached traverser if present. |
| `graph.user.add` | `domain` | `user` | Yes | Yes | Add user to project user list. |
| `graph.traverser.attach` | `domain` | `traverser` | Yes | Yes | Attach traverser to edge/root slot. |
| `graph.traverser.update` | `domain` | `traverser` | Yes | Yes | Update traverser position or assignment fields. |
| `graph.traverser.detach` | `domain` | `traverser` | Yes | Yes | Remove traverser from graph. |
| `ui.hud.focus_search` | `ui` | `hud` | No | No | Focus HUD search input (`/`, `Cmd/Ctrl+K`). |
| `ui.hotkeys.toggle_map` | `ui` | `hotkeys` | No | No | Toggle hotkey help modal (`M`, `?`). |

## Change Rules

Any PR that adds, removes, or changes a graph action must:

1. Update `src/features/graph/actions/graphActionRegistry.ts`.
2. Update this document.
3. Explicitly classify undo behavior (`undoable`) and API suitability (`apiCandidate`).
