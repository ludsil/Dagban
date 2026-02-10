# Dagban Design Decisions

## Vision
Dagban is a DAG-based project/task visualization tool. Think of it as a dependency graph for tasks where:
- Nodes are tasks/cards
- Edges represent dependencies ("this blocks that")
- Visual state shows what's actionable vs blocked

## Core Principles
1. **Canvas-first**: No dashboard - everything happens on the canvas including project switching
2. **Compact EU4-style UI**: Minimal, information-dense panels that don't steal focus from the graph
3. **Local-first**: Works offline, data in localStorage (future: sync to backend)

## Layout
- Organic force-directed graph (sprawling, like react-force-graph examples)
- Multiple root nodes allowed (cards with no dependencies)
- Zoom-to-fit on initial load, then free pan/zoom
- 2D and 3D view modes supported

## Data Model
- Each graph is a "project"
- Users can have multiple projects
- **Cards**: title, description, category, assignee, status
- **Edges**: source, target, progress (0-100 "fuse")
- Categories are user-defined with custom colors

## Card States
- **Active**: full category color (all dependencies complete)
- **Blocked**: faded/dulled category color (dependencies incomplete)
- **Done**: grayed out (all outgoing edges at 100%)

## UI Components

### Header Panel (top-left)
- Compact, matches settings panel style
- Logo ball + project name dropdown
- Project switching happens here

### Settings Panel (top-right)
- Search bar at top (/ key focuses it)
- View mode: 2D / 3D
- Display mode: Balls / Labels / Full
- Color mode: Category / Indegree / Outdegree
  - Indegree: "How many dependencies block this node" (blue)
  - Outdegree: "How many nodes this one blocks" (orange)
- Arrow mode: End / Middle / None
- Collapsible filter sections:
  - Category filter (colored dots)
  - Status filter (Active/Blocked/Done)
  - Blocker Rate slider
  - Assignee filter (avatars with initials)

### Styling
- Dark theme (rgba(20,20,20,0.95) backgrounds)
- Gray color scheme for panels
- Compact sizing (8-10px fonts, 3-6px padding)
- Backdrop blur for depth
- Collapsible sections with chevron toggles

## Visual
- FigJam-style post-it cards
- Edges show "fuse" progress as burning toward target
- Customizable theming planned (bg color, node colors, fonts)
- Dark/light mode eventually (not urgent)

## Storage
- Local-first (localStorage via usePersistedGraph hook)
- Future: RDS database, S3 for assets

## Tech Stack
- Next.js 16 with App Router
- react-force-graph for visualization
- Tailwind CSS + custom CSS
- TypeScript

## Current State (as of bead da-r86t)
- [x] Force-directed graph visualization (2D/3D)
- [x] Card CRUD operations
- [x] Edge creation and progress
- [x] Category and assignee management
- [x] Compact settings panel with filters
- [x] Collapsible filter sections
- [x] Search with / shortcut
- [x] Local persistence
- [ ] Multi-project support (routing exists, UI incomplete)
- [ ] Backend sync
- [ ] Collaborative features
