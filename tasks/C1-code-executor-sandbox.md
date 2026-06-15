# C1 — Sandbox Shell Execution in Code Executor

**Severity:** Critical  
**CVSS:** 8.8 (AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H)  
**Status:** Open  
**File:** `server/tools/code-executor.ts`  

## Problem

The `executeProcess` function passes arbitrary code directly to `bash -c` (or `python3 -c`):

```ts
// code-executor.ts:82-94
function executeProcess(language: 'python' | 'shell', code: string, timeout: number) {
  const cmd = language === 'python' ? 'python3' : 'bash'
  const args = ['-c', code]
  execFile(cmd, args, { timeout, maxBuffer: 1024 * 1024 }, ...)
}
```

The tool is classified as `destructive` with `approvalRequired`, but the approval dialog relies on the user reading the generated command. A prompt-injected model or social engineering can trick the user into approving malicious commands.

## Acceptance criteria

- [ ] Shell commands execute inside a container/namespace (Docker, `bubblewrap`, `firejail`, or macOS `sandbox-exec`)
- [ ] OR: a command allowlist restricts execution to a safe subset (`ls`, `cat`, `grep`, `find`, `head`, `tail`, `wc`, `sort`, `uniq`, `echo`, `pwd`, `date`, `which`)
- [ ] The exact command is shown verbatim (not summarized) in the approval prompt with a bold warning: _"This command will run with your user privileges. Review it carefully."_
- [ ] All executed commands and their exit codes are written to an audit log (`~/.llm-chat/audit.log`)
- [ ] Tests: `server/tools/calculator.test.ts` passes; new tests verify command allowlist and audit logging

## Implementation notes

- The `executeJavaScript` path (`vm.createContext`) is already sandboxed — no changes needed there
- Consider making the allowlist configurable via env var `CODE_EXECUTOR_ALLOWED_COMMANDS`
- `firejail` is available on most Linux distros; for macOS, `sandbox-exec` profiles are an option
- If containerization is infeasible, at minimum enforce the allowlist and log everything
