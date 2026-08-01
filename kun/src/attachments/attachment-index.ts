import Database from 'better-sqlite3'
import type { AttachmentSectionV1 } from '../contracts/attachments.js'
import { ATTACHMENT_LIMITS_V2, AttachmentSectionV1 as AttachmentSectionSchema } from '../contracts/attachments.js'

export type AttachmentSearchResult = AttachmentSectionV1 & { score: number }

export class AttachmentIndex {
  private readonly db: Database.Database
  private readonly ftsAvailable: boolean

  constructor(databasePath: string) {
    this.db = new Database(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS attachment_sections (
        id TEXT PRIMARY KEY,
        attachment_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        text TEXT NOT NULL,
        token_estimate INTEGER NOT NULL,
        provenance_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(attachment_id, ordinal)
      );
      CREATE INDEX IF NOT EXISTS attachment_sections_attachment
        ON attachment_sections(attachment_id, ordinal);
    `)
    this.ftsAvailable = this.initializeFts()
  }

  replace(attachmentId: string, sections: AttachmentSectionV1[]): void {
    const parsed = sections.map((section) => AttachmentSectionSchema.parse(section))
    const transaction = this.db.transaction(() => {
      this.db.prepare('DELETE FROM attachment_sections WHERE attachment_id = ?').run(attachmentId)
      if (this.ftsAvailable) this.db.prepare('DELETE FROM attachment_sections_fts WHERE attachment_id = ?').run(attachmentId)
      const insert = this.db.prepare(`INSERT INTO attachment_sections
        (id, attachment_id, ordinal, text, token_estimate, provenance_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
      const insertFts = this.ftsAvailable
        ? this.db.prepare('INSERT INTO attachment_sections_fts(id, attachment_id, text) VALUES (?, ?, ?)')
        : undefined
      for (const section of parsed) {
        insert.run(section.id, section.attachmentId, section.ordinal, section.text,
          section.tokenEstimate, JSON.stringify(section.provenance), section.createdAt)
        insertFts?.run(section.id, section.attachmentId, section.text)
      }
    })
    transaction()
  }

  append(attachmentId: string, sections: AttachmentSectionV1[]): void {
    const existing = this.list(attachmentId, 0, 1)
    if (!existing.length) return this.replace(attachmentId, sections)
    const parsed = sections.map((section) => AttachmentSectionSchema.parse(section))
    const transaction = this.db.transaction(() => {
      const insert = this.db.prepare(`INSERT INTO attachment_sections
        (id, attachment_id, ordinal, text, token_estimate, provenance_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      const insertFts = this.ftsAvailable ? this.db.prepare('INSERT INTO attachment_sections_fts(id, attachment_id, text) VALUES (?, ?, ?)') : undefined
      for (const section of parsed) { insert.run(section.id, section.attachmentId, section.ordinal, section.text, section.tokenEstimate, JSON.stringify(section.provenance), section.createdAt); insertFts?.run(section.id, section.attachmentId, section.text) }
    }); transaction()
  }

  list(attachmentId: string, offset = 0, limit: number = ATTACHMENT_LIMITS_V2.maxSearchResults): AttachmentSectionV1[] {
    const boundedLimit = Math.max(1, Math.min(limit, ATTACHMENT_LIMITS_V2.maxSearchResults))
    return this.db.prepare(`SELECT * FROM attachment_sections WHERE attachment_id = ?
      ORDER BY ordinal LIMIT ? OFFSET ?`).all(attachmentId, boundedLimit, Math.max(0, offset)).map(rowToSection)
  }

  read(attachmentId: string, sectionId: string): AttachmentSectionV1 | null {
    const row = this.db.prepare('SELECT * FROM attachment_sections WHERE attachment_id = ? AND id = ?')
      .get(attachmentId, sectionId)
    return row ? rowToSection(row) : null
  }

  search(attachmentId: string, query: string, limit = 8): AttachmentSearchResult[] {
    const normalized = query.trim().slice(0, 500)
    if (!normalized) return []
    const boundedLimit = Math.max(1, Math.min(limit, ATTACHMENT_LIMITS_V2.maxSearchResults))
    if (this.ftsAvailable) {
      try {
        const rows = this.db.prepare(`SELECT s.*, bm25(attachment_sections_fts) AS rank
          FROM attachment_sections_fts f JOIN attachment_sections s ON s.id = f.id
          WHERE f.attachment_id = ? AND attachment_sections_fts MATCH ?
          ORDER BY rank LIMIT ?`).all(attachmentId, quoteFtsQuery(normalized), boundedLimit)
        const matches = rows.map((row) => ({ ...rowToSection(row), score: -Number((row as { rank?: number }).rank ?? 0) }))
        if (matches.length > 0) return matches
        // unicode61 does not segment continuous CJK text reliably. A valid
        // zero-result FTS query must still use the bounded lexical fallback.
      } catch {
        // Invalid FTS syntax must degrade to the bounded lexical path.
      }
    }
    const terms = lexicalTerms(normalized)
    const lexicalWindow = ATTACHMENT_LIMITS_V2.maxSearchResults * 8
    const lexicalSections = this.db.prepare(`SELECT * FROM attachment_sections WHERE attachment_id = ?
      ORDER BY ordinal LIMIT ?`).all(attachmentId, lexicalWindow).map(rowToSection)
    return lexicalSections
      .map((section) => {
        const text = section.text.toLocaleLowerCase()
        const compactText = text.replace(/\s+/gu, '')
        return {
          ...section,
          score: terms.reduce((score, term) => {
            const direct = occurrences(text, term)
            const compactTerm = term.replace(/\s+/gu, '')
            return score + direct + (compactTerm === term ? occurrences(compactText, compactTerm) : 0)
          }, 0)
        }
      })
      .filter((section) => section.score > 0)
      .sort((left, right) => right.score - left.score || left.ordinal - right.ordinal)
      .slice(0, boundedLimit)
  }

  remove(attachmentId: string): void {
    const transaction = this.db.transaction(() => {
      this.db.prepare('DELETE FROM attachment_sections WHERE attachment_id = ?').run(attachmentId)
      if (this.ftsAvailable) this.db.prepare('DELETE FROM attachment_sections_fts WHERE attachment_id = ?').run(attachmentId)
    })
    transaction()
  }

  close(): void { this.db.close() }

  private initializeFts(): boolean {
    try {
      this.db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS attachment_sections_fts USING fts5(
        id UNINDEXED, attachment_id UNINDEXED, text, tokenize='unicode61'
      )`)
      return true
    } catch {
      return false
    }
  }
}

function lexicalTerms(value: string): string[] {
  const normalized = value.toLocaleLowerCase()
  const whitespaceTerms = normalized.split(/\s+/u).filter(Boolean)
  const cjkTerms = whitespaceTerms.flatMap((term) =>
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(term) && term.length > 2
      ? [term, ...Array.from({ length: term.length - 1 }, (_, index) => term.slice(index, index + 2))]
      : [term]
  )
  return [...new Set(cjkTerms)].slice(0, 24)
}

function rowToSection(value: unknown): AttachmentSectionV1 {
  const row = value as Record<string, unknown>
  return AttachmentSectionSchema.parse({
    id: row.id, attachmentId: row.attachment_id, ordinal: row.ordinal, text: row.text,
    tokenEstimate: row.token_estimate, provenance: JSON.parse(String(row.provenance_json)), createdAt: row.created_at
  })
}

function quoteFtsQuery(query: string): string {
  return query.split(/\s+/u).filter(Boolean).slice(0, 16)
    .map((term) => `"${term.replaceAll('"', '""')}"`).join(' OR ')
}

function occurrences(text: string, term: string): number {
  let count = 0
  let cursor = 0
  while (term && (cursor = text.indexOf(term, cursor)) >= 0) { count += 1; cursor += term.length }
  return count
}
