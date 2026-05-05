# Plan 06 — LangSmith Tracing & Observability

## Goal

Automatic observability for all LLM calls: prompts, tokens, latencies, tool calls, costs. Speeds up debugging especially in multi-step tool loops ([server/index.ts](../server/index.ts) `stepCountIs(20)`).

## Current State

- `console.log` in [server/index.ts](../server/index.ts) for chunk counts.
- No visibility: what exactly was sent to LLM, what was tool-call input/output, how long each step took.

## End State

LangSmith dashboard showing:
- Each `/api/chat` call's trace tree (system prompt, messages, tool calls, responses).
- Per-step latencies and tokens.
- Costs per provider.
- Search traces by trace-id, user, errors.

## Two Implementation Approaches

### Approach A — LangSmith without LangChain (OpenTelemetry)

Vercel AI SDK supports OTel tracing. LangSmith accepts OTel spans.

**Dependencies**
```
pnpm add @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http langsmith
```

**Changes**

**`server/telemetry.ts`** (new)
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

**`server/index.ts`** in `streamText` call:
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

### Approach B — LangChain Callback Handler

Used only if using `ChatOpenAI`/`ChatAnthropic` instances (plans 03, 04, 05).
- Set `LANGCHAIN_TRACING_V2=true` + `LANGCHAIN_API_KEY` → automatic.

## Recommendation

**Use both**: approach A for AI SDK streams, approach B for LangChain parts. Trace IDs merge.

## Configuration

Add to `.env.example`:
```
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=ls_...
LANGSMITH_PROJECT=llm-chat
```

UI toggle "Enable tracing" in [src/components/settings/](../src/components/settings/). Defaults to **OFF** (privacy: prompts sent to LangSmith cloud).

## Privacy Note

- User prompts and responses sent to LangSmith servers → **opt-in only**.
- Electron production: show warning when toggle activated ("Prompts will be sent to LangSmith cloud for observability").
- Alternative: self-host LangSmith (Docker, paid).

## Testing

- Create chat session, open LangSmith UI, verify trace shows completely.
- Trigger error (wrong API key) → trace shows red.

## Effort Estimate

Small if familiar with Node OTel instrumentation. Estimate: 2–4h.

