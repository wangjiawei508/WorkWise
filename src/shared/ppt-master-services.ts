export type PptMasterDeliverableVerifyRequest = {
  workspaceRoot: string
  projectDir: string
}

export type PptMasterDeliverableVerifyResult = {
  ok: boolean
  projectDir: string
  verifiedAt: string
  file?: {
    path: string
    size: number
    modifiedAt: string
  }
  slideCount?: number
  notesCount?: number
  expectedSlides?: number
  expectedNotes?: number
  issues: string[]
}

export type PptMasterPythonEnvStatus = {
  exists: boolean
  pythonPath: string
  venvRoot: string
  requirementsPath: string
}

export type PptMasterPythonEnvEnsureResult = {
  ok: boolean
  pythonPath: string
  message: string
}

export type PptMasterPythonEnvProgress = {
  phase: 'venv' | 'install' | 'done' | 'error'
  message: string
}
