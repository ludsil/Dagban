import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
const execFileAsync = promisify(execFile);
function slug(value) {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 72);
}
async function runGit(args, cwd) {
    const { stdout } = await execFileAsync('git', args, { cwd });
    return stdout.trim();
}
export class WorktreeManager {
    async resolveRepoRoot(repoPath) {
        const root = await runGit(['rev-parse', '--show-toplevel'], repoPath);
        if (!root) {
            throw new Error(`Could not resolve git repository for path: ${repoPath}`);
        }
        return root;
    }
    async prepare(cardId, repoPath) {
        const repoRoot = await this.resolveRepoRoot(repoPath);
        const branch = `dagban/${slug(cardId) || cardId}`;
        const worktreeBase = path.join(repoRoot, '.dagban', 'worktrees');
        const worktreePath = path.join(worktreeBase, slug(cardId) || cardId);
        await mkdir(worktreeBase, { recursive: true });
        await this.ensureWorktree(repoRoot, worktreePath, branch);
        return {
            repoRoot,
            worktreePath,
            branch,
        };
    }
    async mergeBranch(repoPath, branch) {
        const repoRoot = await this.resolveRepoRoot(repoPath);
        await runGit(['merge', '--no-ff', '--no-edit', branch], repoRoot);
    }
    async removeWorktree(repoPath, worktreePath) {
        const repoRoot = await this.resolveRepoRoot(repoPath);
        await runGit(['worktree', 'remove', '--force', worktreePath], repoRoot);
    }
    async ensureWorktree(repoRoot, worktreePath, branch) {
        const listed = await runGit(['worktree', 'list', '--porcelain'], repoRoot);
        if (listed.includes(`worktree ${worktreePath}`)) {
            return;
        }
        if (existsSync(worktreePath)) {
            await rm(worktreePath, { recursive: true, force: true });
        }
        await runGit(['worktree', 'add', '-B', branch, worktreePath], repoRoot);
    }
}
