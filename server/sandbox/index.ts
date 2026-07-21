/**
 * Sandbox module barrel.
 *
 * Registers available sandbox drivers and provides status checks.
 */

export { wslDriver, checkWslPrerequisites, WslSandboxDriver } from './wsl-driver.js'
export { windowsDriver, WindowsSandboxDriver } from './windows-driver.js'

export {
  registerSandboxDriver,
  getDriver,
  getDriverStatus,
  executeInSandbox,
  loadProjectWorkspace,
} from '../lib/sandbox-service.js'

export type {
  SandboxDriver,
  SandboxExecutionRequest,
  SandboxExecutionResult,
  SandboxRuntime,
  SandboxKind,
  SandboxResources,
  ProjectWorkspace,
} from '../lib/sandbox-types.js'
