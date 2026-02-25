'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Card } from '@/lib/types';

type AgentConfig = NonNullable<Card['agentConfig']>;
type AgentStatus = NonNullable<Card['agentStatus']>;

interface AgentStatusMessage {
  type: 'agent-status';
  cardId: string;
  status: AgentStatus;
  branch?: string;
  sessionId?: string;
  detail?: string;
}

interface AgentOutputMessage {
  type: 'agent-output';
  cardId: string;
  text: string;
  stream: 'stdout' | 'stderr';
  at: string;
}

interface BridgeReadyMessage {
  type: 'bridge-ready';
  repoPath: string;
}

interface BridgeErrorMessage {
  type: 'error';
  cardId?: string;
  message: string;
}

type BridgeMessage =
  | AgentStatusMessage
  | AgentOutputMessage
  | BridgeReadyMessage
  | BridgeErrorMessage
  | {
      type: 'agent-question';
      cardId: string;
      question: string;
      at: string;
    };

type AgentOutputEntry = {
  text: string;
  stream: 'stdout' | 'stderr';
  at: string;
};

interface UseBridgeConnectionOptions {
  enabled?: boolean;
  url?: string;
  onAgentStatus?: (message: AgentStatusMessage) => void;
  onError?: (message: string) => void;
}

interface StartAgentParams {
  cardId: string;
  prompt: string;
  agentConfig: AgentConfig;
  repoPath?: string;
}

const RECONNECT_DELAY_MS = 2000;

export function useBridgeConnection(options: UseBridgeConnectionOptions = {}) {
  const {
    enabled = true,
    url = 'ws://localhost:9876',
    onAgentStatus,
    onError,
  } = options;
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const onAgentStatusRef = useRef(onAgentStatus);
  const onErrorRef = useRef(onError);

  const [connected, setConnected] = useState(false);
  const [bridgeRepoPath, setBridgeRepoPath] = useState<string | null>(null);
  const [outputsByCard, setOutputsByCard] = useState<Record<string, AgentOutputEntry[]>>({});

  useEffect(() => {
    onAgentStatusRef.current = onAgentStatus;
  }, [onAgentStatus]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const appendOutput = useCallback((message: AgentOutputMessage) => {
    setOutputsByCard(prev => {
      const next = prev[message.cardId]
        ? [...prev[message.cardId], { text: message.text, stream: message.stream, at: message.at }]
        : [{ text: message.text, stream: message.stream, at: message.at }];
      return {
        ...prev,
        [message.cardId]: next.slice(-250),
      };
    });
  }, []);

  const handleMessage = useCallback((event: MessageEvent) => {
    let parsed: BridgeMessage;
    try {
      parsed = JSON.parse(event.data) as BridgeMessage;
    } catch {
      onErrorRef.current?.('Bridge returned malformed JSON.');
      return;
    }

    switch (parsed.type) {
      case 'bridge-ready':
        setBridgeRepoPath(parsed.repoPath);
        return;
      case 'agent-status':
        onAgentStatusRef.current?.(parsed);
        return;
      case 'agent-output':
        appendOutput(parsed);
        return;
      case 'agent-question':
        appendOutput({
          type: 'agent-output',
          cardId: parsed.cardId,
          text: parsed.question,
          stream: 'stdout',
          at: parsed.at,
        });
        return;
      case 'error':
        onErrorRef.current?.(parsed.message);
        return;
    }
  }, [appendOutput]);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;

    const scheduleReconnect = () => {
      if (disposed) return;
      if (reconnectRef.current !== null) return;
      reconnectRef.current = window.setTimeout(() => {
        reconnectRef.current = null;
        connect();
      }, RECONNECT_DELAY_MS);
    };

    const connect = () => {
      if (disposed) return;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.addEventListener('open', () => {
        if (disposed) return;
        setConnected(true);
        ws.send(JSON.stringify({ type: 'ping' }));
      });

      ws.addEventListener('close', () => {
        if (disposed) return;
        setConnected(false);
        scheduleReconnect();
      });

      ws.addEventListener('error', () => {
        if (disposed) return;
        setConnected(false);
      });

      ws.addEventListener('message', handleMessage);
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectRef.current !== null) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
    };
  }, [enabled, url, handleMessage]);

  const send = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error('Bridge is not connected.');
    }
    ws.send(JSON.stringify(payload));
  }, []);

  const startAgent = useCallback((params: StartAgentParams) => {
    send({
      type: 'start-agent',
      cardId: params.cardId,
      prompt: params.prompt,
      agentConfig: params.agentConfig,
      repoPath: params.repoPath,
    });
  }, [send]);

  const stopAgent = useCallback((cardId: string) => {
    send({ type: 'stop-agent', cardId });
  }, [send]);

  const sendFeedback = useCallback((cardId: string, message: string) => {
    send({ type: 'send-feedback', cardId, message });
  }, [send]);

  const approveAgent = useCallback((cardId: string, branch?: string) => {
    send({ type: 'approve-agent', cardId, branch });
  }, [send]);

  const rejectAgent = useCallback((cardId: string, reason?: string) => {
    send({ type: 'reject-agent', cardId, reason });
  }, [send]);

  const clearOutputs = useCallback((cardId: string) => {
    setOutputsByCard(prev => {
      if (!prev[cardId]) return prev;
      const next = { ...prev };
      delete next[cardId];
      return next;
    });
  }, []);

  return {
    connected,
    bridgeRepoPath,
    outputsByCard,
    startAgent,
    stopAgent,
    sendFeedback,
    approveAgent,
    rejectAgent,
    clearOutputs,
  };
}
