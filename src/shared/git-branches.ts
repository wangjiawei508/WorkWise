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
      reason: 'no_workspace' | 'not_git_repo' | 'git_unavailable' | 'error'
      message: string
    }
