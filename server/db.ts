import initSqlJs, { type Database } from 'sql.js'
import fs from 'fs'
import path from 'path'
import os from 'os'

const DATA_DIR = path.join(os.homedir(), '.llm-chat')
const DB_PATH = path.join(DATA_DIR, 'data.db')
export const ATTACHMENTS_DIR = path.join(DATA_DIR, 'attachments')

let db: Database | null = null

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true })
}

function saveToDisk() {
  if (!db) return
  const data = db.export()
  fs.writeFileSync(DB_PATH, Buffer.from(data))
}

// Auto-save every 5 seconds if there are changes
let dirty = false
setInterval(() => {
  if (dirty) {
    saveToDisk()
    dirty = false
  }
}, 5000)

function markDirty() {
  dirty = true
}

const SCHEMA_VERSION = 1

const SCHEMA = `
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  model TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL DEFAULT '',
  avatar_color TEXT NOT NULL DEFAULT '#6366f1',
  mcp_server_ids TEXT NOT NULL DEFAULT '[]',
  built_in_tool_ids TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'New conversation',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL DEFAULT '',
  tool_calls TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('image', 'pdf')),
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  text_content TEXT,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  transport TEXT NOT NULL,
  command TEXT,
  args TEXT,
  env TEXT,
  url TEXT,
  preset_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_agent ON conversations(agent_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent_id);
`

export async function initDb(): Promise<Database> {
  if (db) return db

  ensureDirs()

  const SQL = await initSqlJs()

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  db.run('PRAGMA journal_mode = WAL')
  db.run('PRAGMA foreign_keys = ON')

  // Check schema version
  const versionResult = db.exec('PRAGMA user_version')
  const currentVersion = versionResult[0]?.values[0]?.[0] as number ?? 0

  if (currentVersion < SCHEMA_VERSION) {
    db.exec(SCHEMA)
    db.run(`PRAGMA user_version = ${SCHEMA_VERSION}`)
    saveToDisk()
  }

  console.log(`[db] SQLite initialized at ${DB_PATH} (version ${SCHEMA_VERSION})`)
  return db
}

export function getDb(): Database {
  if (!db) throw new Error('Database not initialized. Call initDb() first.')
  return db
}

// Helper: run INSERT/UPDATE/DELETE and auto-save
export function run(sql: string, params: Record<string, unknown> = {}) {
  const d = getDb()
  const stmt = d.prepare(sql)
  stmt.run(mapParams(params))
  stmt.free()
  markDirty()
}

// Helper: query rows
export function query<T = Record<string, unknown>>(sql: string, params: Record<string, unknown> = {}): T[] {
  const d = getDb()
  const stmt = d.prepare(sql)
  stmt.bind(mapParams(params))
  const rows: T[] = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T)
  }
  stmt.free()
  return rows
}

// Helper: query single row
export function queryOne<T = Record<string, unknown>>(sql: string, params: Record<string, unknown> = {}): T | null {
  const rows = query<T>(sql, params)
  return rows[0] ?? null
}

// sql.js uses $name for named params
function mapParams(params: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(params)) {
    const k = key.startsWith('$') ? key : `$${key}`
    mapped[k] = value ?? null
  }
  return mapped
}

export function closeDb() {
  if (db) {
    saveToDisk()
    db.close()
    db = null
  }
}

// Force save (e.g. before exit)
export function flush() {
  saveToDisk()
}
