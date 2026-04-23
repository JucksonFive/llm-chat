# Plääni 02 — Document RAG -työkalu (PDF + tiedostot)

## Tavoite

Lisää uusi built-in-työkalu `search_document`, jolla LLM voi kysyä semanttisesti isojen dokumenttien sisällöstä sen sijaan että koko tiedosto tungetaan promptiin.

## Nykytila

- [pdf-reader.ts](../server/tools/pdf-reader.ts): lukee koko PDF:n, katkaisee 200k merkkiin → iso prompt, ei toimi 500-sivuisella raportilla.
- [file-reader.ts](../server/tools/file-reader.ts): vastaava ongelma tekstitiedostoille.

## Lopputila

Kaksi työkalua:
1. **`index_document(path)`** — lataa, paloittelee, embedaa, tallentaa. Palauttaa `documentId`.
2. **`search_document(documentId, query, k=5)`** — palauttaa top-K relevantteinta chunkkia.

LLM:n workflow: käyttäjä mainitsee PDF:n → LLM kutsuu `index_document` kerran → sitten useita `search_document`-kutsuja kysymysten mukaan.

Bonus: [pdf-reader.ts](../server/tools/pdf-reader.ts) ja [file-reader.ts](../server/tools/file-reader.ts) säilyvät pienten tiedostojen pikalukuun.

## Edellytys

**Plääni 01** toteutettu → `server/rag/*` infra käytettävissä.

## Tekniset muutokset

### 1. Riippuvuudet (jo osittain plääni 01:stä)
```
pnpm add @langchain/community   # PDFLoader, TextLoader
```

### 2. Uudet tiedostot

**`server/tools/document-indexer.ts`** (uusi)
- `indexDocumentTool`:
  - Input: `{ path: string }`
  - Lataa: `.pdf` → `PDFLoader`, muu → `TextLoader`.
  - Paloittele: `RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 150 })`.
  - Embed: käytä `server/rag/embeddings.ts`.
  - Tallenna: `server/rag/vector-store.ts#upsertVector` metadatalla `{ path, chunkIndex, page? }`.
  - Palauta: `{ documentId, chunks: number, path }`.
- Deduppaus: jos sama `path` jo indeksoitu ja tiedosto ei ole muuttunut (mtime tarkistus) → palauta olemassa oleva `documentId`.

**`server/tools/document-search.ts`** (uusi)
- `searchDocumentTool`:
  - Input: `{ documentId: string, query: string, k?: number }`
  - Embed query → `searchVectors` suodattimella `metadata.documentId == documentId`.
  - Palauta `{ chunks: [{ content, page?, score }] }`.

### 3. Rekisteröinti

[server/tools/index.ts](../server/tools/index.ts): lisää molemmat `BuiltInToolId`-listaan ja `getBuiltInTools`-mappiin.

### 4. DB-skeema

Lisää [server/db.ts](../server/db.ts):
```sql
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  mtime INTEGER NOT NULL,
  chunk_count INTEGER NOT NULL,
  indexed_at INTEGER NOT NULL
);
```
`source_type='document'` ja `source_id=documentId` käytetään `vectors`-taulussa.

### 5. UI
[src/components/settings/](../src/components/settings/) tai built-in-tools settings: lisää molemmat työkalut listaan.

Vapaaehtoinen: "Indexed documents" -näkymä jossa voi nähdä ja poistaa indeksoituja dokumentteja.

### 6. System prompt -vihje

[server/index.ts](../server/index.ts) tool guidelines -osioon:
> "For large documents (PDFs over 20 pages or text files over 50k chars), use `index_document` first, then `search_document` with specific queries instead of reading the whole file."

## Edge caset

- Sama tiedosto muuttunut: poista vanhat chunkit (`deleteBySource('document', oldDocumentId)`), re-indeksoi.
- Iso PDF (>100MB): raja ja selkeä virheilmoitus.
- Binääri/korruptoitu PDF: kiinni nappaa `PDFLoader` virhe, palauta käyttäjäystävällinen viesti.

## Testaus

- Indeksoi 300-sivuinen PDF, tee 5 eri kysymystä, tarkista että oikeat sivut löytyvät.
- Mittaa: prompt-koko ennen (`read_pdf`) vs jälkeen (`search_document`) — odotus: 100k+ → <5k tokeneita.

## Työmäärä-arvio

Pieni, jos plääni 01 on valmis. Pääosa on loader-integraatio ja työkalumääritelmä.
