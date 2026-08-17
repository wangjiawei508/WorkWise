export type GitBranchRow = {
  name: string
  current: boolean
}

export type GitRepositoryRow = {
  root: string
  relativePath: string
}

export type GitBranchesResult =
  | {
      ok: true
      repositoryRoot: string
      repositories: GitRepositoryRow[]
      currentBranch: string | null
      branches: GitBranchRow[]
      dirtyCount: number
    }
  | {
      ok: false
      reason:
        | 'no_workspace'
        | 'not_git_repo'
        | 'git_unavailable'
        | 'invalid_branch'
        | 'branch_not_found'
        | 'operation_in_progress'
        | 'unresolved_conflicts'
        | 'branch_in_other_worktree'
        | 'would_overwrite_files'
        | 'error'
      message: string
      blockingPaths?: string[]
    }
