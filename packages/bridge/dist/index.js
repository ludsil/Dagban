#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { DagbanBridgeServer } from './ws-server.js';
const DEFAULT_PORT = 9876;
function parsePort(raw) {
    if (!raw)
        return DEFAULT_PORT;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : DEFAULT_PORT;
}
const port = parsePort(process.env.DAGBAN_BRIDGE_PORT);
const repoPath = process.env.DAGBAN_REPO_PATH
    ? path.resolve(process.env.DAGBAN_REPO_PATH)
    : process.cwd();
const server = new DagbanBridgeServer({
    port,
    repoPath,
});
const shutdown = () => {
    server.close();
    process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
