# Dagban Agent Guide

This is the canonical agent guidance file for this repository.

## Undo System

- Use `useGraphUndo` from `src/lib/graph-undo.ts`.
- Route graph mutations through `applyGraphUpdate` so they are undoable.
- For high-frequency drag updates, pass `{ transient: true }` to avoid flooding undo history.
- For changes that should not be undoable, pass `{ recordUndo: false }`.
- `handleUndo` is already wired in `src/app/page.tsx` and `src/components/ProjectView.tsx`.

## UI Component Rules

- **Always use shadcn components** from `src/components/ui/` instead of raw HTML elements.
  Available: `Button`, `Dialog`, `DropdownMenu`, `Input`, `Kbd`, `Popover`, `Select`, `Textarea`, `Toggle`, `ToggleGroup`, `Tooltip`, `Avatar`.
- **Never use raw `<button>`** — use `<Button>` with the appropriate `variant` (`default`, `ghost`, `outline`, `destructive`, `secondary`, `link`) and `size` (`default`, `xs`, `sm`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg`).
- **Icon-only buttons must have a Tooltip** wrapping them (`Tooltip` + `TooltipTrigger asChild` + `TooltipContent`).
- **Button content must be static** — never change a button's label or icon based on state. Use visual indicators (variant change, tint) for state feedback. If a control has multiple values, open a workspace/dropdown/popover to choose.
- **Icons come from `lucide-react`** — never use inline SVGs for icons when a lucide icon exists.
- **Styling uses the `--graph-ui-button-*` CSS custom properties** defined in `globals.css`. The shadcn Button variants already consume these. Don't duplicate with manual `rgba()` colors.
- **Tailwind for one-off overrides**, CSS classes in `globals.css` for reused patterns.

## Graph Action Contract

Any PR that adds, removes, or changes a graph action must:

1. Update `src/features/graph/actions/graphActionRegistry.ts`.
2. Update `docs/graph-actions.md`.
3. Explicitly set `undoable` and `apiCandidate` for the action definition.
