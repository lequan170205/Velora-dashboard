// Runs one scenario by launching the bundled CLI tool, then turns its report into the verdict the dashboard shows.
import { spawn } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildCommand, checkMixed, estimateSeconds, summarize } from './scenarios.mjs'
import { JobRejected } from './jobs.mjs'

const GRACE_MS = 90_000
const tail = (current, chunk) => (current + chunk).slice(-4000)
const PHASES = { ramp: 'Mở kết nối', hold: 'Giữ kết nối', storm: 'Ngắt và nối lại', load: 'Đang gửi tin', login: 'Đăng nhập', finished: 'Dọn dẹp' }

/**
 * `config` is the validated private manifest. `options` carries binsDir, baseUrl, chrome and lanAddress.
 * Credentials are written only to a private temp directory that is removed when the run ends.
 */
export async function executeJob(job, signal, update, { config, options, spawnImpl = spawn, deadlineFactor = 2 }) {
  const p = job.params
  if (job.scenario === 'mixed') {
    try { checkMixed(p) } catch (error) { throw new JobRejected(error.message) }
  }
  const media = (job.scenario === 'calls' && p.media) || (job.scenario === 'mixed' && p.calls > 0)
  if (media && (!options.chrome || !options.lanAddress)) throw new JobRejected('Agent chưa được cấu hình Chrome cho âm thanh thật')
  const dir = await mkdtemp(join(tmpdir(), 'velora-stress-'))
  await chmod(dir, 0o700)
  try {
    const bins = {
      chat: join(options.binsDir, 'chat.mjs'), connections: join(options.binsDir, 'connections.mjs'), signaling: join(options.binsDir, 'churn.mjs'),
      media: join(options.binsDir, 'media.mjs'), browserBundle: join(options.binsDir, 'browser.js'), mixed: join(options.binsDir, 'mixed.mjs'),
    }
    const paths = { bins, binsDir: options.binsDir, configFile: join(dir, 'config.json'), chatConfigFile: join(dir, 'chat.json'), output: join(dir, 'report.json'),
      accounts: config.accounts.length, baseUrl: options.baseUrl, chrome: options.chrome, lanAddress: options.lanAddress }
    const command = buildCommand(job.scenario, p, paths)
    const local = { ...config, baseUrl: options.baseUrl }
    await writeFile(paths.configFile, JSON.stringify(local), { mode: 0o600 })
    if (command.configKind === 'chat') await writeFile(paths.chatConfigFile, JSON.stringify({ ...local, stages: command.stages }), { mode: 0o600 })

    update({ phase: 'Đang chạy' })
    const child = spawnImpl(options.node ?? process.execPath, command.argv, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = '', buffer = ''
    const onLine = line => {
      try {
        const info = JSON.parse(line)
        const label = PHASES[info.phase] ?? null
        if (label) update({ phase: label })
      } catch { /* not a progress line */ }
    }
    const feed = data => {
      buffer += data
      const lines = buffer.split('\n')
      buffer = lines.pop().slice(-2000)
      lines.forEach(onLine)
    }
    child.stdout?.on('data', feed)
    child.stderr?.on('data', data => { stderr = tail(stderr, String(data)); feed(data) })
    let killTimer
    const stop = () => {
      child.kill('SIGINT')
      killTimer = setTimeout(() => child.kill('SIGKILL'), GRACE_MS)
    }
    const deadline = setTimeout(() => { job.reason = 'Quá thời gian dự kiến nên đã dừng'; stop() }, (estimateSeconds(job.scenario, p) * deadlineFactor + 120) * 1000)
    signal.addEventListener('abort', stop, { once: true })
    if (signal.aborted) stop()
    const code = await new Promise(resolve => {
      child.once('error', () => resolve(-1))
      child.once('exit', exitCode => resolve(exitCode))
    })
    clearTimeout(deadline); clearTimeout(killTimer)
    signal.removeEventListener('abort', stop)
    update({ phase: 'Đang tổng hợp kết quả' })

    let report = null
    try { report = JSON.parse(await readFile(paths.output, 'utf8')) } catch { /* the tool did not finish a report */ }
    const result = summarize(job.scenario, p, report, { stopped: signal.aborted })
    if (!report && !signal.aborted) result.reason = code === -1 ? 'Không khởi động được công cụ test' : `Công cụ test dừng đột ngột (mã ${code})`
    // Not enumerable: the raw report is saved to disk but never sent to the dashboard.
    Object.defineProperty(job, 'rawReport', { value: report, enumerable: false, configurable: true })
    return result
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** Keeps the raw report next to the verdict so a run can be cited later; counts and latencies only. */
export async function saveResult(dir, job) {
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const name = `${job.scenario}-${job.startedAt.replace(/[:.]/g, '-')}.json`
  await writeFile(join(dir, name), JSON.stringify({ ...job, report: job.rawReport ?? null }, null, 2), { mode: 0o600 })
}
