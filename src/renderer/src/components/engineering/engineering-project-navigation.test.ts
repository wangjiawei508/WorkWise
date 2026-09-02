import { describe, expect, it } from 'vitest'
import {
  activeEngineeringProjectId,
  consumeRequestedEngineeringProject,
  requestEngineeringProjectOpen,
  setActiveEngineeringProject
} from './engineering-project-navigation'

function memoryStorage(): {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
} {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  }
}

describe('engineering project navigation', () => {
  it('hands a selected project to the Engineering workspace and retains its active selection', () => {
    const storage = memoryStorage()

    requestEngineeringProjectOpen(' project-42 ', storage)

    expect(consumeRequestedEngineeringProject(storage)).toBe('project-42')
    expect(activeEngineeringProjectId(storage)).toBe('project-42')
    expect(consumeRequestedEngineeringProject(storage)).toBe('')
  })

  it('does not retain an empty selection', () => {
    const storage = memoryStorage()

    setActiveEngineeringProject('project-42', storage)
    setActiveEngineeringProject(' ', storage)

    expect(activeEngineeringProjectId(storage)).toBe('')
  })
})
