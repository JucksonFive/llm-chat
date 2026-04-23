# Plääni 10 — Evaluointikehikko agenteille ja työkaluille

## Tavoite

Automatisoitu regressiotestaus: kun lisätään uusi agenttitemplate tai muokataan työkalua, ajetaan datasetti ja varmistetaan ettei laatu huonontunut. Käyttää LangSmith datasets + LLM-as-judge.

## Nykytila

- Agenttimääritykset [agent-templates.ts](../src/lib/agent-templates.ts) ja työkalut [server/tools/](../server/tools/) — muutoksia testataan vain manuaalisesti chattaamalla.
- Ei mittaria "huononiko laatu" kun esim. system promptia muokataan.

## Lopputila

`pnpm eval` ajaa:
1. Dataset LangSmithistä (tai paikallinen JSON).
2. Jokainen rivi = `{input, expectedOutputShape, expectedToolCalls?}`.
3. Aja agentti/työkalu → kerää output.
4. LLM-as-judge arvioi: *"Does the output answer the question correctly and factually?"* → skoori 0–1.
5. Rule-based checks: vaadittu työkalu kutsuttu? Output JSON valid?
6. Raportti: regressio per testi + aggregaatti.

CI-integraatio: aja PR:ssä, falttaa jos keskiarvo laskee >5%.

## Edellytys

- **Plääni 06** — LangSmith käytössä (kirjaudu sisään, API-key).

## Tekniset muutokset

### 1. Riippuvuudet
```
pnpm add -D langsmith @langchain/openai
```

### 2. Kansiorakenne

```
eval/
  datasets/
    agent-behavior.json       # 20–50 testikysymystä per agenttityyppi
    tool-accuracy.json        # työkalukohtaiset (web-search, calculator, ...)
  runners/
    run-agent-eval.ts
    run-tool-eval.ts
  judges/
    llm-judge.ts              # kriteerit ja rubric
  index.ts                    # pnpm eval entry point
```

### 3. Dataset-formaatti

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

### 6. LangSmith-integraatio

Upload datasets LangSmithiin:
```ts
import { Client } from 'langsmith'
const client = new Client()
await client.createDataset('agent-behavior', { items: [...] })
```

Aja `Client#evaluate` joka kirjaa LangSmithiin näkyviin trendeinä.

### 7. CI

**`.github/workflows/eval.yml`** (jos GitHub Actions käytössä):
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

Failaa build jos `avg_score < baseline - 0.05`.

### 8. Kustannus

Jokainen eval-ajo = N × (agentti-LLM + judge-LLM). 50 riviä × 2 kutsua × halvin malli = muutama sentti per ajo. Dokumentoi, ettei kukaan yllättyisi.

## Testaus

- Varmista että tunnetusti rikkinäinen prompt (esim. poista system prompt) FAILAA datasetin.
- Vain silloin kun deterministisiä vikoja löytyy, datasetti on arvokas.

## Työmäärä-arvio

Keskisuuri–suuri. Pääosa on datasetin kirjoittaminen (50 laadukasta kysymystä eri agenteille). Tämä on jatkuva investointi.

## Milloin kannattaa

**Ei heti** — toteuta vasta kun:
- Agenttimäärä kasvaa (>5 templatea).
- Käyttäjät antavat palautetta laaturegressioista.
- Pläänit 01–03 on toteutettu → niissä on monta paikkaa jossa laatu voi huonontua hiljaa.
