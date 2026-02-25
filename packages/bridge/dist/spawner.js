import { spawn } from 'node:child_process';
function createSessionId(cardId) {
    return `${cardId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
function shellQuote(value) {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}
function trimDetail(value) {
    return value.trim().slice(0, 3000);
}
function toModelArgs(type, model) {
    if (!model)
        return [];
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
export class AgentSpawner {
    reportStatus;
    reportOutput;
    running = new Map();
    constructor(reportStatus, reportOutput) {
        this.reportStatus = reportStatus;
        this.reportOutput = reportOutput;
    }
    isRunning(cardId) {
        return this.running.has(cardId);
    }
    getRuntime(cardId) {
        return this.running.get(cardId)?.runtime ?? null;
    }
    start(args) {
        if (this.running.has(args.cardId)) {
            throw new Error(`Agent already running for card ${args.cardId}`);
        }
        const sessionId = createSessionId(args.cardId);
        const runtime = {
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
            }
            else {
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
    async stop(cardId) {
        const running = this.running.get(cardId);
        if (!running)
            return;
        running.stopRequested = true;
        running.child.kill('SIGTERM');
        await new Promise(resolve => {
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
    sendFeedback(cardId, message) {
        const running = this.running.get(cardId);
        if (!running) {
            throw new Error(`No running agent for card ${cardId}`);
        }
        if (!running.child.stdin.writable) {
            throw new Error(`Agent stdin is not writable for card ${cardId}`);
        }
        running.child.stdin.write(`${message.trim()}\n`);
    }
    spawnAgentProcess(config, prompt, worktreePath) {
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
