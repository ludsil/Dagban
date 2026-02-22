# Collaboration Readiness Audit

## Current Architecture

### What's solid

**Data/UI separation is clean.** `ProjectView` owns state, `DagbanGraph` is pure UI.
All mutations flow through well-defined callbacks (`onCardChange`, `onEdgeCreate`, etc.).
The persistence layer (`usePersistedGraph`) is abstracted behind a hook — swapping
localStorage for a server or git backend is straightforward.

**Mutations are fine-grained.** Most updates target single fields
(`{ title: "..." }`, `{ position: 0.5 }`), which maps well to sync protocols
or git diffs. Transient updates (traverser dragging) are already flagged separately
from structural ones.

**Per-project isolation.** Each project has its own storage key and independent
graph — no shared global state to untangle.

**Action registry exists.** `graphActionRegistry.ts` documents all 13 mutation types
with schemas, preconditions, and `apiCandidate` flags — essentially an API spec.

### What's missing

| Gap | Severity | Notes |
|-----|----------|-------|
| No auth/identity | Critical | No login, sessions, or "current user" concept |
| No server/API | Critical | Everything is localStorage |
| No real-time sync | Critical | No WebSocket, polling, or CRDT |
| No entity versioning | High | No `version` field on cards/edges — can't detect conflicts |
| No conflict resolution | High | No OT, CRDT, or last-write-wins |
| Snapshot-based undo | Medium | Full graph copies (up to 50). Needs delta-based undo for multi-user |
| Settings are global | Low | View preferences in localStorage, not per-user |

### Key files

| File | Role |
|------|------|
| `src/lib/storage.ts` | localStorage persistence + `usePersistedGraph` hook |
| `src/lib/graph-undo.ts` | Undo/redo snapshot stack |
| `src/lib/types.ts` | Core types: Card, Edge, Traverser, User, Category |
| `src/lib/projects.ts` | Project CRUD |
| `src/components/ProjectView.tsx` | State owner, all mutation callbacks defined here |
| `src/features/graph/DagbanGraph.tsx` | UI orchestrator, receives data + callbacks as props |
| `src/features/graph/actions/graphActionRegistry.ts` | Mutation type catalog (API blueprint) |

### Data model

```typescript
interface DagbanGraph {
  cards: Card[];       // nodes (id, title, description, categoryId, assignee, burntAt, timestamps)
  edges: Edge[];       // directed dependencies (id, source, target)
  categories: Category[];
  users: User[];       // display-only, no auth (id, name, avatar?, color?)
  traversers: Traverser[];  // animated user positions on edges
}
```

### Mutation flow

```
User action → callback (e.g. onCardChange)
  → applyGraphUpdate(prev => next)
    → setGraph(next)           // React state
    → recordUndoSnapshot(prev) // if not transient
    → saveGraph(next)          // localStorage, 500ms debounce
```

---

## Collaboration Approach: Git-Based Workflows

Rather than real-time CRDT/OT collaboration, Dagban's JSON-serializable state
is a natural fit for **git-based version control workflows**. The graph is already
exported as a single JSON file — this maps directly to git commits, branches,
diffs, and merges.

### Why git-based?

- Dagban state is a **single JSON document** — clean atomic commits
- Users already think in terms of "save", "export", "import" — close to commit/push/pull
- Git provides **full history, branching, diffing, merging** for free
- No need for always-on WebSocket infrastructure
- Works offline by design
- Conflict resolution via merge (manual or 3-way JSON merge)

### Option A: isomorphic-git (in-browser git)

**How it works:** [isomorphic-git](https://isomorphic-git.org/) is a pure JS git
implementation that runs in the browser. Combined with
[LightningFS](https://github.com/nicolo-ribaudo/LightningFS) (IndexedDB-backed
filesystem), you get a full git repo in the browser.

**Flow:**
1. User opens project → clone/pull from remote
2. User edits graph → changes stay local (like working tree)
3. User "saves" → auto-commit to local branch
4. User "syncs" → push to remote, pull others' changes
5. Conflicts → show diff UI, let user resolve

**Pros:**
- No server-side code needed beyond a git host
- Full git history in the browser
- Works with any git remote (GitHub, Gitea, etc.)
- Offline-first by nature

**Cons:**
- isomorphic-git adds ~300KB to bundle
- Auth flow is complex (GitHub tokens, SSH keys in browser)
- JSON merges can be tricky (git sees it as text)
- No real-time presence/cursors

### Option B: User's own GitHub/GitLab

**How it works:** Users authenticate with GitHub OAuth, select a repo,
and Dagban reads/writes the graph JSON file via the GitHub API.

**Flow:**
1. User connects GitHub account (OAuth)
2. Selects or creates a repo for their Dagban projects
3. Each project is a JSON file in the repo (e.g. `projects/my-project.json`)
4. Save → commit via GitHub API (`PUT /repos/:owner/:repo/contents/:path`)
5. Load → fetch via GitHub API
6. History → GitHub's commit log
7. Collaboration → others fork/PR, or shared repo with branch-per-user

**Pros:**
- Zero infrastructure — GitHub is the backend
- Users already have GitHub accounts
- Free history, branching, PRs, diffing
- GitHub UI works as a backup viewer
- API is well-documented and stable

**Cons:**
- Tied to GitHub (or need to abstract for GitLab, Gitea)
- API rate limits (5000 req/hr authenticated)
- OAuth flow adds complexity
- No real-time — poll or manual sync
- JSON diffs in GitHub UI are noisy

### Option C: Self-hosted Gitea + isomorphic-git

**How it works:** Run a lightweight [Gitea](https://about.gitea.com/) instance
as the Dagban backend. Gitea supports CORS and works with isomorphic-git
for direct browser-to-server git operations.

**Flow:**
1. Dagban instance comes with bundled Gitea (or points to external)
2. Users get accounts on the Gitea instance
3. isomorphic-git in the browser clones/pushes to Gitea
4. Gitea handles auth, access control, repo management
5. Users can also use regular git CLI to interact with their data

**Pros:**
- Full control over infrastructure
- Gitea is tiny (~256MB RAM) and MIT-licensed
- CORS support — browser can talk to it directly
- Users can interact with repos via git CLI or web UI
- Self-contained — no dependency on GitHub

**Cons:**
- Requires hosting/ops
- Need to manage user accounts
- More moving parts than Option B

### Option D: Hybrid — localStorage + git export/import

**How it works:** Keep the current localStorage workflow for day-to-day use.
Add explicit "push to git" and "pull from git" actions.

**Flow:**
1. Normal editing in localStorage (current behavior)
2. "Push" button → commits current state to git (via API or isomorphic-git)
3. "Pull" button → fetches latest from git, merges/replaces local state
4. "History" button → shows git log, allows restoring old versions

**Pros:**
- Minimal changes to current architecture
- Git is opt-in, not required
- No always-on connection needed
- Gradual migration path

**Cons:**
- Manual sync — easy to forget
- Divergence between local and remote
- Merge conflicts need UI

### What similar tools do

| Tool | Approach |
|------|----------|
| Obsidian | Local files + optional git sync (community plugin) or paid Obsidian Sync |
| Logseq | Local files + optional git auto-commit |
| Excalidraw | Real-time collab via WebSocket, or export JSON to share |
| TLDraw | Real-time via Cloudflare Durable Objects, or JSON export |
| Linear | Server-first, local sync engine, offline support |
| Notion | Server-first, real-time OT |
| Figma | Server-first, real-time CRDT-like |

The tools closest to Dagban's philosophy (local-first, file-based) are
**Obsidian** and **Logseq** — both treat git as an optional sync layer
on top of local files.

---

## Recommendation

**Start with Option D (hybrid)**, then evolve toward Option B or C:

1. **Now:** Add a "Save to GitHub" / "Load from GitHub" flow using GitHub API.
   This is the least invasive change — the current localStorage workflow stays.
   Users get versioning and sharing via GitHub.

2. **Next:** Add auto-commit on save (debounced). The JSON file gets committed
   on every meaningful change. Users can browse history and revert.

3. **Later:** If real-time becomes important, add WebSocket presence layer
   on top of git. Git remains the source of truth, WebSocket handles
   live cursors and conflict-free field-level updates.

### Auth recommendation

For git-based collab, **GitHub OAuth** is the simplest auth to add:
- No password management
- Users already have accounts
- Gives you API access for free
- Libraries: `next-auth` with GitHub provider (3 lines of config)

Only add self-hosted auth (Gitea accounts, email/password) if you need to
support users without GitHub or want full infrastructure control.

### Schema changes needed

```typescript
// Add to Card, Edge, Traverser:
interface Card {
  // ... existing fields
  version?: number;        // optimistic concurrency control
  lastEditedBy?: string;   // user id who last changed this
}

// Add to DagbanGraph:
interface DagbanGraph {
  // ... existing fields
  schemaVersion: number;   // for migrations
  lastSyncedAt?: string;   // ISO timestamp of last git sync
  remoteSha?: string;      // git SHA of last synced commit
}
```
