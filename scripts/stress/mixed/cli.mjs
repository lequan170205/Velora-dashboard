#!/usr/bin/env node
// usage: node scripts/stress/mixed/cli.mjs --config /abs/private-manifest.json --bins-dir /abs/bins --plan|--run
//   [--profile campus10k|smoke] [--base-url http://127.0.0.1] [--chrome PATH --lan-address IP] [--output /abs/report.json]
//   overrides: --sockets --ramp --window --chat-rps --media-calls --churn-pairs --churn-cps --churn-hold-ms --no-docker --media-local
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../runner.mjs'
import { buildCommands, buildTimeline, chatStage, resolveScenario } from './scenario.mjs'
import { runMixed } from './orchestrator.mjs'

const VALUE = new Set(['config', 'bins-dir', 'profile', 'base-url', 'chrome', 'lan-address', 'output', 'sockets', 'ramp', 'window', 'chat-rps', 'media-calls', 'churn-pairs', 'churn-cps', 'churn-hold-ms'])
const FLAG = new Set(['plan', 'run', 'no-docker', 'media-local'])
export function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (!key.startsWith('--')) throw new Error(`unknown option ${key}`)
    const name = key.slice(2)
    if (VALUE.has(name)) { if (argv[i + 1] === undefined) throw new Error(`${key} needs a value`); out[name] = argv[++i] }
    else if (FLAG.has(name)) out[name] = true
    else throw new Error(`unknown option ${key}`)
  }
  return out
}
export const scenarioFromArgs = a => resolveScenario(a.profile ?? 'campus10k', {
  sockets: a.sockets, rampPerSecond: a.ramp, windowSeconds: a.window, chatRps: a['chat-rps'], mediaCalls: a['media-calls'],
  churnPairs: a['churn-pairs'], churnCps: a['churn-cps'], churnHoldMs: a['churn-hold-ms'],
})
const binPaths = dir => ({ chat: join(dir, 'chat.mjs'), connections: join(dir, 'connections.mjs'), churn: join(dir, 'churn.mjs'), media: join(dir, 'media.mjs'), browserBundle: join(dir, 'browser.js') })

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (!options.config || !options['bins-dir'] || !!options.plan === !!options.run) {
    console.error('usage: cli.mjs --config /abs/manifest.json --bins-dir /abs/bins --plan|--run [--profile campus10k|smoke] [--base-url URL] [--chrome PATH --lan-address IP] [--output /abs/report.json]')
    process.exitCode = 2; return
  }
  const scenario = scenarioFromArgs(options)
  const config = await loadConfig(resolve(options.config))
  if (scenario.mediaCalls > 0 && (!options.chrome || !options['lan-address'])) throw new Error('media calls need --chrome and --lan-address (or --media-calls 0)')
  const bins = binPaths(resolve(options['bins-dir']))
  for (const [name, path] of Object.entries(bins)) {
    if (name === 'browserBundle' && scenario.mediaCalls === 0) continue
    if (name === 'media' && scenario.mediaCalls === 0) continue
    await stat(path).catch(() => { throw new Error(`missing ${path}`) })
  }
  const outDir = await mkdtemp(join(tmpdir(), 'velora-mixed-')); await chmod(outDir, 0o700)
  const localConfig = join(outDir, 'local.json'), chatConfig = join(outDir, 'chat.json')
  const local = { ...config, baseUrl: options['base-url'] ?? config.baseUrl }
  const paths = { bins, config: resolve(options.config), localConfig, chatConfig, outDir, chrome: options.chrome, lanAddress: options['lan-address'], mediaLocal: Boolean(options['media-local']) }
  try {
    if (options.plan) {
      const timeline = buildTimeline(scenario)
      console.log(JSON.stringify({ network: false, scenario, timeline, accounts: config.accounts.length,
        commands: buildCommands(scenario, timeline, paths).map(c => ({ name: c.name, startS: c.startS, args: c.argv.slice(1).filter(a => !a.endsWith('.json') && !a.startsWith('/')) })) }, null, 2))
      return
    }
    const output = resolve(options.output ?? `stress-private/results/mixed-${Date.now()}.json`)
    try { await stat(output); throw new Error('Refusing to overwrite report') } catch (error) { if (error.code !== 'ENOENT') throw error }
    await writeFile(localConfig, JSON.stringify(local), { mode: 0o600 })
    await writeFile(chatConfig, JSON.stringify({ ...local, stages: [chatStage(scenario, config.accounts.length)] }), { mode: 0o600 })
    const controller = new AbortController()
    const stop = () => controller.abort()
    process.on('SIGINT', stop); process.on('SIGTERM', stop)
    const report = await runMixed(scenario, paths, { signal: controller.signal, sample: !options['no-docker'], onEvent: e => console.error(JSON.stringify(e)) })
    await mkdir(dirname(output), { recursive: true, mode: 0o700 })
    await writeFile(output, JSON.stringify(report, null, 2), { mode: 0o600 }); await chmod(output, 0o600)
    const { reports, ...summary } = report
    console.log(JSON.stringify({ ...summary, output }, null, 2))
    process.exitCode = report.passed ? 0 : 1
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
