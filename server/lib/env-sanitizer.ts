/**
 * Environment variable sanitization for sandbox child processes.
 *
 * The child process environment must never contain API keys, AWS
 * credentials, SSH agent sockets, or other secrets accessible to the
 * parent process. This module builds a safe environment containing
 * only the minimum variables needed for basic OS and toolchain function.
 */

// ---------------------------------------------------------------------------
// Sensitive env var name patterns (case-insensitive)
// ---------------------------------------------------------------------------

const SENSITIVE_KEY_PATTERNS: RegExp[] = [
  /^.*API[_-]?KEY$/i,
  /^.*SECRET$/i,
  /^.*TOKEN$/i,
  /^.*PASSWORD$/i,
  /^.*PASSWD$/i,
  /^.*CREDENTIALS?$/i,
  /^.*AUTH$/i,
  /^.*SESSION$/i,
  /^AWS_/i,
  /^AZURE_/i,
  /^GCLOUD_/i,
  /^GOOGLE_APPLICATION_CREDENTIALS$/i,
  /^GITHUB_TOKEN$/i,
  /^GITLAB_TOKEN$/i,
  /^NPM_TOKEN$/i,
  /^DOCKER_/i,
  /^SSH_/i,
  /^GPG_/i,
  /^LLM_CHAT_MASTER_PASSWORD$/i,
  /^ELECTRON_IPC_SECRET$/i,
  /^APP_DATA_DIR$/i,
  /^AUDIT_LOG_/i,
  /^CSP_HEADER$/i,
  /^ALLOWED_ORIGINS$/i,
  /^NODE_ENV$/i,
  /^COOKIE$/i,
  /^CERT/i,
  /^KEY$/i,
]

// ---------------------------------------------------------------------------
// Safe env vars — explicitly allowed
// ---------------------------------------------------------------------------

const ALLOWED_KEY_PATTERNS: RegExp[] = [
  /^PATH$/i,
  /^HOME$/i,
  /^USER$/i,
  /^USERNAME$/i,
  /^LOGNAME$/i,
  /^SHELL$/i,
  /^TERM$/i,
  /^LANG$/i,
  /^LC_/i,
  /^TZ$/i,
  /^SYSTEMROOT$/i,
  /^SYSTEMDRIVE$/i,
  /^WINDIR$/i,
  /^TEMP$/i,
  /^TMP$/i,
  /^TMPDIR$/i,
  /^USERPROFILE$/i,
  /^WSLENV$/i,
  /^WSL_DISTRO_NAME$/i,
  /^DISPLAY$/i,
  /^WAYLAND_/i,
  /^XDG_/i,
  /^DBUS_/i,
  /^COLORTERM$/i,
  /^NO_COLOR$/i,
  /^PNPM_HOME$/i,
  /^NVM_DIR$/i,
  /^RUSTUP_HOME$/i,
  /^CARGO_HOME$/i,
  /^JAVA_HOME$/i,
  /^GOPATH$/i,
  /^GOROOT$/i,
  /^PYTHON/i,
  /^PIP_/i,
  /^NODE_OPTIONS$/i,
]

// ---------------------------------------------------------------------------
// Default safe values — set when the parent env var is missing or stripped
// ---------------------------------------------------------------------------

const DEFAULT_ENV: Record<string, string | undefined> = {
  LANG: 'en_US.UTF-8',
  LC_ALL: 'en_US.UTF-8',
}

/**
 * Determine if an environment variable name should be stripped.
 * Returns true if the key should be REMOVED from the child process env.
 */
export function isSensitiveEnvKey(key: string): boolean {
  for (const pattern of ALLOWED_KEY_PATTERNS) {
    if (pattern.test(key)) return false
  }
  for (const pattern of SENSITIVE_KEY_PATTERNS) {
    if (pattern.test(key)) return true
  }
  // Unknown keys: strip by default (conservative)
  return true
}

/**
 * Build a safe environment for a child process by stripping secrets.
 *
 * @param parentEnv - The parent process environment (process.env)
 * @param extra - Additional env vars to pass through (e.g., tool-specific paths)
 * @returns A sanitized env object safe for child processes
 */
export function buildSafeEnv(
  parentEnv: Record<string, string | undefined> = process.env,
  extra: Record<string, string> = {},
): Record<string, string> {
  const safe: Record<string, string> = {}

  // Start with default safe values
  for (const [key, value] of Object.entries(DEFAULT_ENV)) {
    if (value !== undefined) {
      safe[key] = value
    }
  }

  // Copy allowed vars from parent
  for (const [key, value] of Object.entries(parentEnv)) {
    if (value === undefined || value === '') continue
    if (isSensitiveEnvKey(key)) continue
    safe[key] = value
  }

  // Apply explicit extras (allowlist overrides)
  for (const [key, value] of Object.entries(extra)) {
    if (isSensitiveEnvKey(key)) continue
    safe[key] = value
  }

  return safe
}
