# Dagban

**DAG + Kanban = Dependency-driven visual work management**

A visual project management tool where tasks form a directed acyclic graph (DAG). Instead of traditional kanban columns, work items are connected by dependencies that show what each task unlocks.

## Vision

### Core Concept

Tasks are **nodes** in a graph. Dependencies are **edges** connecting them. Completing a task unlocks its dependents, creating a satisfying cascade of progress visualization.

Think FigJam-style post-it cards, but with meaningful connections that represent real workflow dependencies.

### Visual Design

#### Nodes (Cards)
- Clean, crisp post-it card aesthetic
- **Category colors**: User-defined categories with custom color assignments
- **States**:
  - **Active**: Full category color, ready to work
  - **Blocked**: Faded/dulled category color (dependencies not yet complete)
  - **Done**: Grayed out

#### Edges (Fuse/Slider)
The edge connecting two nodes acts as a **progress indicator**, visualized like a fuse:
- Draggable slider showing linear progress (0-100%)
- As work progresses, the "fuse burns" toward the target node
- When the fuse reaches 100%, the source node becomes **done** (grays out)
- Visual metaphor: lighting a fuse that burns toward unlocking the next task

```
[Task A] ====○=======> [Task B]
              ↑
         fuse/slider (drag to show progress)
         when complete, Task A grays out, Task B unlocks
```

### Layout Models (Under Evaluation)

Two approaches being evaluated in parallel:

#### Option 1: Force-Directed Graph (`feature/force-graph`)
Using [react-force-graph](https://github.com/vasturiano/react-force-graph)
- 2D and 3D visualization options
- Organic, physics-based layout
- Scales beautifully for large projects
- Nodes cluster and spread naturally based on connections

#### Option 2: Flow-Based Layout (`feature/reactflow`)
Using [React Flow](https://reactflow.dev)
- Railway-style structured layout
- More controlled, grid-aligned positioning
- Easier to manage manually
- Robust and production-ready

### Features

#### MVP
- [ ] Create/edit/delete cards (text blurbs)
- [ ] Connect cards with dependency edges
- [ ] Fuse/slider progress on edges
- [ ] User-defined categories with custom colors
- [ ] Card state transitions (blocked → active → done)
- [ ] Local storage persistence

#### Team Features
- [ ] Assign cards to team members
- [ ] Filter view by assignee
- [ ] Multi-user local mode

#### Cloud Features (Future)
- [ ] RDS database backend
- [ ] S3 for asset storage
- [ ] Real-time collaboration
- [ ] Team workspaces

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Graph Rendering**: TBD (evaluating react-force-graph vs React Flow)
- **State Management**: TBD
- **Storage**: Local first, then RDS/S3

## Development

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

*Dagban: See your work. See what's next. Light the fuse.*
