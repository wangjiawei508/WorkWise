export const WRITE_INFOGRAPHIC_MAX_TEXT_CHARS = 6_000

export type WriteInfographicRequest = {
  /** Selected document text the infographic should summarize. */
  text: string
  /** Absolute path of the markdown document that will embed the image. */
  filePath: string
  /** Active write workspace root; the image is saved to its img/ folder. */
  workspaceRoot: string
}

export type WriteInfographicResult =
  | {
      ok: true
      /** Path relative to the document directory, ready for a markdown image link. */
      relativePath: string
      absolutePath: string
      fileName: string
    }
  | {
      ok: false
      message: string
    }
