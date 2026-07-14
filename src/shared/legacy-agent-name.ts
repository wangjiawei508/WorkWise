/** Read-only aliases accepted while importing phone automation settings. */
export function isLegacyDefaultPhoneAgentName(value: string): boolean {
  return value === 'kun' || value === 'workgpt'
}
