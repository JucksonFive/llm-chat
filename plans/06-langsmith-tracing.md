# Plääni 06 — LangSmith tracing & observability

## Tavoite

Automaattinen havainnointi kaikille LLM-kutsuille: promptit, tokenit, latenssit, työkalukutsut, kustannukset. Nopeuttaa debuggausta erityisesti multi-step tool-silmukoissa ([server/index.ts](../server/index.ts) `stepCountIs(20)`).

## Nykytila

- `console.log` [server/index.ts](../server/index.ts):ssä chunk-määrille.
- Ei näkyvyyttä: mitä täsmälleen lähetettiin LLM:lle, mikä oli tool-callin input/output, kauanko mikin kesti.

## Lopputila

LangSmith-dashboard josta näkee:
- Jokaisen `/api/chat` -kutsun trace-puu (system prompt, messages, tool calls, responses).
- Per-step latenssit ja tokenit.
- Kustannukset per provider.
- Haku trace-id:llä, käyttäjällä, virheillä.

## Kaksi toteutustapaa

### Tapa A — LangSmith ilman LangChainia (OpenTelemetry)

Vercel AI SDK tukee OTel-tracingia. LangSmith ottaa OTel-spänit vastaan.

**Riippuvuudet**
```
pnpm add @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http langsmith
```

**Muutokset**

**`server/telemetry.ts`** (uusi)
```ts
import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'

if (process.env.LANGSMITH_TRACING === 'true') {
  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({
      url: 'https://api.smith.langchain.com/otel/v1/traces',
      headers: { 'x-api-key': process.env.LANGSMITH_API_KEY! },
    }),
  })
  sdk.start()
}
```

**`server/index.ts`** `streamText`-kutsu:
```ts
const result = streamText({
  ...,
  experimental_telemetry: {
    isEnabled: true,
    functionId: 'chat',
    metadata: { providerId, model, conversationId: req.body.conversationId },
  },
})
```

### Tapa B — LangChain callback handler

Käytössä vain jos käytetään `ChatOpenAI`/`ChatAnthropic`-instansseja (pläänit 03, 04, 05).
- Aseta `LANGCHAIN_TRACING_V2=true` + `LANGCHAIN_API_KEY` → automaattisesti.

## Suositus

**Käytä molempia**: tapa A AI SDK:n virtaa varten, tapa B LangChain-osille. Trace-ID:t yhdistyvät.

## Konfigurointi

Lisää `.env.example`:
```
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=ls_...
LANGSMITH_PROJECT=llm-chat
```

UI-toggle "Enable tracing" [src/components/settings/](../src/components/settings/). Oletuksena **pois päältä** (privacy: promptit lähtevät LangSmithin pilveen).

## Privacy-huomio

- Käyttäjän promptit ja vastaukset lähtevät LangSmithin palvelimille → on **opt-in**.
- Electron-tuotannossa: näytä varoitus kun toggle aktivoidaan ("Prompts will be sent to LangSmith cloud for observability").
- Vaihtoehto: self-host LangSmith (Docker, maksullinen).

## Testaus

- Tee chat-sessio, avaa LangSmith UI, tarkista että trace näkyy kokonaisena.
- Aiheuta virhe (väärä API-avain) → trace näkyy punaisena.

## Työmäärä-arvio

Pieni kun osaa Node OTel-instrumentoinnin. Oletus: 2–4h.
