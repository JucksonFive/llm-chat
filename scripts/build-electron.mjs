import { execSync } from 'child_process'

const serverExternal = [
  'express',
  'cors',
  'ai',
  '@ai-sdk/*',
  '@modelcontextprotocol/*',
].map((e) => `--external:${e}`).join(' ')

// Bundle main process
execSync(
  'npx esbuild electron/main.ts --bundle --platform=node --outfile=dist-electron/main.cjs --format=cjs --external:electron',
  { stdio: 'inherit' }
)

// Bundle preload script
execSync(
  'npx esbuild electron/preload.ts --bundle --platform=node --outfile=dist-electron/preload.cjs --format=cjs --external:electron',
  { stdio: 'inherit' }
)

// Bundle server separately for production use
execSync(
  `npx esbuild server/index.ts --bundle --platform=node --outfile=dist-electron/server.cjs --format=cjs ${serverExternal}`,
  { stdio: 'inherit' }
)

console.log('Electron build complete.')
