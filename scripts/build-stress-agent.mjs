// Bundles the stress agent and the tools it launches into .stress-agent/, ready to copy to the server host.
import { build } from 'esbuild'
import { mkdir, rm } from 'node:fs/promises'

const root = new URL('../.stress-agent/', import.meta.url).pathname
await rm(root, { recursive: true, force: true })
await mkdir(root + 'bins', { recursive: true })
const node = {
  bundle: true, platform: 'node', format: 'esm', external: ['bufferutil', 'utf-8-validate'],
  banner: { js: "import {createRequire as __nodeRequire} from 'node:module'; var require=__nodeRequire(import.meta.url);" },
}
const tools = {
  'chat.mjs': 'scripts/stress/cli.mjs', 'connections.mjs': 'scripts/stress/chat-connections/cli.mjs', 'churn.mjs': 'scripts/stress/call-signaling/cli.mjs',
  'media.mjs': 'scripts/stress/call-media/run.mjs', 'mixed.mjs': 'scripts/stress/mixed/cli.mjs',
}
await build({ ...node, entryPoints: ['scripts/stress/agent/agent.mjs'], outfile: root + 'agent.mjs' })
for (const [name, entry] of Object.entries(tools)) await build({ ...node, entryPoints: [entry], outfile: root + 'bins/' + name })
await build({ entryPoints: ['scripts/stress/call-media/browser.mjs'], bundle: true, platform: 'browser', format: 'esm', outfile: root + 'bins/browser.js' })
console.log('Built .stress-agent/ (agent.mjs + bins/); fixtures are not embedded.')
