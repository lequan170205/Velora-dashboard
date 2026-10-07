#!/usr/bin/env node
import { resolve } from 'node:path'
import { loadConfig, run, writeReport } from './runner.mjs'

function args(argv) { const out = {}; for (let i = 2; i < argv.length; i++) { const key = argv[i]; if (key === '--config' || key === '--output') out[key.slice(2)] = argv[++i]; else if (key === '--plan' || key === '--run') out[key.slice(2)] = true; else throw new Error(`unknown option ${key}`) } return out }
const options = args(process.argv)
if (!options.config || (!!options.plan === !!options.run)) { console.error('usage: node scripts/stress/cli.mjs --config /absolute/private-manifest.json --plan|--run [--output /path/report.json]'); process.exitCode = 2 } else {
  try {
    const config = await loadConfig(resolve(options.config))
    if (options.plan) console.log(JSON.stringify({ baseUrl: config.baseUrl, fixtureNamespace: config.fixtureNamespace,
      accounts: config.accounts.length, rooms: config.rooms.length, stages: config.stages,
      messages: config.stages.reduce((n, s) => n + Math.floor(s.rps * s.seconds), 0) }, null, 2))
    else {
      const controller = new AbortController()
      const stop = () => controller.abort()
      process.on('SIGINT', stop); process.on('SIGTERM', stop)
      const report = await run(config, { signal: controller.signal,
        onProgress: info => console.error(JSON.stringify(info)) })
      process.off('SIGINT', stop); process.off('SIGTERM', stop)
      const path = resolve(options.output ?? `stress-private/results/${report.runId}.json`)
      await writeReport(report, path)
      console.log(JSON.stringify({ passed: report.passed, stopReason: report.stopReason,
        authenticated: report.authenticated, online: report.online, sockets: report.sockets,
        stages: report.stages, totals: report.totals, cleanup: report.cleanup, output: path }, null, 2))
      process.exitCode = report.passed ? 0 : 1
    }
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
