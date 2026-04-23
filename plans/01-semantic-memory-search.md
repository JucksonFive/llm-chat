# Plääni 01 — Semanttinen muistihaku (RAG muisteille)

## Tavoite

Korvaa [memory-store.ts](../src/stores/memory-store.ts) `getMemoryPrompt`-funktion "liitä kaikki muistit promptiin" -logiikka semanttisella haulla: noudetaan vain top-K relevantteinta muistia käyttäjän viimeisimmän viestin perusteella.

## Nykytila

- `MAX_SHORT_TERM = 10` kovakoodattu raja.
- `getMemoryPrompt(agentId)` liittää KAIKKI agentin long- ja short-muistit jokaiseen promptiin.
- Skaalautuu huonosti: 200 muistia × jokainen viesti = iso prompt ja korkea kustannus.

## Lopputila

- Kun prompt rakennetaan, kutsutaan `getRelevantMemories(agentId, userMessage, k=5)`.
- Muistit tallennetaan edelleen `memories`-tauluun, mutta niille lasketaan embedding ja tallennetaan `vectors`-tauluun.
- `addMemory` / `updateMemory` / `deleteMemory` synkronoivat vektorit automaattisesti.

## Tekniset muutokset

### 1. Riippuvuudet
```
pnpm add @langchain/core @langchain/openai @langchain/community sqlite-vec
```

### 2. Yhteinen RAG-infra (luodaan tässä pläänissä)

**`server/rag/embeddings.ts`**
- Exportoi `getEmbeddings(apiKey: string)` → palauttaa `OpenAIEmbeddings`-instanssin (`text-embedding-3-small`, 1536 dim).
- Cachea instanssit API-keyn mukaan.

**`server/rag/vector-store.ts`**
- `upsertVector(id, sourceType, sourceId, agentId, content, embedding, metadata)`
- `searchVectors(agentId, queryEmbedding, k, filter?)` → top-K cosine-similarityllä
- `deleteVector(id)` / `deleteBySource(sourceType, sourceId)`
- Toteutus: `sqlite-vec` laajennus sql.js:n päälle **tai** jos se ei onnistu sql.js:n kanssa, käytä in-memory cosine-laskua (muistimäärät ovat pieniä, riittää hyvin).

**`server/rag/chunker.ts`** (vain liitäntä — käytetään pläänissä 02)
- Wrapper `RecursiveCharacterTextSplitter`ille.

### 3. DB-skeema
Lisää [server/db.ts](../server/db.ts):
```sql
CREATE TABLE IF NOT EXISTS vectors (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,     -- 'memory' | 'document' | 'message'
  source_id TEXT NOT NULL,
  agent_id TEXT,
  content TEXT NOT NULL,
  embedding BLOB NOT NULL,       -- Float32Array bytes
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vectors_source ON vectors(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_vectors_agent ON vectors(agent_id);
```
Bumppaa `SCHEMA_VERSION` → 7.

### 4. REST-endpointit
Lisää [server/db-routes.ts](../server/db-routes.ts):
- `POST /api/rag/memories/search` — body `{ agentId, query, k, apiKey }` → `{ memories: Memory[] }`
- `POST /api/rag/memories/reindex` — body `{ agentId, apiKey }` → rakentaa vektorit uudestaan (migraatiolle).

### 5. Backfill existing memoryille
Kun käyttäjä avaa sovelluksen ensimmäisen kerran uuden version jälkeen:
- Jos `memories.length > 0` ja `vectors where source_type='memory'` on tyhjä → aja reindex.
- Näytä progress-toast.

### 6. Frontend-muutokset

**`src/stores/memory-store.ts`**
- Lisää `getRelevantMemories(agentId, query, k): Promise<Memory[]>` joka kutsuu `/api/rag/memories/search`.
- `addMemory` / `updateMemory` / `deleteMemory`: ei muutoksia rajapintaan — server hoitaa vektorin ylläpidon `POST /api/db/memories` -endpointissa.

**Prompt-rakennus** (etsi missä `getMemoryPrompt` kutsutaan, todennäköisesti [chat-store.ts](../src/stores/chat-store.ts) tai [use-chat-stream.ts](../src/hooks/use-chat-stream.ts)):
- Korvaa `getMemoryPrompt(agentId)` → `await getMemoryPromptRelevant(agentId, lastUserMessage, k=5)`.
- Fallback: jos query tyhjä tai API-avainta ei ole, pudottaudu vanhaan käytökseen (kaikki muistit).

### 7. Server-side muistit-routen muokkaus
[server/db-routes.ts](../server/db-routes.ts): `POST /api/db/memories` ja `PUT /api/db/memories/:id`:
- Laske embedding ja kirjoita `vectors`-tauluun saman transaktion yhteydessä.
- `DELETE` poistaa myös vektorin.

## Avoimet kysymykset

- **Kumpi embeddinggeneraattori**: vaatia käyttäjän OpenAI-avain? Vai antaa vaihtoehtona local (Ollama `nomic-embed-text`)? → MVP OpenAI, lisää Ollama myöhemmin ilmaisena vaihtoehtona.
- **Short-term vs long-term**: edelleen merkityksellinen erottelu? Ehdotus: short-term liitetään ALWAYS (rullaava ikkuna), long-term haetaan semanttisesti.

## Testaus

- Yksikkö: `vector-store.ts` cosine-similarity, upsert/search/delete.
- Integraatio: lisää 50 muistia, tee query, tarkista että top-K on relevanttia.
- Manuaalinen: katso että prompt-koko pienenee DevToolsin verkkotabissa.

## Työmäärä-arvio

~2 kokonaisuutta: infra (`rag/*` + DB-skeema + reindex) + memory-wire. Toteutus yhdellä istunnolla kun infra on paikoillaan.
