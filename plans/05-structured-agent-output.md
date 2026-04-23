# Plääni 05 — "Generate agent from description" strukturoidulla outputilla

## Tavoite

Lisää [agent-dialog.tsx](../src/components/agents/agent-dialog.tsx):iin "Generate with AI" -nappi, joka luo agentin konfiguraation (nimi, system prompt, suositellut työkalut, avatar-väri) pelkästä vapaatekstikuvauksesta.

## Nykytila

- Käyttäjä täyttää käsin: name, provider, model, system prompt, MCP servers, built-in tools.
- Valmiita templaattejä [agent-templates.ts](../src/lib/agent-templates.ts), mutta räätälöinti on käsityötä.

## Lopputila

1. Käyttäjä klikkaa "Generate agent with AI".
2. Dialog kysyy kuvauksen, esim. *"Agent that helps me plan weekly grocery shopping and suggests recipes"*.
3. Backend kutsuu LLM:ää `withStructuredOutput`illa → palauttaa tyyppivarman JSON-rakenteen.
4. Dialog täytetään esiin generoiduilla arvoilla — käyttäjä voi vielä editoida ennen tallennusta.

## Tekniset muutokset

### 1. Riippuvuudet
```
pnpm add @langchain/core @langchain/openai @langchain/anthropic zod
```
(Zod on todennäköisesti jo transitiivisesti — tarkista.)

### 2. Uusi endpoint

**`server/routes/agent-generator.ts`** (uusi) — rekisteröi [server/index.ts](../server/index.ts):ssä.

```ts
POST /api/agents/generate
Body: { description: string, providerId, model, apiKey }
Response: { name, systemPrompt, avatarColor, suggestedToolIds: string[], suggestedMcpPresetIds: string[] }
```

Implementaatio:
```ts
const AgentSchema = z.object({
  name: z.string().max(40),
  systemPrompt: z.string().min(50).max(4000),
  avatarColor: z.enum(['#3b82f6', '#ef4444', ...]),  // AVATAR_COLORS
  suggestedToolIds: z.array(z.string()),
  suggestedMcpPresetIds: z.array(z.string()),
})

const llm = new ChatOpenAI({ apiKey, model })
  .withStructuredOutput(AgentSchema)

const result = await llm.invoke(buildPrompt(description, availableTools, availableMcpPresets))
```

Prompt sisältää listan saatavilla olevista built-in tooleista ja MCP-preseteistä (katso [mcp-presets.ts](../server/mcp-presets.ts) ja [server/tools/index.ts](../server/tools/index.ts)).

### 3. Frontend

**`src/components/agents/agent-dialog.tsx`**
- Lisää "Generate with AI" -nappi formin yläreunaan.
- Avaa sub-dialog / textarea kuvaukselle.
- `POST /api/agents/generate` → täytä form-tilat generoiduilla arvoilla.
- Näytä "Generated ✨" -badge kenttien vieressä kunnes käyttäjä muokkaa.

### 4. Miksi LangChain eikä pelkkä AI SDK?

AI SDK:ssa on myös `generateObject` Zod-schemalla. Tämä plääni toimisi yhtä hyvin sillä — **LangChainia ei TÄYDY käyttää tähän**. Pidetään mukana vain jos muut pläänit tuovat LangChainin projektiin, muuten käytä AI SDK:ta.

**Päätös**: jos pläänejä 01/02/03 on toteutettu → LangChain. Muuten AI SDK `generateObject`.

## Testaus

- 10 kuvausta, tarkista että kaikki kentät täyttyvät järkevästi.
- Varmista Zod-validointi: malli ei voi palauttaa tuntematonta tool-ID:tä (käytä `z.enum(knownIds)`).

## Työmäärä-arvio

Pieni. Suurin osa on prompt-engineering ja UX.
