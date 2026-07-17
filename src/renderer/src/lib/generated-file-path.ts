export function resolveGeneratedFileWorkspaceRoot(
  fallback?: string
): string | undefined {
  return fallback?.trim() || undefined
}
