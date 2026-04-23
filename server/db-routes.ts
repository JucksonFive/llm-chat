import type { Express } from 'express'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { run, query, queryOne, ATTACHMENTS_DIR } from './db.js'
import { deleteBySource } from './rag/vector-store.js'

export function registerDbRoutes(app: Express) {

// ─── Agents ────────────────────────────────────────────

app.get('/api/db/agents', (_req, res) => {
  const agents = query('SELECT * FROM agents ORDER BY created_at ASC')
  // API keys are never stored server-side anymore — they live only in the
  // browser (see src/stores/api-key-store.ts). The `api_key_encrypted` column
  // is kept for schema compatibility but always written as ''.
  const result = agents.map((a: Record<string, unknown>) => ({
    ...a,
    api_key_encrypted: undefined,
    providerId: a.provider_id,
    systemPrompt: a.system_prompt,
    avatarColor: a.avatar_color,
    mcpServerIds: JSON.parse(a.mcp_server_ids as string),
    builtInToolIds: JSON.parse(a.built_in_tool_ids as string),
    createdAt: a.created_at,
  }))
  res.json(result)
})

app.post('/api/db/agents', (req, res) => {
  const { name, providerId, model, systemPrompt, avatarColor, mcpServerIds, builtInToolIds } = req.body
  const id = crypto.randomUUID()
  run(
    `INSERT INTO agents (id, name, provider_id, model, api_key_encrypted, system_prompt, avatar_color, mcp_server_ids, built_in_tool_ids, created_at)
     VALUES ($id, $name, $providerId, $model, '', $systemPrompt, $avatarColor, $mcpServerIds, $builtInToolIds, $createdAt)`,
    {
      id,
      name,
      providerId,
      model,
      systemPrompt: systemPrompt || '',
      avatarColor: avatarColor || '#6366f1',
      mcpServerIds: JSON.stringify(mcpServerIds || []),
      builtInToolIds: JSON.stringify(builtInToolIds || []),
      createdAt: Date.now(),
    },
  )
  res.json({ id })
})

app.put('/api/db/agents/:id', (req, res) => {
  const { name, providerId, model, systemPrompt, avatarColor, mcpServerIds, builtInToolIds } = req.body
  run(
    `UPDATE agents SET name=$name, provider_id=$providerId, model=$model, api_key_encrypted='',
     system_prompt=$systemPrompt, avatar_color=$avatarColor, mcp_server_ids=$mcpServerIds, built_in_tool_ids=$builtInToolIds
     WHERE id=$id`,
    {
      id: req.params.id,
      name,
      providerId,
      model,
      systemPrompt: systemPrompt || '',
      avatarColor: avatarColor || '#6366f1',
      mcpServerIds: JSON.stringify(mcpServerIds || []),
      builtInToolIds: JSON.stringify(builtInToolIds || []),
    },
  )
  res.json({ ok: true })
})

app.delete('/api/db/agents/:id', (req, res) => {
  run('DELETE FROM agents WHERE id=$id', { id: req.params.id })
  res.json({ ok: true })
})

// ─── Projects ─────────────────────────────────────────

app.get('/api/db/projects', (_req, res) => {
  const rows = query('SELECT * FROM projects ORDER BY updated_at DESC')
  const result = rows.map((p: Record<string, unknown>) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }))
  res.json(result)
})

app.post('/api/db/projects', (req, res) => {
  const { name, description } = req.body
  const id = crypto.randomUUID()
  const now = Date.now()
  run(
    'INSERT INTO projects (id, name, description, created_at, updated_at) VALUES ($id, $name, $description, $now, $now)',
    { id, name, description: description || '', now },
  )
  res.json({ id })
})

app.put('/api/db/projects/:id', (req, res) => {
  const { name, description } = req.body
  run('UPDATE projects SET name=$name, description=$description, updated_at=$now WHERE id=$id', {
    id: req.params.id,
    name,
    description: description || '',
    now: Date.now(),
  })
  res.json({ ok: true })
})

app.delete('/api/db/projects/:id', (req, res) => {
  run('DELETE FROM projects WHERE id=$id', { id: req.params.id })
  res.json({ ok: true })
})

// ─── Conversations ─────────────────────────────────────

app.get('/api/db/conversations', (req, res) => {
  const agentId = req.query.agentId as string | undefined
  const rows = agentId
    ? query('SELECT * FROM conversations WHERE agent_id=$agentId ORDER BY updated_at DESC', { agentId })
    : query('SELECT * FROM conversations ORDER BY updated_at DESC')
  const result = rows.map((c: Record<string, unknown>) => ({
    ...c,
    agentId: c.agent_id,
    projectId: c.project_id || null,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  }))
  res.json(result)
})

app.post('/api/db/conversations', (req, res) => {
  const { agentId, title, projectId } = req.body
  const id = crypto.randomUUID()
  const now = Date.now()
  run(
    'INSERT INTO conversations (id, agent_id, project_id, title, created_at, updated_at) VALUES ($id, $agentId, $projectId, $title, $now, $now)',
    { id, agentId, projectId: projectId || null, title: title || 'New conversation', now },
  )
  res.json({ id })
})

app.put('/api/db/conversations/:id', (req, res) => {
  const { title, projectId } = req.body
  if (projectId !== undefined) {
    run('UPDATE conversations SET title=$title, project_id=$projectId, updated_at=$now WHERE id=$id', {
      id: req.params.id,
      title,
      projectId: projectId || null,
      now: Date.now(),
    })
  } else {
    run('UPDATE conversations SET title=$title, updated_at=$now WHERE id=$id', {
      id: req.params.id,
      title,
      now: Date.now(),
    })
  }
  res.json({ ok: true })
})

app.delete('/api/db/conversations/:id', (req, res) => {
  // Delete attachment files from disk
  const attachments = query<{ file_path: string }>(
    `SELECT a.file_path FROM attachments a
     JOIN messages m ON a.message_id = m.id
     WHERE m.conversation_id = $convId`,
    { convId: req.params.id },
  )
  for (const att of attachments) {
    try { fs.unlinkSync(att.file_path) } catch { /* ignore */ }
  }
  run('DELETE FROM conversations WHERE id=$id', { id: req.params.id })
  res.json({ ok: true })
})

// ─── Messages ──────────────────────────────────────────

app.get('/api/db/conversations/:id/messages', (req, res) => {
  const messages = query(
    'SELECT * FROM messages WHERE conversation_id=$convId ORDER BY created_at ASC',
    { convId: req.params.id },
  )

  const msgIds = messages.map((m: Record<string, unknown>) => m.id as string)

  // sql.js doesn't support IN with named params well, use positional
  // Actually let's query per-message for correctness
  const attachmentsByMsg = new Map<string, Record<string, unknown>[]>()
  if (msgIds.length > 0) {
    for (const msgId of msgIds) {
      const atts = query('SELECT * FROM attachments WHERE message_id=$msgId', { msgId })
      if (atts.length > 0) attachmentsByMsg.set(msgId, atts)
    }
  }

  const result = messages.map((m: Record<string, unknown>) => {
    const atts = attachmentsByMsg.get(m.id as string) || []
    return {
      id: m.id,
      role: m.role,
      content: m.content,
      reasoning: m.reasoning || undefined,
      createdAt: m.created_at,
      toolCalls: m.tool_calls ? JSON.parse(m.tool_calls as string) : undefined,
      attachments: atts.length > 0
        ? atts.map((a: Record<string, unknown>) => ({
            id: a.id,
            type: a.type,
            name: a.name,
            filePath: a.file_path,
            textContent: a.text_content,
          }))
        : undefined,
    }
  })
  res.json(result)
})

app.post('/api/db/conversations/:id/messages', (req, res) => {
  const { role, content, reasoning, toolCalls, attachments } = req.body
  const msgId = crypto.randomUUID()
  run(
    `INSERT INTO messages (id, conversation_id, role, content, reasoning, tool_calls, created_at)
     VALUES ($id, $convId, $role, $content, $reasoning, $toolCalls, $createdAt)`,
    {
      id: msgId,
      convId: req.params.id,
      role,
      content: content || '',
      reasoning: reasoning || null,
      toolCalls: toolCalls ? JSON.stringify(toolCalls) : null,
      createdAt: Date.now(),
    },
  )

  // Update conversation timestamp and title
  if (role === 'user' && content) {
    const conv = queryOne<{ title: string }>('SELECT title FROM conversations WHERE id=$id', { id: req.params.id })
    if (conv?.title === 'New conversation') {
      const title = content.slice(0, 50) + (content.length > 50 ? '...' : '')
      run('UPDATE conversations SET title=$title, updated_at=$now WHERE id=$id', {
        id: req.params.id, title, now: Date.now(),
      })
    } else {
      run('UPDATE conversations SET updated_at=$now WHERE id=$id', { id: req.params.id, now: Date.now() })
    }
  } else {
    run('UPDATE conversations SET updated_at=$now WHERE id=$id', { id: req.params.id, now: Date.now() })
  }

  // Save attachments
  if (attachments?.length) {
    for (const att of attachments) {
      const attId = crypto.randomUUID()
      const ext = att.type === 'image'
        ? (att.name.split('.').pop() || 'png')
        : 'pdf'
      const filePath = path.join(ATTACHMENTS_DIR, `${attId}.${ext}`)

      // Write base64 data to file
      if (att.dataUrl) {
        const base64 = att.dataUrl.split(',')[1]
        fs.writeFileSync(filePath, Buffer.from(base64, 'base64'))
      }

      run(
        `INSERT INTO attachments (id, message_id, type, name, file_path, text_content)
         VALUES ($id, $msgId, $type, $name, $filePath, $textContent)`,
        {
          id: attId,
          msgId,
          type: att.type,
          name: att.name,
          filePath,
          textContent: att.textContent || null,
        },
      )
    }
  }

  res.json({ id: msgId })
})

// ─── Attachments ───────────────────────────────────────

app.get('/api/db/attachments/:id/file', (req, res) => {
  const att = queryOne<{ file_path: string; type: string; name: string }>(
    'SELECT file_path, type, name FROM attachments WHERE id=$id',
    { id: req.params.id },
  )
  if (!att || !fs.existsSync(att.file_path)) {
    res.status(404).json({ error: 'Attachment not found' })
    return
  }
  res.sendFile(att.file_path)
})

// ─── Memories ──────────────────────────────────────────

app.get('/api/db/memories', (req, res) => {
  const agentId = req.query.agentId as string | undefined
  const rows = agentId
    ? query('SELECT * FROM memories WHERE agent_id=$agentId ORDER BY created_at ASC', { agentId })
    : query('SELECT * FROM memories ORDER BY created_at ASC')
  const result = rows.map((m: Record<string, unknown>) => ({
    id: m.id,
    agentId: m.agent_id,
    content: m.content,
    type: m.type || 'long',
    createdAt: m.created_at,
  }))
  res.json(result)
})

app.post('/api/db/memories', (req, res) => {
  const { agentId, content, type } = req.body
  const id = crypto.randomUUID()
  run(
    'INSERT INTO memories (id, agent_id, content, type, created_at) VALUES ($id, $agentId, $content, $type, $createdAt)',
    { id, agentId, content, type: type || 'long', createdAt: Date.now() },
  )
  res.json({ id })
})

app.put('/api/db/memories/:id', (req, res) => {
  const { content } = req.body
  run('UPDATE memories SET content=$content WHERE id=$id', { id: req.params.id, content })
  // Invalidate any cached embedding — it will be regenerated lazily on next
  // semantic search using the new content.
  deleteBySource('memory', req.params.id)
  res.json({ ok: true })
})

app.delete('/api/db/memories/:id', (req, res) => {
  run('DELETE FROM memories WHERE id=$id', { id: req.params.id })
  deleteBySource('memory', req.params.id)
  res.json({ ok: true })
})

// ─── MCP Servers ───────────────────────────────────────

app.get('/api/db/mcp-servers', (_req, res) => {
  const rows = query('SELECT * FROM mcp_servers ORDER BY created_at ASC')
  const result = rows.map((s: Record<string, unknown>) => ({
    id: s.id,
    name: s.name,
    transport: s.transport,
    command: s.command,
    args: s.args ? JSON.parse(s.args as string) : undefined,
    env: s.env ? JSON.parse(s.env as string) : undefined,
    url: s.url,
    presetId: s.preset_id,
    createdAt: s.created_at,
  }))
  res.json(result)
})

app.post('/api/db/mcp-servers', (req, res) => {
  const { name, transport, command, args, env, url, presetId } = req.body
  const id = crypto.randomUUID()
  run(
    `INSERT INTO mcp_servers (id, name, transport, command, args, env, url, preset_id, created_at)
     VALUES ($id, $name, $transport, $command, $args, $env, $url, $presetId, $createdAt)`,
    {
      id, name, transport,
      command: command || null,
      args: args ? JSON.stringify(args) : null,
      env: env ? JSON.stringify(env) : null,
      url: url || null,
      presetId: presetId || null,
      createdAt: Date.now(),
    },
  )
  res.json({ id })
})

app.put('/api/db/mcp-servers/:id', (req, res) => {
  const { name, transport, command, args, env, url, presetId } = req.body
  run(
    `UPDATE mcp_servers SET name=$name, transport=$transport, command=$command,
     args=$args, env=$env, url=$url, preset_id=$presetId WHERE id=$id`,
    {
      id: req.params.id, name, transport,
      command: command || null,
      args: args ? JSON.stringify(args) : null,
      env: env ? JSON.stringify(env) : null,
      url: url || null,
      presetId: presetId || null,
    },
  )
  res.json({ ok: true })
})

app.delete('/api/db/mcp-servers/:id', (req, res) => {
  run('DELETE FROM mcp_servers WHERE id=$id', { id: req.params.id })
  res.json({ ok: true })
})

} // end registerDbRoutes
