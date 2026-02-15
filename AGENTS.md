# Dagban Agent Guide

This is the canonical agent guidance file for this repository.

## Undo System

- Use `useGraphUndo` from `src/lib/graph-undo.ts`.
- Route graph mutations through `applyGraphUpdate` so they are undoable.
- For high-frequency drag updates, pass `{ transient: true }` to avoid flooding undo history.
- For changes that should not be undoable, pass `{ recordUndo: false }`.
- `handleUndo` is already wired in `src/app/page.tsx` and `src/components/ProjectView.tsx`.

## Graph Action Contract

Any PR that adds, removes, or changes a graph action must:

1. Update `src/features/graph/actions/graphActionRegistry.ts`.
2. Update `docs/graph-actions.md`.
3. Explicitly set `undoable` and `apiCandidate` for the action definition.
