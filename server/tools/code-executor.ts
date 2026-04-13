import { tool, jsonSchema } from 'ai'
import vm from 'node:vm'
import { execFile } from 'node:child_process'

export const codeExecutorTool = tool({
  description: 'Execute code snippets. Supports JavaScript (sandboxed), Python, and shell commands. Returns stdout, stderr, and exit code.',
  parameters: jsonSchema({
    type: 'object',
    properties: {
      language: {
        type: 'string',
        enum: ['javascript', 'python', 'shell'],
        description: 'Programming language to execute',
      },
      code: { type: 'string', description: 'The code to execute' },
    },
    required: ['language', 'code'],
  }),
  execute: async ({ language, code }: { language: 'javascript' | 'python' | 'shell'; code: string }) => {
    const TIMEOUT_MS = 5000

    try {
      if (language === 'javascript') {
        return executeJavaScript(code, TIMEOUT_MS)
      } else {
        return executeProcess(language, code, TIMEOUT_MS)
      }
    } catch (err) {
      return {
        stdout: '',
        stderr: err instanceof Error ? err.message : 'Execution failed',
        exitCode: 1,
      }
    }
  },
})

function executeJavaScript(code: string, timeout: number) {
  const logs: string[] = []
  const errors: string[] = []

  const sandbox = {
    console: {
      log: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
      error: (...args: unknown[]) => errors.push(args.map(String).join(' ')),
      warn: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
      info: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
    },
    Math,
    JSON,
    Date,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Map,
    Set,
    RegExp,
    Error,
    Promise,
  }

  const context = vm.createContext(sandbox)

  try {
    const result = vm.runInContext(code, context, { timeout })
    if (result !== undefined) {
      logs.push(typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result))
    }
    return { stdout: logs.join('\n'), stderr: errors.join('\n'), exitCode: 0 }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { stdout: logs.join('\n'), stderr: message, exitCode: 1 }
  }
}

function executeProcess(language: 'python' | 'shell', code: string, timeout: number): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const cmd = language === 'python' ? 'python3' : 'bash'
  const args = ['-c', code]

  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout || '',
        stderr: stderr || '',
        exitCode: error ? 1 : 0,
      })
    })
  })
}
