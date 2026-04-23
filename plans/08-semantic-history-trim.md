# Plääni 08 — Keskusteluhistorian semanttinen leikkaus

## Tavoite

Pitkissä keskusteluissa (>50 viestiä) älä lähetä koko historiaa LLM:lle. Hae semanttisesti relevanteimmat aiemmat viestit nykyisen kysymyksen kontekstiin + pidä viimeiset N viestiä aina mukana.

## Nykytila

Oletettu (pitää varmistaa [chat-store.ts](../src/stores/chat-store.ts):sta): kaikki conversation-messages lähetetään jokaisella pyynnöllä. 100 viestin keskustelussa tämä on helposti 20k+ tokenia pelkkää historiaa.

## Lopputila

Prompt-rakennus jokaiselle käyttäjän viestille:
```
system + [relevant older messages, top-5 semanttisesti] + [last 10 messages] + user message
```

Viimeiset N säilyvät aina (conversational coherence). Vanhempi relevanssilla.

## Edellytys

**Plääni 01** — vektori-infra.

## Tekniset muutokset

### 1. Indeksointi

Kun viesti tallennetaan ([server/db-routes.ts](../server/db-routes.ts) `POST /api/db/messages`):
- Laske embedding viestin sisällölle.
- Tallenna `vectors`-tauluun `source_type='message'`, `source_id=messageId`, `metadata={conversationId, role}`.

Backfill: rekisterointi-skripti olemassa oleville viesteille (opt-in nappi UI:ssa, jotta ei pakoteta kaikkia).

### 2. Prompt-rakennus

Paikka: missä `streamText`ille rakennetaan `messages`-array (todennäköisesti [use-chat-stream.ts](../src/hooks/use-chat-stream.ts) ja/tai [server/index.ts](../server/index.ts)).

Logiikka:
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
