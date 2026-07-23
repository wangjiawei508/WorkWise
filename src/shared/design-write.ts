export type DesignWriteAssetPayload = {
  workspaceRoot: string
  currentFilePath: string
  fileName: string
  dataBase64: string
}

export type DesignWriteAssetResult =
  | {
      ok: true
      path: string
      markdownPath: string
      createdAt: string
    }
  | {
      ok: false
      message: string
    }
