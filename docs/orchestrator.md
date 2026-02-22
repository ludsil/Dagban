# Dagban + AI Agents

## Vision

Dagban is a **collaborative planning tool** where teams lay out work as a
directed graph. Nodes are tasks, edges are dependencies. Any worker —
human or AI agent — can be assigned to a node.

Dagban is **not** an orchestrator. It's where work is planned and tracked.
The ability to spin up an AI agent from a card is a **feature of the planning
tool**, not its identity. Like how GitHub has Actions but isn't "a CI tool."

The graph is the product. Agent spawning is a convenience built on top.

---

## Core Identity

**Planning tool first.** Dagban is where teams in any domain plan their work
visually. The DAG structure captures dependencies, parallelism, and progress
at a glance.

**Agents are just workers.** Assigning "Claude Code" to a card is no different
from assigning "Anton." The graph doesn't care who does the work — it tracks
what needs to happen and in what order.

**Thin agent spawn layer.** Dagban ships with a built-in shortcut to start
an AI agent on a card. Click "start," agent begins working. But this is
optional — you can use your own orchestrator, your own scripts, or just
do the work manually. The spawn layer is a convenience, not the architecture.

**Decoupled from repos.** A card says "implement authentication." It doesn't
say where. The agent knows where to work — it has its own repo, worktree,
tools. Dagban's job is to say what, not how.

---

## Intended User Flow

### Manual attachment (human initiates)

1. User creates a graph of tasks in Dagban (cards + edges as dependencies)
2. User selects a card and **assigns a worker** — human name or agent type
3. For agents: user explicitly **starts** the agent — assigning is intent, not trigger
4. Agent works using the card's description as its task prompt
5. Agent commits its work to a worktree branch

### Human-in-the-loop review gate

6. When the agent signals completion, the card enters **"awaiting review"** state
7. User reviews the diff (in Dagban, via PR, or however they prefer)
8. The agent does NOT auto-mark the task as done. User decides:
   - **Approve** → card is marked done (burnt), downstream cards become unblocked
   - **Request changes** → agent receives feedback and continues
   - **Reject** → agent is stopped, card returns to pending

### Auto-cascade (with pre-allocation)

9. When a card is approved and the next card in the graph:
   - Has an agent pre-assigned, AND
   - All its dependencies (incoming edges) are satisfied (burnt)
   → The agent **automatically starts** on that card
10. Cards without a pre-assigned agent just become "ready" for manual assignment

### Key principles

- **No fully autonomous traversal.** Every edge crossing requires human approval.
  Agents are good enough to do useful work, unreliable enough that you can't
  let them chain unsupervised.
- **Agents don't auto-start on assignment.** Assigning is a declaration
  of intent, not a trigger. Starting is explicit.
- **Auto-cascade is opt-in.** Only fires when a card has a pre-assigned agent
  AND its dependencies are met. The user chose this by pre-assigning.

---

## Architecture: Web App + Bridge

Keep Dagban as a web app. Add a lightweight local process (`dagban-bridge`)
that handles agent spawning and git operations. The bridge is the only
component that touches the local filesystem and processes.

```
┌──────────────────┐     localhost:9876     ┌──────────────────┐
│  Dagban Web UI   │ ◄──── WebSocket ────► │  dagban-bridge   │
│  (browser)       │                        │  (Node CLI)      │
│                  │  "start agent on       │                  │
│  Graph editor    │   card-123"            │  Spawn agents    │
│  Worker assign   │                        │  Manage worktrees│
│  Status display  │  "card-123: awaiting   │  Watch processes │
│  Review actions  │   review, branch:..."  │  Git operations  │
│                  │                        │                  │
└──────────────────┘                        └──────────────────┘
```

### Why web + bridge?

1. The web app works today. A bridge is additive — no rewrite.
2. `dagban-bridge` is a small Node script (`npx dagban-bridge`).
3. The WebSocket protocol works regardless of where the bridge runs
   (local, SSH tunnel, cloud server) — future-proof.
4. If the concept proves out, wrapping in Electron/Tauri is just packaging:
   the bridge becomes the backend.
5. The bridge also solves git-based persistence (see `docs/collab.md`),
   replacing localStorage with proper file-backed storage.

### Without the bridge

Dagban works fine without it — it's just a planning tool with localStorage.
You lose the ability to spawn agents from the UI, but you can still:
- Export the graph as JSON
- Feed it to any external orchestrator (Conductor, ccswarm, scripts)
- Track progress manually

The bridge is an enhancement, not a requirement.

---

## Agent Assignment Model

### What "assign an agent" means

1. **Worker type**: Human name OR agent type (`claude-code`, `codex`, `cline`, etc.)
2. **Task prompt**: The card's title + description. All context lives in the card.
3. **Session**: When started, creates a running process in an isolated worktree.

### Agent-to-human communication

When an agent needs to ask a question:

- **In Dagban (ideal):** Questions appear as messages on the card.
  User answers in the Dagban UI. Bridge relays between agent and UI.
- **In terminal (fallback):** User opens a terminal to the agent's
  worktree and interacts directly (`claude --resume <session>`).
- **Via PR comments (async):** Agent opens a draft PR. User responds
  on GitHub. Works when user isn't watching Dagban.

### Agent-agnostic dispatch

The bridge invokes agents through a uniform interface:

```typescript
interface AgentConfig {
  type: 'claude-code' | 'codex' | 'cline' | 'aider' | 'custom';
  command?: string;        // for 'custom' — the CLI command
  model?: string;          // override model (e.g. 'opus', 'sonnet')
  env?: Record<string, string>;
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

## Review Gate

Following Conductor's model (they've nailed this):

1. Agent works in its worktree branch (`dagban/card-abc123`)
2. Agent signals completion (process exits with code 0)
3. Bridge notifies UI → card status becomes **"awaiting review"**
4. User reviews:
   - Diff view of what changed
   - Approve / Request Changes / Reject
5. **Approve** → PR or direct merge → card burns → downstream auto-cascade
6. **Request Changes** → feedback sent to agent → card returns to "in progress"
7. **Reject** → agent stopped → worktree preserved → card returns to pending

### Lessons from Conductor

- Diff viewer should be first-class, not an afterthought
- Turn-by-turn diffs (what each agent action changed) are valuable
- One-click "next action" buttons (push, create PR, merge)
- Inline diff comments feed back to the agent as context
- Post-merge: "what did we learn?" saved for future sessions

---

## How This Relates to collab.md

The agent spawn layer and collaboration layer **share the same backend**:

| Need | Agents | Collaboration |
|------|--------|---------------|
| Git operations | Create worktrees, commit work | Push/pull graph state |
| File watching | Monitor agent completion | Detect external graph changes |
| Process management | Spawn/stop agent CLIs | — |
| Real-time updates | Agent status → UI | Multi-user sync |

The bridge serves both: agent orchestration AND git-based persistence.
One backend, two capabilities.

---

## What Makes This Different from Conductor

| Aspect | Conductor | Dagban |
|--------|-----------|--------|
| **Identity** | Agent orchestrator | Planning tool with optional agent spawning |
| **Task model** | Flat workspace list | Dependency DAG |
| **Scheduling** | Independent workspaces | Graph-aware — edges encode order |
| **Who uses it** | Developers managing agents | Teams in any domain planning work |
| **Agent support** | Claude Code + Codex | Agent-agnostic (any CLI tool) |
| **Without agents** | Not useful | Fully functional planning tool |
| **Platform** | macOS desktop, closed source | Web + bridge, open source |
| **Review gate** | Diff viewer + merge | Same (learn from Conductor) |
| **Human-in-loop** | Optional plan mode | Required at every edge crossing |

### Dagban's unique angles

1. **Dependency-aware**: The graph knows card B depends on card A.
   It won't start B until A is approved. Conductor workspaces are independent.
2. **Visual execution plan**: Bottlenecks, parallel opportunities, and
   progress are visually obvious in a graph. Not in a flat list.
3. **Domain-agnostic**: Dagban works for any team, not just software.
   Agents are one type of worker, not the only one.
4. **Decoupled**: The graph doesn't know about repos, worktrees, or CLIs.
   The bridge handles all of that. The graph is a pure plan.

---

## Research: Agent Ownership Models

### The spectrum

| Model | Example | How it works |
|-------|---------|-------------|
| Local process | Aider, Claude Code, Cline | Spawns on your machine, dies when done |
| Local orchestrator | Conductor, ccswarm | GUI/CLI spawns multiple local agent processes |
| CI runner | GitHub Agentic Workflows | Triggered by repo events, runs on GitHub infra |
| Cloud sandbox | Codex Cloud, Devin | Each task gets an isolated cloud VM/container |
| Self-hosted remote | SWE-agent on AWS | Your infra, agents run remotely |

### What Conductor does (reference)

- macOS desktop app wrapping Claude Code via TypeScript SDK
- Each workspace = git worktree in `~/conductor/workspaces/`
- Agents run locally with full filesystem access
- Auth reuses existing Claude Code login / API key
- App must be open for agents to run — no background daemon
- Review: integrated diff viewer → PR creation → merge gate with CI checks
- Workspaces archived/restored with full chat history

### What similar tools do

| Tool | Approach |
|------|----------|
| Conductor | GUI wrapper around Claude Code, git worktrees, local |
| claude-flow | MCP-based orchestration, SQLite memory, local |
| ccswarm | Simple Claude Code parallel execution with worktrees |
| GitHub Agentic Workflows | CI-triggered agents on GitHub Actions |
| Devin | Cloud VMs per task, fully hosted, async |
| Open SWE | Cloud sandboxes (Daytona), async, multi-agent |
| Codex Cloud | OpenAI containers, async, parallel tasks |

---

## Open Questions

1. **Desktop later?** If the bridge proves out, worth wrapping in
   Electron/Tauri for single-app UX? Or keep web + bridge forever?

2. **Multi-repo**: Can one graph span multiple code repositories?
   (Card A on backend repo, card B on frontend repo)

3. **Agent memory across cards**: Should context from card A's agent
   carry to card B? Conductor does "workspace forking" for this.

4. **Parallel agents**: Multiple cards worked on simultaneously?
   (Yes, if no dependency relationship — the graph tells you this.)

5. **Graph as AGENTS.md**: Export graph as an AGENTS.md-like file
   that agents read for project context?

6. **API keys**: Bring your own — reuse existing Claude/Codex auth.
   No vendor lock-in.
