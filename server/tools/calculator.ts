import { tool, jsonSchema } from 'ai'
import { evaluate } from 'mathjs'

export const calculatorTool = tool({
  description: 'Evaluate a mathematical expression using mathjs. Supports arithmetic, algebra, units, matrices, and more. Examples: "2^10", "sqrt(144)", "12.7 cm to inch", "det([1,2;3,4])".',
  inputSchema: jsonSchema<{ expression: string }>({
    type: 'object',
    properties: {
      expression: { type: 'string', description: 'The mathematical expression to evaluate' },
    },
    required: ['expression'],
  }),
  execute: async ({ expression }) => {
    try {
      const result = evaluate(expression)
      return {
        expression,
        result: typeof result === 'object' ? JSON.stringify(result) : String(result),
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to evaluate expression' }
    }
  },
})
