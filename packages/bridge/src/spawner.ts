import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { AgentConfig, AgentRuntime, AgentStatus } from './types.js';

function createSessionId(cardId: string): string {
  return `${cardId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function trimDetail(value: string): string {
  return value.trim().slice(0, 3000);
}

function toModelArgs(type: AgentConfig['type'], model?: string): string[] {
  if (!model) return [];
  switch (type) {
    case 'codex':
      return ['--model', model];
    case 'claude-code':
      return ['--model', model];
    case 'cline':
      return ['--model', model];
    case 'aider':
      return ['--model', model];
    case 'custom':
      return [];
  }
}

type StatusReporter = (payload: {
  cardId: string;
  status: AgentStatus;
  branch?: string;
  sessionId?: string;
  detail?: string;
}) => void;

type OutputReporter = (payload: {
  cardId: string;
  text: string;
  stream: 'stdout' | 'stderr';
}) => void;

interface RunningAgent {
  child: ChildProcessWithoutNullStreams;
  runtime: AgentRuntime;
  stopRequested: boolean;
}

export class AgentSpawner {
  private readonly running = new Map<string, RunningAgent>();

  constructor(
    private readonly reportStatus: StatusReporter,
    private readonly reportOutput: OutputReporter
  ) {}

  isRunning(cardId: string): boolean {
    return this.running.has(cardId);
  }

  getRuntime(cardId: string): AgentRuntime | null {
    return this.running.get(cardId)?.runtime ?? null;
  }

  start(args: {
    cardId: string;
    prompt: string;
    config: AgentConfig;
    worktreePath: string;
    branch: string;
  }): AgentRuntime {
    if (this.running.has(args.cardId)) {
      throw new Error(`Agent already running for card ${args.cardId}`);
    }

    const sessionId = createSessionId(args.cardId);
    const runtime: AgentRuntime = {
      cardId: args.cardId,
      branch: args.branch,
      worktreePath: args.worktreePath,
      sessionId,
    };

    const child = this.spawnAgentProcess(args.config, args.prompt, args.worktreePath);
    this.running.set(args.cardId, { child, runtime, stopRequested: false });
    this.reportStatus({
      cardId: args.cardId,
      status: 'running',
      branch: args.branch,
      sessionId,
    });

    child.stdout.on('data', chunk => {
      const text = String(chunk);
      this.reportOutput({
        cardId: args.cardId,
        text,
        stream: 'stdout',
      });
    });

    child.stderr.on('data', chunk => {
      const text = String(chunk);
      this.reportOutput({
        cardId: args.cardId,
        text,
        stream: 'stderr',
      });
    });

    child.on('exit', code => {
      const current = this.running.get(args.cardId);
      const requestedStop = current?.stopRequested ?? false;
      this.running.delete(args.cardId);

      if (requestedStop) {
        this.reportStatus({
          cardId: args.cardId,
          status: 'idle',
          branch: args.branch,
          sessionId,
          detail: 'Agent stopped by user.',
        });
        return;
      }

      if (code === 0) {
        this.reportStatus({
          cardId: args.cardId,
          status: 'awaiting-review',
          branch: args.branch,
          sessionId,
        });
      } else {
        this.reportStatus({
          cardId: args.cardId,
          status: 'rejected',
          branch: args.branch,
          sessionId,
          detail: `Agent exited with code ${code ?? 'unknown'}.`,
        });
      }
    });

    child.on('error', error => {
      this.running.delete(args.cardId);
      this.reportStatus({
        cardId: args.cardId,
        status: 'rejected',
        branch: args.branch,
        sessionId,
        detail: trimDetail(error.message),
      });
    });

    return runtime;
  }

  async stop(cardId: string): Promise<void> {
    const running = this.running.get(cardId);
    if (!running) return;
    running.stopRequested = true;
    running.child.kill('SIGTERM');

    await new Promise<void>(resolve => {
      const timeout = setTimeout(() => {
        running.child.kill('SIGKILL');
        resolve();
      }, 5000);

      running.child.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  sendFeedback(cardId: string, message: string): void {
    const running = this.running.get(cardId);
    if (!running) {
      throw new Error(`No running agent for card ${cardId}`);
    }
    if (!running.child.stdin.writable) {
      throw new Error(`Agent stdin is not writable for card ${cardId}`);
    }
    running.child.stdin.write(`${message.trim()}\n`);
  }

  private spawnAgentProcess(config: AgentConfig, prompt: string, worktreePath: string): ChildProcessWithoutNullStreams {
    const env = {
      ...process.env,
      ...(config.env || {}),
    };
    const modelArgs = toModelArgs(config.type, config.model);

    switch (config.type) {
      case 'claude-code':
        return spawn('claude', ['-p', prompt, '--worktree', worktreePath, ...modelArgs], {
          cwd: worktreePath,
          env,
          stdio: 'pipe',
        });
      case 'codex':
        return spawn('codex', ['exec', prompt, ...modelArgs], {
          cwd: worktreePath,
          env,
          stdio: 'pipe',
        });
      case 'cline':
        return spawn('cline', ['-y', prompt, ...modelArgs], {
          cwd: worktreePath,
          env,
          stdio: 'pipe',
        });
      case 'aider':
        return spawn('aider', ['--message', prompt, ...modelArgs], {
          cwd: worktreePath,
          env,
          stdio: 'pipe',
        });
      case 'custom': {
        const base = config.command?.trim();
        if (!base) {
          throw new Error('Custom agent requires a command.');
        }
        const command = `${base} ${shellQuote(prompt)}`;
        return spawn('/bin/zsh', ['-lc', command], {
          cwd: worktreePath,
          env,
          stdio: 'pipe',
        });
      }
    }
  }
}
