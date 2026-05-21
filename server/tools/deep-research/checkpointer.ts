import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import Database from 'better-sqlite3'
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite'

let saverInstance: SqliteSaver | undefined

/**
 * Return a process-wide singleton `SqliteSaver` used by the deep-research graph
 * for checkpoint persistence. The DB file lives in the user's app data dir
 * (`APP_DATA_DIR` if set, otherwise `~/.llm-chat/`) so it sits next to the
 * main SQLite DB and is NOT inside the dev project root — otherwise Vite would
 * treat the WAL/SHM writes as source changes and trigger a full page reload.
 */
export function getResearchCheckpointer(): SqliteSaver {
  if (saverInstance) return saverInstance

  const baseDir = process.env.APP_DATA_DIR || path.join(os.homedir(), '.llm-chat')
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
