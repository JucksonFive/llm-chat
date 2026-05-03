# Plan 10 — Evaluation Framework for Agents and Tools

## Objective

Automated regression testing: when adding a new agent template or modifying a tool, run a dataset and ensure quality hasn't degraded. Uses LangSmith datasets + LLM-as-judge.

## Current State

- Agent definitions [agent-templates.ts](../src/lib/agent-templates.ts) and tools [server/tools/](../server/tools/) — changes are tested only manually by chatting.
- No metric for "does quality degrade" when, for example, the system prompt is modified.

## End State

`pnpm eval` runs:
1. Dataset from LangSmith (or local JSON).
2. Each row = `{input, expectedOutputShape, expectedToolCalls?}`.
3. Run agent/tool → collect output.
4. LLM-as-judge evaluates: *"Does the output answer the question correctly and factually?"* → score 0–1.
5. Rule-based checks: was the required tool called? Is output JSON valid?
6. Report: regression per test + aggregate.

CI integration: run in PR, fail if average drops >5%.

## Prerequisite

- **Plan 06** — LangSmith in use (log in, API key).

## Technical Changes

### 1. Dependencies
```
pnpm add -D langsmith @langchain/openai
```

### 2. Folder Structure

```
eval/
  datasets/
    agent-behavior.json       # 20–50 test questions per agent type
    tool-accuracy.json        # per-tool (web-search, calculator, ...)
  runners/
    run-agent-eval.ts
    run-tool-eval.ts
  judges/
    llm-judge.ts              # criteria and rubric
  index.ts                    # pnpm eval entry point
```

### 3. Dataset Format

```jsonc
{
  "name": "agent-behavior",
  "items": [
    {
      "input": "What is the capital of Finland?",
      "agentTemplateId": "general-assistant",
      "expected": {
        "mustMention": ["Helsinki"],
        "mustNotMention": [],
        "shouldUseTool": null
      }
    },
    {
      "input": "What's 847 * 293?",
      "agentTemplateId": "general-assistant",
      "expected": {
        "mustMention": ["248171"],
        "shouldUseTool": "calculator"
      }
    }
  ]
}
```

### 4. Judge

```ts
// eval/judges/llm-judge.ts
export async function judge(input: string, output: string, expected: Expected): Promise<{
  score: number           // 0..1
  reasoning: string
  passed: boolean
}> {
  const llm = new ChatAnthropic({ model: 'claude-haiku-4-5' })
    .withStructuredOutput(z.object({
      correctness: z.number().min(0).max(1),
      groundedness: z.number().min(0).max(1),
      reasoning: z.string(),
    }))
  // prompt with rubric
  return ...
}
```

### 5. Runner

```ts
// eval/runners/run-agent-eval.ts
for (const item of dataset.items) {
  const response = await runAgent(item.agentTemplateId, item.input)
  const judgement = await judge(item.input, response.text, item.expected)
  const toolsCalled = response.toolCalls.map(t => t.name)
  const toolCheck = item.expected.shouldUseTool
    ? toolsCalled.includes(item.expected.shouldUseTool)
    : true
  results.push({ ...item, judgement, toolCheck, passed: judgement.passed && toolCheck })
}
```

### 6. LangSmith Integration

Upload datasets to LangSmith:
```ts
import { Client } from 'langsmith'
const client = new Client()
await client.createDataset('agent-behavior', { items: [...] })
```

Run `Client#evaluate` which logs to LangSmith as visible trends.

### 7. CI

**`.github/workflows/eval.yml`** (if using GitHub Actions):
```yaml
on: pull_request
jobs:
  eval:
    steps:
      - pnpm install
      - pnpm eval
    env:
      LANGSMITH_API_KEY: ${{ secrets.LANGSMITH_API_KEY }}
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

Fail build if `avg_score < baseline - 0.05`.

### 8. Cost

Each eval run = N × (agent-LLM + judge-LLM). 50 rows × 2 calls × cheapest model = a few cents per run. Document so no one is surprised.

## Testing

- Verify that a known-broken prompt (e.g., remove system prompt) FAILS the dataset.
- Only if deterministic failures are found is the dataset valuable.

## Effort Estimate

Medium–large. Most work is writing the dataset (50 quality questions per agent type). This is an ongoing investment.

## When It Makes Sense

**Not immediately** — implement only when:
- Agent count grows (>5 templates).
- Users provide feedback on quality regressions.
- Plans 01–03 are implemented → they have many places where quality can silently degrade.
