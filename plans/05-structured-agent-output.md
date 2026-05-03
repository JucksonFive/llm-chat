# Plan 05 — "Generate Agent from Description" with Structured Output

## Goal

Add a "Generate with AI" button to [agent-dialog.tsx](../src/components/agents/agent-dialog.tsx) that creates agent configuration (name, system prompt, recommended tools, avatar color) from plain text description alone.

## Current State

- User manually fills: name, provider, model, system prompt, MCP servers, built-in tools.
- Ready-made templates in [agent-templates.ts](../src/lib/agent-templates.ts), but customization is manual work.

## End State

1. User clicks "Generate agent with AI".
2. Dialog asks for description, e.g. *"Agent that helps me plan weekly grocery shopping and suggests recipes"*.
3. Backend calls LLM with `withStructuredOutput` → returns type-safe JSON structure.
4. Dialog populated with generated values — user can still edit before saving.

## Technical Changes

### 1. Dependencies
```
pnpm add @langchain/core @langchain/openai @langchain/anthropic zod
```
(Zod likely already transitive — check.)

### 2. New Endpoint

**`server/routes/agent-generator.ts`** (new) — register in [server/index.ts](../server/index.ts).

```ts
POST /api/agents/generate
Body: { description: string, providerId, model, apiKey }
Response: { name, systemPrompt, avatarColor, suggestedToolIds: string[], suggestedMcpPresetIds: string[] }
```

Implementation:
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

Prompt includes list of available built-in tools and MCP presets (see [mcp-presets.ts](../server/mcp-presets.ts) and [server/tools/index.ts](../server/tools/index.ts)).

### 3. Frontend

**`src/components/agents/agent-dialog.tsx`**
- Add "Generate with AI" button at top of form.
- Opens sub-dialog / textarea for description.
- `POST /api/agents/generate` → populate form states with generated values.
- Show "Generated ✨" badge next to fields until user edits.

### 4. Why LangChain vs Just AI SDK?

AI SDK also has `generateObject` with Zod schema. This plan would work equally well — **LangChain is NOT required**. Keep it only if other plans bring LangChain to the project, otherwise use AI SDK.

**Decision**: if plans 01/02/03 implemented → LangChain. Otherwise use AI SDK `generateObject`.

## Testing

- 10 descriptions, verify all fields populated sensibly.
- Ensure Zod validation: model can't return unknown tool-ID (use `z.enum(knownIds)`).

## Effort Estimate

Small. Mostly prompt engineering and UX.

