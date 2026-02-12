# Dagban Notes

Undo system guidance:
Use `useGraphUndo` from `src/lib/graph-undo.ts` and route all graph mutations through `applyGraphUpdate` so they are undoable.
For high-frequency drag updates, pass `{ transient: true }` to avoid flooding the undo history.
For changes that should not be undoable, pass `{ recordUndo: false }`.
`handleUndo` is already wired in `src/app/page.tsx` and `src/components/ProjectView.tsx`.
