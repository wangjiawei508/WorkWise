import { describe, expect, it, vi } from 'vitest'
import { chooseEngineeringProjectId } from './engineering/engineering-project-navigation'
import { restoreSettingsReturnRoute } from './settings-return-navigation'

// Regression: ISSUE-004 — Settings Back always opened Code and discarded the active Engineering project.
// Found by /qa on 2026-09-04
// Report: .gstack/qa-reports/qa-report-workwise-candidate-2026-09-04.md
describe('settings return navigation regression', () => {
  it('returns directly to Engineering instead of opening Code', async () => {
    const actions = {
      setRoute: vi.fn(),
      openCode: vi.fn(async () => undefined),
      openWrite: vi.fn(async () => undefined),
      openClaw: vi.fn(),
      openSchedule: vi.fn()
    }

    await restoreSettingsReturnRoute('engineering', actions)

    expect(actions.setRoute).toHaveBeenCalledWith('engineering')
    expect(actions.openCode).not.toHaveBeenCalled()
  })

  it('retains the stored Engineering project when the workspace remounts', () => {
    const projects = [{ id: 'latest-project' }, { id: 'active-project' }]

    expect(chooseEngineeringProjectId('', projects, 'active-project')).toBe('active-project')
    expect(chooseEngineeringProjectId('latest-project', projects, 'active-project')).toBe('latest-project')
    expect(chooseEngineeringProjectId('', projects, 'missing-project')).toBe('latest-project')
  })
})
