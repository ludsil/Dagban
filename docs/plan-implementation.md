# Implementation Plan: Planning Tool + Agent Spawn Layer

This plan follows the **planning-tool-first** direction from `docs/orchestrator.md`.
Dagban stays a collaborative planning tool. Agent spawning is an optional feature
built on top via the `dagban-bridge`.

---

## Phase 0: Schema & Data Model (no UI changes yet)

### Goal
Add the data model fields needed for agent assignment and status tracking.
No visible changes — just prepare the types and persistence.

### Steps

1. **Extend Card type** in `src/lib/types.ts`:
   ```typescript
   interface Card {
     // ... existing fields
     workerType?: 'human' | 'agent';
     agentConfig?: {
       type: 'claude-code' | 'codex' | 'cline' | 'aider' | 'custom';
       command?: string;
       model?: string;
     };
     agentStatus?: 'idle' | 'running' | 'awaiting-review' | 'approved' | 'rejected';
     agentBranch?: string;       // git branch name for agent's worktree
     agentSessionId?: string;    // for resuming agent sessions
   }
   ```

2. **Add schema version** to graph data for future migrations:
   ```typescript
   interface DagbanGraph {
     // ... existing
     schemaVersion?: number;  // starts at 2 (current implicit = 1)
   }
   ```

3. **Add migration logic** in `src/lib/storage.ts` — when loading a graph
   without `schemaVersion`, treat it as v1 and migrate forward.

4. **Update graphActionRegistry.ts** — add new mutation types:
   - `assignAgent` — set agentConfig on a card
   - `updateAgentStatus` — change agentStatus
   - `clearAgent` — remove agent assignment

### Files touched
- `src/lib/types.ts`
- `src/lib/storage.ts`
- `src/features/graph/actions/graphActionRegistry.ts`

---

## Phase 1: Agent Assignment UI

### Goal
Let users assign an agent type to a card from the post-it card UI.

### Steps

1. **Add "Worker" section to card editor** — a dropdown or toggle:
   - Human (default) — shows assignee name field (existing)
   - Agent — shows agent type picker (Claude Code, Codex, Cline, etc.)

2. **Show agent status on card** — visual indicator on the node:
   - Idle: subtle agent icon on the card
   - Running: animated indicator (spinning, pulsing, etc.)
   - Awaiting review: review icon, distinct color
   - Approved/Rejected: standard burnt/unburnt states

3. **Add "Start Agent" button** on cards with agent assigned + idle status.
   This is a dead button without the bridge — shows a message like
   "Connect dagban-bridge to start agents."

### Files touched
- `src/features/graph/components/PostItCard.tsx` (or equivalent)
- `src/features/graph/hooks/useCanvasRendering.ts` (node visuals)
- `src/features/graph/DagbanGraph.tsx` (callbacks)
- `src/components/ProjectView.tsx` (state management)

---

## Phase 2: dagban-bridge (Core)

### Goal
Build the local bridge process that handles agent spawning, worktree
management, and communication with the Dagban web UI.

### Steps

1. **Create `packages/bridge/` directory** — separate package in the monorepo
   (or standalone repo, TBD).

2. **WebSocket server** — listens on `localhost:9876` (configurable).
   Protocol:
   ```typescript
   // UI → Bridge
   { type: 'start-agent', cardId: string, agentConfig: AgentConfig, prompt: string }
   { type: 'stop-agent', cardId: string }
   { type: 'send-feedback', cardId: string, message: string }

   // Bridge → UI
   { type: 'agent-status', cardId: string, status: AgentStatus, branch?: string }
   { type: 'agent-output', cardId: string, text: string }
   { type: 'agent-question', cardId: string, question: string }
   { type: 'bridge-ready', repoPath: string }
   ```

3. **Worktree manager** — creates/lists/cleans git worktrees:
   - `~/dagban/worktrees/<cardId>/` or `<repo>/.dagban/worktrees/<cardId>/`
   - Each worktree gets a branch: `dagban/<cardId>`
   - Cleanup on agent completion or explicit user action

4. **Agent spawner** — spawns CLI processes per agent type:
   - Claude Code: `claude -p "${prompt}" --worktree ${worktreePath}`
   - Codex: `codex exec "${prompt}"` (in worktree dir)
   - Custom: `${command} "${prompt}"`
   - Captures stdout/stderr, watches for exit

5. **Process lifecycle**:
   - Track running processes by cardId
   - Handle crashes (report to UI as error)
   - Handle user stop requests (SIGTERM then SIGKILL)
   - On exit code 0 → status "awaiting-review"
   - On exit code != 0 → status "error" with output

### Files created
- `packages/bridge/src/index.ts` — entry point
- `packages/bridge/src/ws-server.ts` — WebSocket protocol
- `packages/bridge/src/worktree.ts` — git worktree management
- `packages/bridge/src/spawner.ts` — agent process management
- `packages/bridge/src/types.ts` — shared types
- `packages/bridge/package.json`

---

## Phase 3: Bridge Connection in UI

### Goal
Connect the Dagban web app to the bridge via WebSocket. Show live
agent status, enable start/stop/feedback actions.

### Steps

1. **Bridge connection hook** — `useBridgeConnection()`:
   - Connects to `ws://localhost:9876`
   - Reconnects on disconnect
   - Exposes: `connected`, `startAgent()`, `stopAgent()`, `sendFeedback()`
   - Dispatches incoming messages to update card agent status

2. **Connection indicator** — small dot in the UI showing bridge status:
   - Green: connected
   - Gray: not connected (agent features unavailable)
   - No bridge = no problem, just no agent features

3. **Wire "Start Agent" button** to bridge:
   - Sends `start-agent` message with card's agentConfig + description
   - Button changes to "Stop" while running

4. **Agent output panel** — optional panel showing agent's stdout
   for the selected card (like a mini terminal).

5. **Auto-cascade logic** — when a card is approved (burnt):
   - Check downstream cards
   - If any have agent assigned + all deps satisfied → auto-send `start-agent`

### Files touched
- New: `src/hooks/useBridgeConnection.ts`
- `src/features/graph/DagbanGraph.tsx`
- `src/components/ProjectView.tsx`

---

## Phase 4: Review Flow

### Goal
Let users review agent work and approve/reject/request changes.

### Steps

1. **Review panel** — when a card is in "awaiting-review" status:
   - Show the branch name and link to diff (GitHub PR or local diff)
   - Approve / Request Changes / Reject buttons
   - Text input for feedback (request changes)

2. **Approve action**:
   - Bridge merges the worktree branch or creates a PR
   - Card status → approved → burnt
   - Trigger auto-cascade check

3. **Request changes action**:
   - Bridge resumes the agent with feedback text
   - Card status → running

4. **Reject action**:
   - Bridge kills agent (if running), preserves branch
   - Card status → idle (can reassign or restart)

### Future: Diff viewer
Building a full diff viewer is complex. For v1, link to GitHub PR
or show `git diff` output. A proper diff viewer is a Phase 5+ feature.

---

## Phase 5: Polish & Iteration

### Ideas (not committed to)

- **Diff viewer in Dagban** — render diffs inline, like Conductor
- **Agent memory** — pass context from completed cards to dependent cards
- **Graph export as AGENTS.md** — generate project context for agents
- **Multi-repo support** — different cards point to different repos
- **Bridge as Electron backend** — wrap everything in a desktop app
- **Remote bridge** — run the bridge on a server, connect via SSH tunnel

---

## Dependency Graph

```
Phase 0 (Schema)
    │
    ├──► Phase 1 (Assignment UI)
    │        │
    │        └──► Phase 3 (Bridge Connection in UI)
    │                 │
    │                 └──► Phase 4 (Review Flow)
    │
    └──► Phase 2 (dagban-bridge)
             │
             └──► Phase 3 (Bridge Connection in UI)
```

Phase 0 and Phase 2 can be worked on in parallel.
Phase 1 can start as soon as Phase 0 is done.
Phase 3 requires both Phase 1 (UI) and Phase 2 (bridge) to be ready.
Phase 4 builds on Phase 3.
