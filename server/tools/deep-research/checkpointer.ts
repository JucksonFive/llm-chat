import path from 'node:path'
import fs from 'node:fs'
import Database from 'better-sqlite3'
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite'

let saverInstance: SqliteSaver | undefined

/**
 * Return a process-wide singleton `SqliteSaver` used by the deep-research graph
 * for checkpoint persistence. The DB file lives next to the app's main SQLite
 * DB (under `process.env.APP_DATA_DIR` if set, else cwd) so it's included in
 * any backup that already covers user data.
 */
export function getResearchCheckpointer(): SqliteSaver {
  if (saverInstance) return saverInstance

  const baseDir = process.env.APP_DATA_DIR || process.cwd()
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true })
  }
  const dbPath = path.join(baseDir, 'deep-research-checkpoints.sqlite')
  const db = new Database(dbPath)
  // WAL mode keeps writes from blocking concurrent runs.
  db.pragma('journal_mode = WAL')
  saverInstance = new SqliteSaver(db)
  return saverInstance
}
