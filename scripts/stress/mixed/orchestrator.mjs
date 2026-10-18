// Starts the chat-connection, chat-message, call-signaling and call-media tools on one timeline,
// samples container resources while they run, then judges the combined result.
import { spawn } from 'node:child_process'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { buildCommands, buildTimeline, evaluate, parseDockerStats, summarizeResources } from './scenario.mjs'

const execFileAsync = promisify(execFile)
const TAIL = 2000
const tail = (current, chunk) => (current + chunk).slice(-TAIL)

export const defaultDockerStats = async () => {
  const { stdout } = await execFileAsync('docker', ['stats', '--no-stream', '--format', '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}'], { timeout: 20000 })
  return parseDockerStats(stdout)
}
export const defaultReadReport = async path => { try { return JSON.parse(await readFile(path, 'utf8')) } catch { return null } }

export async function runMixed(scenario, paths, {
  signal, onEvent = () => {}, spawnImpl = spawn, dockerStats = defaultDockerStats, readReport = defaultReadReport,
  now = () => Date.now(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), sampleEveryMs = 5000, sample = true,
} = {}) {
  const timeline = buildTimeline(scenario)
  const commands = buildCommands(scenario, timeline, paths)
  const t0 = now(), startedAt = new Date(t0).toISOString()
  const children = new Map(), samples = []
  let running = 0, stopRequested = false

  const launch = command => new Promise(resolve => {
    const record = { name: command.name, plannedStartS: command.startS, startedS: null, finishedS: null, exitCode: null, signal: null, stderrTail: '', stdoutTail: '' }
    children.set(command.name, record)
    ;(async () => {
      const wait = command.startS * 1000 - (now() - t0)
      if (wait > 0) await Promise.race([sleep(wait), new Promise(r => signal?.addEventListener('abort', r, { once: true }))])
      if (signal?.aborted || stopRequested) { record.exitCode = null; record.signal = 'not started'; return resolve(record) }
      record.startedS = Math.round((now() - t0) / 100) / 10; running++
      onEvent({ event: 'start', name: command.name, atS: record.startedS })
      const child = spawnImpl(paths.node ?? process.execPath, command.argv, { stdio: ['ignore', 'pipe', 'pipe'] })
      record.child = child
      child.stdout?.on('data', d => { record.stdoutTail = tail(record.stdoutTail, d.toString()) })
      child.stderr?.on('data', d => { record.stderrTail = tail(record.stderrTail, d.toString()) })
      child.on('error', error => { record.stderrTail = tail(record.stderrTail, String(error.message)) })
      child.on('exit', (code, sig) => {
        record.exitCode = code; record.signal = sig; record.finishedS = Math.round((now() - t0) / 100) / 10; running--
        delete record.child
        onEvent({ event: 'finish', name: command.name, atS: record.finishedS, exitCode: code })
        resolve(record)
      })
    })()
  })
  const onAbort = () => { for (const r of children.values()) r.child?.kill('SIGTERM') }
  signal?.addEventListener('abort', onAbort, { once: true })

  let sampling = sample
  const sampler = (async () => {
    while (sampling) {
      await sleep(sampleEveryMs)
      if (!sampling) break
      try { samples.push(await dockerStats()) } catch { /* resource sampling is best effort */ }
    }
  })()

  await Promise.all(commands.map(launch))
  sampling = false
  signal?.removeEventListener('abort', onAbort)
  await sampler

  const reports = {}
  for (const command of commands) reports[command.name] = await readReport(command.output)
  const verdict = evaluate(reports, scenario)
  return {
    startedAt, finishedAt: new Date(now()).toISOString(), scenario, timeline,
    stopReason: signal?.aborted ? 'operator stop' : null,
    children: Object.fromEntries([...children].map(([name, r]) => [name, { plannedStartS: r.plannedStartS, startedS: r.startedS, finishedS: r.finishedS, exitCode: r.exitCode, signal: r.signal,
      stderrTail: r.exitCode === 0 ? '' : r.stderrTail.slice(-600) }])),
    resources: summarizeResources(samples), resourceSamples: samples.length,
    criteria: verdict.criteria, passed: verdict.passed && !signal?.aborted,
    reports,
  }
}
