import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);

function slug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

export interface WorktreeInfo {
  repoRoot: string;
  worktreePath: string;
  branch: string;
}

async function runGit(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd });
  return stdout.trim();
}

export class WorktreeManager {
  async resolveRepoRoot(repoPath: string): Promise<string> {
    const root = await runGit(['rev-parse', '--show-toplevel'], repoPath);
    if (!root) {
      throw new Error(`Could not resolve git repository for path: ${repoPath}`);
    }
    return root;
  }

  async prepare(cardId: string, repoPath: string): Promise<WorktreeInfo> {
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

  async mergeBranch(repoPath: string, branch: string): Promise<void> {
    const repoRoot = await this.resolveRepoRoot(repoPath);
    await runGit(['merge', '--no-ff', '--no-edit', branch], repoRoot);
  }

  async removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
    const repoRoot = await this.resolveRepoRoot(repoPath);
    await runGit(['worktree', 'remove', '--force', worktreePath], repoRoot);
  }

  private async ensureWorktree(repoRoot: string, worktreePath: string, branch: string): Promise<void> {
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
