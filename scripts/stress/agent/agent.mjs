#!/usr/bin/env node
// The stress agent: a small HTTP service that runs on the server host, next to the gateway.
// The dashboard talks to it through the gateway (admin only); it starts the bundled stress tools against
// the local gateway, so the numbers do not include the public edge.
//
//   node agent.mjs --manifest ~/velora-chat-stress/manifest.json [--bins-dir DIR] [--base-url http://127.0.0.1]
//     [--chrome PATH --lan-address IP] [--results-dir DIR] [--port 18944]
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../runner.mjs'
import { adminAuthorizer } from './auth.mjs'
import { executeJob, saveResult } from './execute.mjs'
import { JobConflict, JobRejected, StressJobs } from './jobs.mjs'

const VALUE = new Set(['manifest', 'bins-dir', 'base-url', 'chrome', 'lan-address', 'results-dir', 'port', 'auth-origin'])
export function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (!key.startsWith('--') || !VALUE.has(key.slice(2))) throw new Error(`unknown option ${key}`)
    if (argv[i + 1] === undefined) throw new Error(`${key} needs a value`)
    out[key.slice(2)] = argv[++i]
  }
  return out
}

/** The request handler, separated from the socket so tests can drive it directly. */
export function createHandler({ jobs, authorize }) {
  return async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify(body))
    }
    if (req.method === 'GET' && req.url === '/health') return send(200, { ready: true, busy: jobs.state().busy })
    try {
      // Browsers send Origin; only the gateway (no Origin) may call this service.
      if (req.headers.origin) return send(403, { error: 'Use the dashboard gateway' })
      const actor = await authorize(req.headers.authorization?.replace(/^Bearer /, ''))
      if (req.method === 'GET' && req.url === '/runs') return send(200, jobs.state())
      let text = ''
      for await (const chunk of req) {
        text += chunk
        if (text.length > 4096) throw new JobRejected('Request too large')
      }
      if (req.method === 'POST' && req.url === '/runs') return send(202, jobs.start(actor.id, JSON.parse(text)))
      const stop = req.url?.match(/^\/runs\/([0-9a-f-]{36})\/stop$/i)
      if (req.method === 'POST' && stop) return send(200, jobs.stop(stop[1]))
      send(404, { error: 'Not found' })
    } catch (error) {
      if (error instanceof JobConflict) return send(409, { error: error.message })
      if (error instanceof JobRejected) return send(400, { error: error.message })
      send(error?.message === 'Unauthorized' ? 401 : 400, { error: 'Request rejected' })
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (!options.manifest) throw new Error('usage: agent.mjs --manifest /abs/private-manifest.json [--bins-dir DIR] [--chrome PATH --lan-address IP]')
  if ((await stat(options.manifest)).mode & 0o077) throw new Error('Manifest must be private (0600)')
  const config = await loadConfig(resolve(options.manifest))
  const here = dirname(fileURLToPath(import.meta.url))
  const run = {
    binsDir: resolve(options['bins-dir'] ?? join(here, 'bins')), baseUrl: options['base-url'] ?? 'http://127.0.0.1',
    chrome: options.chrome, lanAddress: options['lan-address'],
  }
  if (Boolean(run.chrome) !== Boolean(run.lanAddress)) throw new Error('--chrome and --lan-address go together')
  await readFile(join(run.binsDir, 'chat.mjs'))
  const resultsDir = resolve(options['results-dir'] ?? join(homedir(), 'velora-chat-stress', 'results'))
  const jobs = new StressJobs((job, signal, update) => executeJob(job, signal, update, { config, options: run }), {
    capabilities: { media: Boolean(run.chrome) }, onFinished: job => saveResult(resultsDir, job),
  })
  const authorize = adminAuthorizer(options['auth-origin'] ?? config.baseUrl)
  const server = createServer(createHandler({ jobs, authorize }))
  const port = Number(options.port ?? 18944)
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', ok) })
  console.log(`Stress agent ready on 127.0.0.1:${port}; media ${run.chrome ? 'on' : 'off'}; results in ${resultsDir}`)
  const close = async () => {
    jobs.active?.abort.abort()
    const end = Date.now() + 120_000
    while (jobs.state().busy && Date.now() < end) await new Promise(r => setTimeout(r, 500))
    server.close()
    process.exit(0)
  }
  process.once('SIGTERM', close); process.once('SIGINT', close)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
