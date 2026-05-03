# Plan 08 — Semantic History Trimming

## Goal

In long conversations (>50 messages), don't send entire history to LLM. Semantically fetch most relevant older messages to current question + always keep last N messages.

## Current State

Assumed (verify in [chat-store.ts](../src/stores/chat-store.ts)): all conversation messages sent on every request. 100-message conversation easily 20k+ tokens of just history.

## End State

Prompt building for each user message:
```
system + [relevant older messages, top-5 semantically] + [last 10 messages] + user message
```

Last N always retained (conversational coherence). Older by relevance.

## Prerequisites

**Plan 01** — vector infrastructure.

## Technical Changes

### 1. Indexing

When message is saved ([server/db-routes.ts](../server/db-routes.ts) `POST /api/db/messages`):
- Calculate embedding for message content.
- Save to `vectors` with `source_type='message'`, `source_id=messageId`, `metadata={conversationId, role}`.

Backfill: registration script for existing messages (opt-in button in UI, don't force).

### 2. Prompt Building

Location: where `messages` array built for `streamText` (likely [use-chat-stream.ts](../src/hooks/use-chat-stream.ts) and/or [server/index.ts](../server/index.ts)).

Logic:
```ts
const THRESHOLD = 20
const LAST_N = 10
const TOP_K_OLDER = 5

if (messages.length <= THRESHOLD) {
  // pass through
  return messages
}

const last = messages.slice(-LAST_N)
const older = messages.slice(0, -LAST_N)
const queryEmbedding = await embed(userMessage.content)
const relevantOlder = await searchVectors('message', queryEmbedding, TOP_K_OLDER, {
  conversationId,
  excludeIds: last.map(m => m.id),
})

// Restore chronological order for the model
const trimmed = [
  ...relevantOlder.sort((a, b) => a.createdAt - b.createdAt),
  { role: 'system', content: `[Note: ${older.length - relevantOlder.length} older messages omitted for brevity]` },
  ...last,
]
```

### 3. Käyttäjän kontrolli

- UI-toggle "Trim long conversations" per-agentti tai global.
- Debug-näkymä: kun trimmaus aktivoituu, näytä pikku-indikaattori chat-viewissa ("Older context: 5 messages retrieved").

### 4. Tool-call-ketjut

Varoitus: älä leikkaa kesken tool-call / tool-result -paria. Ryhmittele nämä pareiksi ennen leikkausta. Tarkista [types/index.ts](../src/types/index.ts):n message-rakenne.

## Edge caset

- Hyvin lyhyet viestit ("kyllä", "ok") → embedaa silti, mutta ne eivät luultavasti voita relevanssia.
- Multimodaalit (kuvat, PDF-attachments) — älä leikkaa viestejä joissa on attachment-metadataa, ne ovat yleensä tärkeitä.

## Testaus

- 100-viestinen synteettinen keskustelu, tarkista että coherence säilyy vaikka vanhoja viestejä leikataan.
- Mittaa token-säästö: ennen/jälkeen per pyyntö.

## Työmäärä-arvio

Keskisuuri. Tool-call-parittaminen on tarkin kohta.
