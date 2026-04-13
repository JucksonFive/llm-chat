import { execSync } from 'child_process'

// Bundle main process
execSync(
  'pnpm exec esbuild electron/main.ts --bundle --platform=node --outfile=dist-electron/main.cjs --format=cjs --external:electron',
  { stdio: 'inherit' }
)

// Bundle preload script
execSync(
  'pnpm exec esbuild electron/preload.ts --bundle --platform=node --outfile=dist-electron/preload.cjs --format=cjs --external:electron',
  { stdio: 'inherit' }
)

// Bundle server with all dependencies included (no externals)
execSync(
  'pnpm exec esbuild server/index.ts --bundle --platform=node --outfile=dist-electron/server.cjs --format=cjs',
  { stdio: 'inherit' }
)

console.log('Electron build complete.')
