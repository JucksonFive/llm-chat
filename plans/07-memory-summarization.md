# Plääni 07 — Automaattinen muistien tiivistys

## Tavoite

Kun agentin long-term-muistit ylittävät rajan (esim. 100 kpl tai 50k merkkiä), vanhimmat tiivistetään LLM:llä yhdeksi "summary"-muistiksi. Pitää muistin hyödyllisenä rajattomasti ilman että prompt paisuu.

## Nykytila

- [memory-store.ts](../src/stores/memory-store.ts): long-term-muisteille ei ole ylärajaa.
- `getMemoryPrompt` liittää kaikki promptiin (pläänin 01 jälkeen vain relevantit top-K, mutta tallennusmäärä kasvaa silti rajatta).

## Lopputila

Background-job (cron tai triggeri addMemoryn jälkeen):
1. Laskee agentin long-term-muistien määrän.
2. Jos > 100: ottaa 20 vanhinta.
3. Lähettää LLM:lle prompt: *"Summarize these memories into 1–3 concise key facts, preserving important details"*.
4. Luo uuden `type='summary'`-muistin (tai tag-metadatalla).
5. Poistaa alkuperäiset 20.

## Edellytys

- **Plääni 01** — jotta relevanssihaku toimii myös tiivistelmien kanssa.
- Suositus: **Plääni 06** — jotta tiivistyksen laatua voi seurata.

## Tekniset muutokset

### 1. DB-skeema
Laajenna [server/db.ts](../server/db.ts) `memories`-taulun `type` CHECK-lauseketta:
```sql
type TEXT NOT NULL DEFAULT 'long' CHECK(type IN ('short', 'long', 'summary'))
```
Bumppaa `SCHEMA_VERSION`.

### 2. Uusi moduli

**`server/memory/summarizer.ts`**
```ts
async function summarizeMemories(
  memories: Memory[],
  apiKey: string,
): Promise<string[]>   // 1–3 summary-stringiä
```

Käyttää `ChatOpenAI`ta + `withStructuredOutput(z.object({ summaries: z.array(z.string()).max(3) }))`.

Prompt:
```
You are compressing a user's long-term memory. The following {N} memories were recorded
over time. Merge them into 1–3 concise statements that preserve:
- Key facts about the user
- Preferences
- Specific details (names, dates, numbers)
Drop redundancy. Each summary should be standalone and useful out of context.

Memories:
- {content1}
- {content2}
...
```

### 3. Trigger

**Vaihtoehto A — eager (heti lisäyksen jälkeen)**
[server/db-routes.ts](../server/db-routes.ts): `POST /api/db/memories` -käsittelijä → jos `count > threshold`, kutsu `summarizeMemories` async (älä blokkaa responsea).

**Vaihtoehto B — cron** (suositus)
`server/memory/maintenance.ts`: `setInterval(runMaintenance, 1h)`. Käy läpi agentit, tiivistää ylivuotavat.

**Vaihtoehto C — manuaalinen nappi**
UI:ssa "Compress memories"-nappi agent-settingsissä. Helpoin aloitus.

**Suositus**: aloita C:stä, lisää B myöhemmin.

### 4. UI

[src/components/memory/](../src/components/memory/): merkitse summary-muistit erottuvasti (kuvake, "auto-summarized N memories on 23.4.2026" tooltip). Säilytä edit/delete.

### 5. Vektori-synkronointi

Kun 20 muistia poistetaan ja 1–3 summary-muistia luodaan → vektorit päivittyvät automaattisesti `POST /api/db/memories`-reitin kautta (plääni 01).

## Edge caset

- LLM-kutsu epäonnistuu: älä poista alkuperäisiä muisteja. Yritä uudestaan seuraavalla maintenance-kierroksella.
- Käyttäjä editoi summary-muistia → ok, se on nyt "manual".
- Threshold-tuning: aloita 100, seuraa LangSmithistä miten tiivistys onnistuu.

## Testaus

- Luo 150 muistia, triggeröi maintenance, tarkista että lopputila on järkevä.
- Semanttinen haku summaryille: varmista että tiivistetty tieto löytyy edelleen queryillä (plääni 01).

## Työmäärä-arvio

Pieni–keskisuuri kun plääni 01 on valmis.
