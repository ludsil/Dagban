export type AgentType = 'claude-code' | 'codex' | 'cline' | 'aider' | 'custom';

export type AgentStatus =
  | 'idle'
  | 'running'
  | 'awaiting-review'
  | 'approved'
  | 'rejected';

export interface AgentConfig {
  type: AgentType;
  command?: string;
  model?: string;
  env?: Record<string, string>;
}

export interface AgentRuntime {
  cardId: string;
  branch: string;
  worktreePath: string;
  sessionId: string;
}

export interface BridgeStatePayload {
  cardId: string;
  status: AgentStatus;
  branch?: string;
  sessionId?: string;
}

export type UiToBridgeMessage =
  | {
      type: 'start-agent';
      cardId: string;
      prompt: string;
      agentConfig: AgentConfig;
      repoPath?: string;
    }
  | {
      type: 'stop-agent';
      cardId: string;
    }
  | {
      type: 'send-feedback';
      cardId: string;
      message: string;
    }
  | {
      type: 'approve-agent';
      cardId: string;
      branch?: string;
    }
  | {
      type: 'reject-agent';
      cardId: string;
      reason?: string;
    }
  | {
      type: 'ping';
    };

export type BridgeToUiMessage =
  | {
      type: 'bridge-ready';
      repoPath: string;
    }
  | {
      type: 'agent-status';
      cardId: string;
      status: AgentStatus;
      branch?: string;
      sessionId?: string;
      detail?: string;
    }
  | {
      type: 'agent-output';
      cardId: string;
      text: string;
      stream: 'stdout' | 'stderr';
      at: string;
    }
  | {
      type: 'agent-question';
      cardId: string;
      question: string;
      at: string;
    }
  | {
      type: 'error';
      cardId?: string;
      message: string;
    };

export function isUiToBridgeMessage(value: unknown): value is UiToBridgeMessage {
  return Boolean(value && typeof value === 'object' && 'type' in value);
}
