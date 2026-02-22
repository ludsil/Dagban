# Alternate Plan: Orchestrator-First Identity

> **This is the alternate direction.** The primary direction is in
> `docs/orchestrator.md` (planning tool + thin agent layer).
> This doc explores what happens if Dagban goes all-in on being
> an agent orchestrator — essentially becoming a visual Conductor.

---

## The Pitch

Dagban becomes the **best way to orchestrate AI coding agents**.
A visual DAG replaces flat task lists. You see your entire execution
plan, assign agents to nodes, watch them work in parallel, review
diffs, approve merges — all from one interface.

Think: **Conductor with a dependency graph instead of a workspace list,
open-source, agent-agnostic, and without the memory leaks.**

Vibe coding Conductor — but built right — is a value proposition on its own.

---

## What This Means

### Dagban IS the orchestrator

- The graph is an execution plan, not a planning board
- Every card is a concrete coding task with a repo context
- Spawning agents is the primary action, not a secondary feature
- The UI is optimized for monitoring running agents, not planning work
- Diff viewing, PR management, and merge flows are first-class

### The target user

Developers who want to run multiple AI agents in parallel on a codebase.
Not "teams planning work" — specifically "engineers dispatching agents."

### What you build

A desktop app (Electron or Tauri) that:
- Manages a dependency graph of coding tasks
- Spawns Claude Code / Codex / any agent per task in git worktrees
- Shows live agent status, output, and diffs
- Handles the full PR lifecycle (create, review, merge)
- Supports human-in-the-loop review gates at every dependency edge

---

## What Separates This from the Planning-Tool Approach

### The key fork: what happens without agents?

| Question | Planning Tool | Orchestrator |
|----------|--------------|-------------|
| **Is Dagban useful without agents?** | Yes — it's a planning tool | No — it's an agent runner |
| **Who is the user?** | Any team planning work | Developers running AI agents |
| **What's a "card"?** | A task for anyone | A coding task for an agent |
| **What's the primary action?** | Plan, assign, track | Spawn, monitor, review |
| **What's the UI optimized for?** | Graph editing, planning | Agent output, diffs, status |
| **Does it need a repo connection?** | No (optional via bridge) | Yes (fundamental) |
| **Does it compete with Conductor?** | Tangentially | Directly |
| **Domain** | Any (software, ops, research) | Software development only |

### The critical decisions that diverge

1. **Repo coupling**: The orchestrator MUST know about the code repo.
   Cards without a repo context don't make sense. The planning tool
   is repo-agnostic — the bridge handles repos optionally.

2. **Desktop app**: The orchestrator probably needs to be a desktop app
   from the start (Electron/Tauri) for process spawning. The planning
   tool can stay web-only with an optional bridge.

3. **Diff viewer**: The orchestrator needs a built-in diff viewer as
   a core feature. The planning tool can defer this and link to GitHub PRs.

4. **Agent output streaming**: The orchestrator needs real-time agent
   output display (like a terminal per card). The planning tool can
   get away with status indicators and async updates.

5. **Target audience**: The orchestrator is for developers only.
   The planning tool works for any team.

---

## Architecture: Desktop App

The orchestrator approach leads directly to a desktop app. You need to
spawn processes, manage worktrees, stream agent output, and display diffs.
A web app + bridge could work, but the UX would be worse than Conductor.

```
┌─────────────────────────────────────────────────┐
│  Dagban Desktop (Electron/Tauri)                │
│                                                  │
│  ┌───────────────────────────────────────────┐  │
│  │  Graph View (React)                        │  │
│  │  - Dependency DAG with live agent status   │  │
│  │  - Click card → agent panel               │  │
│  └───────────────────────────────────────────┘  │
│                                                  │
│  ┌───────────────────────────────────────────┐  │
│  │  Agent Panel                               │  │
│  │  - Live output stream (terminal)           │  │
│  │  - Diff viewer (turn-by-turn)              │  │
│  │  - Approve / Request Changes / Reject      │  │
│  │  - Agent questions + user responses        │  │
│  └───────────────────────────────────────────┘  │
│                                                  │
│  ┌───────────────────────────────────────────┐  │
│  │  Backend (Node main process)               │  │
│  │  - Git worktree management                 │  │
│  │  - Agent process spawning (SDK/CLI)        │  │
│  │  - PR creation & merge                     │  │
│  │  - CI status polling                       │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### Tech choices

**Electron** is more pragmatic:
- React app works as-is in the renderer
- Node backend for process spawning, git, filesystem
- Familiar stack, huge ecosystem
- Conductor likely uses something similar

**Tauri** is leaner:
- ~10MB vs ~150MB bundle
- Rust backend (learning curve, but faster and safer)
- Smaller community but growing fast
- Better security model

### What you ship

- `brew install dagban` or `.dmg` download
- Point at a repo → graph editor opens
- Create tasks → assign agents → start → review → merge
- One app, no bridge, no setup beyond API keys

---

## Implementation Plan (Orchestrator Path)

### Phase 0: Electron Shell

1. Wrap current React app in Electron
2. Add IPC bridge between renderer and main process
3. Main process can access filesystem, spawn processes, run git
4. Existing localStorage persistence works in Electron

### Phase 1: Repo Connection

1. "Open repo" flow — user selects a local git repository
2. Project state stored alongside the repo (`.dagban/state.json`)
3. Git operations available from main process (branch, worktree, diff)

### Phase 2: Agent Spawning

1. Agent assignment on cards (same schema as planning-tool approach)
2. "Start" button spawns agent via main process IPC
3. Live stdout streaming to renderer via IPC
4. Process lifecycle management (stop, crash recovery)

### Phase 3: Diff & Review

1. Built-in diff viewer (use `diff2html` or similar library)
2. Turn-by-turn diffs from git log
3. Approve/reject actions that merge or discard branches
4. PR creation via `gh` CLI or GitHub API

### Phase 4: Auto-cascade & Polish

1. Dependency-aware auto-start (same logic as planning-tool approach)
2. CI status integration
3. Agent memory/context passing between cards
4. Multi-repo support

---

## Risks of This Path

### You're competing with Conductor head-on

Conductor has a team, VC funding ($2.8M), and a growing user base.
They already have the diff viewer, PR flow, workspace management.
Your advantage is the dependency graph — but that might not be enough
to overcome their head start on agent orchestration UX.

### Desktop app is a big commitment

Electron/Tauri is a different world from a Next.js web app.
Packaging, auto-updates, code signing, platform-specific bugs.
The planning-tool path avoids this entirely (web + optional bridge).

### Narrower market

"Developers running AI agents" is a subset of "teams planning work."
The orchestrator path locks you into the developer tools market.
The planning-tool path keeps the door open to other domains.

### Agent landscape is moving fast

Conductor, Devin, Codex Cloud, GitHub Agentic Workflows — all evolving
rapidly. Building an orchestrator means keeping up with agent API changes,
new agent types, and shifting best practices. The planning-tool path is
more insulated from this churn because the bridge is a thin adapter.

---

## When to Choose This Path

Choose the orchestrator path if:

- **Your primary use case is managing AI agents**, not general planning
- **You want to compete with Conductor** on UX (graph > flat list)
- **You're willing to build a desktop app** and maintain it
- **You believe the dependency graph is a strong enough differentiator**
  to overcome Conductor's lead in agent orchestration
- **You're OK narrowing the audience** to developers

Choose the planning-tool path if:

- **You want Dagban to be useful without agents** — a tool for any team
- **You want to stay web-first** and avoid desktop app complexity
- **You want to be agent-agnostic at the architecture level** — not just
  supporting multiple agents, but being fundamentally decoupled from them
- **You want a broader market** (any domain, not just software)
- **You want lower risk** — the bridge is incremental, the desktop app is a rewrite

---

## Can You Do Both?

Sort of. The planning-tool path has an escape hatch: if the bridge proves
the concept, you can later wrap everything in Electron and go orchestrator.
The orchestrator path doesn't have this luxury — once you're a desktop app,
the web-only story is an afterthought.

**The planning-tool path is the reversible decision. The orchestrator path is not.**

This doesn't mean the orchestrator path is wrong. It means if you're unsure,
start with the planning tool and evolve. If you're convicted that agent
orchestration is the future of Dagban, go desktop from day one.
