# Dagban as Agent Orchestrator

## Vision

Dagban becomes a **visual DAG-based orchestrator** for AI coding agents.
Instead of a flat task list (like Conductor), users plan work as a directed graph
where nodes are tasks and edges are dependencies. Agents are assigned to nodes
and work through the graph with human oversight.

Think: **Conductor, but the workspace list is replaced by a dependency graph.**

---

## Intended User Flow

### Manual attachment (human initiates)

1. User creates a graph of tasks in Dagban (cards + edges as dependencies)
2. User selects a card and **assigns an agent** to it (e.g. "Claude Code", "Codex")
3. User explicitly **starts** the agent — it doesn't auto-run just because it's assigned
4. Dagban spawns an agent process (in an isolated git worktree) for that card
5. The agent works using the card's description/title as its task prompt
6. Agent commits its work to the worktree branch

### Human-in-the-loop review gate

7. When the agent signals completion, the card enters **"awaiting review"** state
8. User reviews the diff (in Dagban or via PR) — the agent does NOT auto-mark the task as done
9. User can:
   - **Approve** → card is marked done (burnt), downstream cards become unblocked
   - **Request changes** → agent receives feedback and continues working
   - **Reject** → agent is stopped, card returns to pending

### Auto-cascade (with pre-allocation)

10. When a card is approved and the next card in the graph:
    - Has an agent pre-assigned, AND
    - All its dependencies (incoming edges) are now satisfied (burnt)
    → The agent **automatically starts** on that card
11. Cards without a pre-assigned agent just become "ready" — user assigns manually

### Key principles

- **No fully autonomous traversal.** Agents don't march through the graph without
  human checkpoints. Every edge crossing requires human approval.
- **Agents don't auto-start on assignment.** Assigning an agent is a declaration
  of intent, not a trigger. Starting is explicit.
- **Auto-cascade is opt-in.** It only happens when a card has a pre-assigned agent
  AND its dependencies are met. The user chose this by pre-assigning.

---

## The "Who Owns the Agents" Question

### The spectrum (from research)

| Model | Example | How it works |
|-------|---------|-------------|
| Local process | Aider, Claude Code, Cline | Spawns on your machine, dies when done |
| Local orchestrator | Conductor, ccswarm | GUI/CLI spawns multiple local agent processes |
| CI runner | GitHub Agentic Workflows | Triggered by repo events, runs on GitHub infra |
| Cloud sandbox | Codex Cloud, Devin | Each task gets an isolated cloud VM/container |
| Self-hosted remote | SWE-agent on AWS | Your infra, agents run remotely |

### What Conductor does (the closest model)

Conductor is a **macOS desktop app** that wraps Claude Code:

- Each workspace = a **git worktree** in `~/conductor/workspaces/`
- Uses the **Claude Code TypeScript SDK** to spawn and control agent processes
- Agents run locally with full filesystem access (no sandboxing)
- Auth reuses your existing Claude Code login / API key
- **The app must be open** for agents to run — no background daemon
- Review flow: integrated diff viewer → PR creation → merge gate with CI checks
- Workspaces can be archived and restored with full chat history

Key insight: Conductor doesn't run agents remotely. It's a local tool that
manages local processes. The only remote component is the LLM API call.

---

## Where Should Agent Spawning Live?

### Option A: Dagban becomes a desktop app (Tauri/Electron)

Dagban ships as a native app (like Conductor) with full local process capabilities.

```
┌─────────────────────────────────────────┐
│  Dagban Desktop (Tauri)                 │
│                                         │
│  ┌─────────────┐  ┌─────────────┐      │
│  │ Graph UI     │  │ Agent Mgr   │      │
│  │ (web view)   │  │ (Rust/Node) │      │
│  │              │  │             │      │
│  │ Plan/review  │  │ Spawn CLI   │      │
│  │ Assign agent │  │ Manage wt   │      │
│  │ View diffs   │  │ Track status│      │
│  └─────────────┘  └─────────────┘      │
│                                         │
│  Worktrees: ~/dagban/worktrees/         │
│  Agents: claude -p "..." --worktree     │
│          codex exec "..."               │
└─────────────────────────────────────────┘
```

**Pros:**
- Cleanest UX — everything in one app, like Conductor
- Can spawn processes directly (Claude Code, Codex CLI, any CLI agent)
- Can manage git worktrees directly
- Can watch process stdout for status updates
- No extra setup — install app, point at a repo, go

**Cons:**
- Major architectural shift from web app to desktop app
- Tauri: Rust backend (learning curve but small binary, fast)
- Electron: Familiar web stack but heavy (~150MB+)
- Need to handle cross-platform (Mac first, Linux/Windows later)
- Conductor is Mac-only and closed-source — doing this open-source is ambitious

### Option B: Web app + local companion daemon

Keep Dagban as a web app. Add a lightweight local process (`dagban-bridge`)
that handles agent spawning and git operations.

```
┌──────────────────┐     localhost:9876     ┌──────────────────┐
│  Dagban Web UI   │ ◄──── WebSocket ────► │  dagban-bridge   │
│  (browser)       │                        │  (Node CLI)      │
│                  │  "spawn claude on      │                  │
│  Graph editor    │   card-123"            │  Spawn agents    │
│  Agent assignment│                        │  Manage worktrees│
│  Status display  │  "card-123 completed   │  Watch processes │
│  Diff viewer     │   branch: feat/..."    │  Git operations  │
│                  │                        │                  │
└──────────────────┘                        └──────────────────┘
```

**Pros:**
- Web app stays a web app — no Tauri/Electron rewrite
- Bridge is a small Node script, easy to build and distribute (`npx dagban-bridge`)
- Clean separation: UI vs. process management
- Bridge could also handle git sync (solving the collab story too)
- Could work with remote bridges over SSH (future: agents on a server)

**Cons:**
- Two things to run (web app + bridge) — worse DX than one app
- WebSocket protocol design needed
- Bridge needs to be robust (process crashes, cleanup, etc.)
- User has to install and run the bridge manually

### Option C: Web app with File System Access API

Use the browser's [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)
to read/write a plan file to a local repo. A separate watcher script
handles agent spawning.

```
┌──────────────────┐     File System API     ┌──────────────────┐
│  Dagban Web UI   │ ──── reads/writes ────► │  project repo    │
│  (browser)       │     .dagban/plan.json   │                  │
│                  │                          │  .dagban/        │
│                  │                          │    plan.json     │
│                  │                          │    status/       │
└──────────────────┘                          └────────┬─────────┘
                                                       │
                                              ┌────────▼─────────┐
                                              │  dagban-watch     │
                                              │  (standalone CLI) │
                                              │                   │
                                              │  Reads plan.json  │
                                              │  Spawns agents    │
                                              │  Writes status/   │
                                              └───────────────────┘
```

**Pros:**
- Most decoupled — Dagban and the watcher are completely independent
- Plan file is a standard JSON file — any tool can read/write it
- The watcher could be written in any language
- Maximum agent-agnosticism — the file format is the only contract

**Cons:**
- File System Access API is Chrome-only (no Firefox/Safari)
- Polling-based communication (no real-time status updates without bridge)
- Two things to run + manual file path setup
- Weakest integration — feels disconnected

### Option D: Dagban as Electron app wrapping the current web UI

Minimal rewrite: wrap the existing React app in Electron, add a Node backend
for process spawning. The graph UI is unchanged.

```
┌─────────────────────────────────────────┐
│  Electron                               │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  Dagban React App (renderer)    │   │
│  │  (unchanged web UI)             │   │
│  └──────────────┬──────────────────┘   │
│                 │ IPC                    │
│  ┌──────────────▼──────────────────┐   │
│  │  Node Backend (main process)    │   │
│  │  - Spawn agent CLIs             │   │
│  │  - Manage git worktrees         │   │
│  │  - File system access           │   │
│  │  - Git operations               │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

**Pros:**
- Web UI code stays as-is
- Full Node.js backend for process spawning, git, filesystem
- Familiar stack (React + Node)
- Ships as one app

**Cons:**
- Electron is heavy (~150MB)
- Cross-platform from day one (Electron handles it)
- Need to learn Electron IPC patterns
- Slower startup than Tauri

---

## Recommendation

**Start with Option B (web + bridge), evolve to Option A or D if needed.**

Reasoning:

1. The web app works today. A bridge is additive — no rewrite risk.
2. `dagban-bridge` is a small Node script that can be prototyped fast.
3. The bridge protocol (WebSocket JSON messages) is a clean abstraction
   that works regardless of where the bridge runs (local, SSH, cloud).
4. If the bridge proves the concept, wrapping everything in Electron/Tauri
   is just packaging — the bridge becomes the backend.
5. The bridge also solves git sync (the collab story from `docs/collab.md`).

The bridge becomes the **universal backend** — it handles both agent orchestration
AND git-based persistence, replacing localStorage with a proper file-based store.

---

## Agent Assignment Model

### What "assign an agent" means

Assigning an agent to a card means:

1. **Agent type**: Which CLI tool to invoke (`claude-code`, `codex`, `cline`, `aider`, custom)
2. **Task prompt**: The card's title + description become the agent's instructions.
   All context about what should be done lives in the card's post-it content.
3. **Agent session**: Each assignment creates a session — a running process
   in an isolated worktree, tied to this specific card.

### Agent-to-human communication

When an agent needs to ask a question:

- **In Dagban (ideal):** Agent questions appear as messages on the card.
  The user answers in the Dagban interface. This requires the bridge to
  relay agent stdout/questions back to the UI.
- **In terminal (fallback):** User can open a terminal to the agent's
  worktree and interact directly (e.g. `claude --resume <session>`).
- **Via PR comments (async):** Agent opens a draft PR with questions
  as comments. User responds on GitHub. Agent picks up the response.

### Agent-agnostic dispatch

The bridge invokes agents through a simple interface:

```typescript
interface AgentConfig {
  type: 'claude-code' | 'codex' | 'cline' | 'aider' | 'custom';
  command?: string;        // for 'custom' type — the CLI command to run
  model?: string;          // override model (e.g. 'opus', 'sonnet')
  env?: Record<string, string>;  // extra env vars
}

// Bridge spawns:
// claude-code → claude -p "${prompt}" --worktree ${cardId}
// codex       → codex exec "${prompt}"
// cline       → cline -y "${prompt}"
// aider       → aider --message "${prompt}"
// custom      → ${command} "${prompt}"
```

Any CLI tool that accepts a prompt and works in a directory can be an agent.

---

## Review Gate (Conductor-style)

Following Conductor's model, which handles this well:

### The flow

1. Agent works in its worktree branch (e.g. `dagban/card-abc123`)
2. Agent signals completion (process exits with code 0)
3. Bridge notifies Dagban UI → card status becomes **"awaiting review"**
4. Dagban shows:
   - **Diff view**: What the agent changed (turn-by-turn if possible)
   - **Approve / Request Changes / Reject** buttons
5. On **Approve**:
   - Bridge creates a PR from the worktree branch → target branch
   - Or merges directly if user prefers
   - Card burns → downstream cards with pre-assigned agents auto-start
6. On **Request Changes**:
   - User writes feedback
   - Bridge resumes the agent with the feedback as a new prompt
   - Card returns to "in progress"
7. On **Reject**:
   - Agent process is killed (if still running)
   - Worktree branch is preserved (not deleted) for reference
   - Card returns to "pending"

### What Conductor gets right

- **Diff viewer is first-class** — not an afterthought, it's the core review UX
- **Turn-by-turn diffs** — see what each agent action changed, not just the final state
- **Suggested next action** — "push", "create PR", "merge" as one-click buttons
- **CI integration** — merge is blocked until checks pass
- **Inline comments** on diffs feed back to the agent as context
- **Post-merge memory** — "what did we learn?" gets saved for future sessions

---

## How This Relates to collab.md

The orchestrator vision and the collaboration vision **converge on the same architecture:**

| Need | Orchestrator | Collaboration | Shared solution |
|------|-------------|---------------|-----------------|
| Git operations | Create worktrees, commit agent work | Push/pull graph state | Bridge handles all git |
| File watching | Monitor agent process, detect completion | Detect external changes to graph | Bridge watches filesystem |
| Process management | Spawn/stop agent CLIs | N/A | Bridge spawns processes |
| Real-time updates | Agent status → UI | Multi-user sync | Bridge ↔ UI via WebSocket |

The `dagban-bridge` serves both purposes:
- **As orchestrator**: spawns agents, manages worktrees, relays status
- **As sync layer**: commits graph state to git, handles push/pull

This means we don't need two separate backends — one bridge handles everything.

---

## Comparison with Conductor

| Aspect | Conductor | Dagban (proposed) |
|--------|-----------|-------------------|
| Task model | Flat workspace list | Dependency DAG |
| Agent dispatch | Manual per-workspace | Manual + auto-cascade on dependencies |
| Traversal | Independent workspaces | Graph-aware — edges encode order |
| Review gate | Diff viewer + merge | Same (learn from Conductor) |
| Human-in-the-loop | Plan mode, inline comments | Required at every edge crossing |
| Agent support | Claude Code, Codex | Agent-agnostic (any CLI tool) |
| Platform | macOS desktop (closed source) | Web + bridge (open source) |
| Architecture | Electron-like + Claude Code SDK | React web app + Node bridge |
| Worktree management | Built-in | Via bridge |
| Git integration | GitHub PRs, CI checks | Git-based (matches collab story) |

### What Dagban adds over Conductor

1. **Dependency-aware scheduling**: Conductor workspaces are independent.
   Dagban knows that card B depends on card A — it won't start B until A is approved.
2. **Visual execution plan**: You can see the full plan as a graph, not just
   a list of active workspaces. Bottlenecks, parallel opportunities, and
   progress are visually obvious.
3. **Agent-agnostic**: Conductor bundles Claude Code. Dagban dispatches to
   any CLI agent through a uniform interface.
4. **Human review at every edge**: Conductor lets agents run freely within
   a workspace. Dagban enforces review gates between dependent tasks.

---

## What Similar Tools Do

| Tool | Approach |
|------|----------|
| Conductor | GUI wrapper around Claude Code, git worktrees, local processes |
| claude-flow | MCP-based orchestration, SQLite memory, local processes |
| ccswarm | Simple Claude Code parallel execution with worktrees |
| GitHub Agentic Workflows | CI-triggered agents (Claude, Codex) on GitHub Actions |
| Devin | Cloud VMs per task, fully hosted, async |
| Open SWE | Cloud sandboxes (Daytona), async, multi-agent |
| Codex Cloud | OpenAI containers, async, parallel tasks |
| SWE-agent | Docker containers, research-focused |

The tools closest to Dagban's vision are **Conductor** (local GUI orchestrator)
and **GitHub Agentic Workflows** (repo-triggered agents). Dagban's unique angle
is the **dependency graph as the orchestration primitive**.

---

## Open Questions

1. **Desktop vs. web**: Should Dagban eventually become a desktop app (Tauri/Electron)
   for tighter local integration, or stay web + bridge?

2. **Multi-repo support**: Can one Dagban graph span multiple code repositories?
   (e.g. card A works on the backend repo, card B works on the frontend repo)

3. **Agent memory across cards**: Should context from card A's agent session
   carry forward to card B's agent? Conductor does this with "workspace forking."

4. **Parallel agents**: Can multiple cards be worked on simultaneously by different
   agents? (Yes, if they have no dependency relationship — the graph tells you this.)

5. **Graph as AGENTS.md**: Could Dagban export the graph as an AGENTS.md-like file
   that agents read for project context? The graph structure encodes architectural
   knowledge that agents benefit from.

6. **Pricing/API keys**: Conductor reuses the user's Claude Code auth. Dagban
   should do the same — bring your own API keys, no vendor lock-in.
