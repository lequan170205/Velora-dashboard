#!/usr/bin/env node
// usage: node scripts/stress/chat-connections/cli.mjs --config /abs/private-manifest.json --plan|--run
//   [--sockets 500] [--ramp 50] [--hold 30] [--probes 1] [--storms 0] [--jitter-ms 5000] [--output /abs/report.json]
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chmod, mkdir, stat, writeFile } from 'node:fs/promises'
import { loadConfig } from '../runner.mjs'
import { CONNECTION_LIMITS, validateConnectionPlan } from './plan.mjs'
import { runConnectionCapacity } from './runner.mjs'

const VALUE = new Set(['config', 'output', 'sockets', 'ramp', 'hold', 'probes', 'storms', 'jitter-ms'])
const FLAG = new Set(['plan', 'run'])
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
export const planFromArgs = a => validateConnectionPlan({
  sockets: a.sockets, rampPerSecond: a.ramp, holdSeconds: a.hold, probesPerSecond: a.probes, storms: a.storms, stormJitterMs: a['jitter-ms'],
})

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (!options.config || !!options.plan === !!options.run) {
    console.error('usage: cli.mjs --config /abs/private-manifest.json --plan|--run [--sockets N] [--ramp N] [--hold S] [--probes N] [--storms N] [--jitter-ms N] [--output /abs/report.json]')
    process.exitCode = 2; return
  }
  const config = await loadConfig(resolve(options.config))
  const plan = planFromArgs(options)
  if (options.plan) {
    console.log(JSON.stringify({ network: false, baseUrl: config.baseUrl, fixtureNamespace: config.fixtureNamespace, plan, accounts: config.accounts.length,
      socketsPerAccount: Math.ceil(plan.sockets / config.accounts.length), limits: CONNECTION_LIMITS,
      needsOpenFiles: plan.sockets + 200 }, null, 2))
    return
  }
  const output = resolve(options.output ?? `stress-private/results/chat-connections-${Date.now()}.json`)
  try { await stat(output); throw new Error('Refusing to overwrite report') } catch (error) { if (error.code !== 'ENOENT') throw error }
  const controller = new AbortController()
  const stop = () => controller.abort()
  process.on('SIGINT', stop); process.on('SIGTERM', stop)
  const report = await runConnectionCapacity(config, plan, { signal: controller.signal, onProgress: info => console.error(JSON.stringify(info)) })
  await mkdir(dirname(output), { recursive: true, mode: 0o700 })
  await writeFile(output, JSON.stringify(report, null, 2), { mode: 0o600 }); await chmod(output, 0o600)
  console.log(JSON.stringify({ ...report, output }, null, 2))
  process.exitCode = report.passed ? 0 : 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
