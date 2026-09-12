import { describe, expect, it } from 'vitest'
import { isSurveyInstrumentFile, SURVEY_FILE_ACCEPT } from './survey-file-selection'

describe('survey conversation attachment routing', () => {
  it.each(['control.IN1', 'control.in2', 'level.GSI', 'south.dat', 'receiver.26o', 'data.rnx.gz', 'project.NET', 'network.json'])('routes %s to professional preflight', (name) => {
    expect(isSurveyInstrumentFile({ name })).toBe(true)
    expect(SURVEY_FILE_ACCEPT).toContain(name.slice(name.lastIndexOf('.')).toLowerCase())
  })
  it.each(['report.pdf', 'report.docx', 'notes.txt', 'monitoring.csv', 'monitoring.xlsx', 'photo.png'])('keeps %s on the standard attachment path', (name) => {
    expect(isSurveyInstrumentFile({ name })).toBe(false)
  })
})
