import { WebSocketServer, WebSocket } from 'ws';
import type { BridgeToUiMessage, UiToBridgeMessage, AgentConfig } from './types.js';
import { isUiToBridgeMessage } from './types.js';
import { WorktreeManager } from './worktree.js';
import { AgentSpawner } from './spawner.js';

interface CardSessionState {
  cardId: string;
  repoPath: string;
  prompt: string;
  config: AgentConfig;
  branch?: string;
  worktreePath?: string;
  sessionId?: string;
}

interface BridgeServerOptions {
  port: number;
  repoPath: string;
}

export class DagbanBridgeServer {
  private readonly clients = new Set<WebSocket>();
  private readonly worktreeManager = new WorktreeManager();
  private readonly cardStateById = new Map<string, CardSessionState>();
  private readonly wsServer: WebSocketServer;
  private readonly agentSpawner: AgentSpawner;

  constructor(private readonly options: BridgeServerOptions) {
    this.agentSpawner = new AgentSpawner(
      status => {
        const state = this.cardStateById.get(status.cardId);
        if (state) {
          state.branch = status.branch ?? state.branch;
          state.sessionId = status.sessionId ?? state.sessionId;
        }
        this.broadcast({
          type: 'agent-status',
          cardId: status.cardId,
          status: status.status,
          branch: status.branch,
          sessionId: status.sessionId,
          detail: status.detail,
        });
      },
      output => {
        this.broadcast({
          type: 'agent-output',
          cardId: output.cardId,
          text: output.text,
          stream: output.stream,
          at: new Date().toISOString(),
        });
      }
    );

    this.wsServer = new WebSocketServer({ port: options.port });
    this.wsServer.on('connection', socket => this.handleConnection(socket));
    this.wsServer.on('listening', () => {
      // eslint-disable-next-line no-console
      console.log(`[dagban-bridge] listening on ws://localhost:${this.options.port}`);
    });
  }

  close(): void {
    for (const client of this.clients) {
      client.close();
    }
    this.wsServer.close();
  }

  private handleConnection(socket: WebSocket): void {
    this.clients.add(socket);
    this.send(socket, { type: 'bridge-ready', repoPath: this.options.repoPath });

    socket.on('message', async raw => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(raw));
      } catch {
        this.send(socket, { type: 'error', message: 'Invalid JSON message.' });
        return;
      }

      if (!isUiToBridgeMessage(parsed)) {
        this.send(socket, { type: 'error', message: 'Unknown message payload.' });
        return;
      }

      try {
        await this.handleMessage(parsed, socket);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown bridge error.';
        this.send(socket, { type: 'error', message });
      }
    });

    socket.on('close', () => {
      this.clients.delete(socket);
    });
  }

  private async handleMessage(message: UiToBridgeMessage, socket: WebSocket): Promise<void> {
    switch (message.type) {
      case 'ping': {
        this.send(socket, { type: 'bridge-ready', repoPath: this.options.repoPath });
        return;
      }
      case 'start-agent': {
        const repoPath = message.repoPath || this.options.repoPath;
        const worktree = await this.worktreeManager.prepare(message.cardId, repoPath);
        const runtime = this.agentSpawner.start({
          cardId: message.cardId,
          prompt: message.prompt,
          config: message.agentConfig,
          worktreePath: worktree.worktreePath,
          branch: worktree.branch,
        });

        this.cardStateById.set(message.cardId, {
          cardId: message.cardId,
          repoPath,
          prompt: message.prompt,
          config: message.agentConfig,
          branch: runtime.branch,
          worktreePath: runtime.worktreePath,
          sessionId: runtime.sessionId,
        });
        return;
      }
      case 'stop-agent': {
        await this.agentSpawner.stop(message.cardId);
        return;
      }
      case 'send-feedback': {
        const state = this.cardStateById.get(message.cardId);
        if (!state) {
          throw new Error(`No agent session found for card ${message.cardId}.`);
        }

        if (this.agentSpawner.isRunning(message.cardId)) {
          this.agentSpawner.sendFeedback(message.cardId, message.message);
          return;
        }

        const worktree = await this.worktreeManager.prepare(message.cardId, state.repoPath);
        const runtime = this.agentSpawner.start({
          cardId: message.cardId,
          prompt: `${state.prompt}\n\nReviewer feedback:\n${message.message.trim()}`,
          config: state.config,
          worktreePath: worktree.worktreePath,
          branch: worktree.branch,
        });

        this.cardStateById.set(message.cardId, {
          ...state,
          branch: runtime.branch,
          worktreePath: runtime.worktreePath,
          sessionId: runtime.sessionId,
        });
        return;
      }
      case 'approve-agent': {
        const state = this.cardStateById.get(message.cardId);
        if (!state) {
          throw new Error(`No agent session found for card ${message.cardId}.`);
        }
        const branch = message.branch || state.branch;
        if (!branch) {
          throw new Error(`No branch recorded for card ${message.cardId}.`);
        }
        await this.worktreeManager.mergeBranch(state.repoPath, branch);
        this.broadcast({
          type: 'agent-status',
          cardId: message.cardId,
          status: 'approved',
          branch,
          sessionId: state.sessionId,
        });
        return;
      }
      case 'reject-agent': {
        if (this.agentSpawner.isRunning(message.cardId)) {
          await this.agentSpawner.stop(message.cardId);
        }
        const state = this.cardStateById.get(message.cardId);
        this.broadcast({
          type: 'agent-status',
          cardId: message.cardId,
          status: 'idle',
          branch: state?.branch,
          sessionId: state?.sessionId,
          detail: message.reason?.trim() || 'Agent rejected by reviewer.',
        });
        return;
      }
    }
  }

  private broadcast(message: BridgeToUiMessage): void {
    const payload = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  private send(socket: WebSocket, message: BridgeToUiMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }
}
