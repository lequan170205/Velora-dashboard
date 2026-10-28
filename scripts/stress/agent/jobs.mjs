// One stress run at a time. Starting is idempotent per (actor, requestId) so a retried click never doubles the load.
import { randomUUID } from 'node:crypto'
import { describeScenarios, estimateSeconds, validateParams } from './scenarios.mjs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export class JobConflict extends Error {}
export class JobRejected extends Error {}

const KEEP_RECENT = 5

export class StressJobs {
  /** `execute(job, signal, update)` runs the tool and returns { passed, reason, metrics, failures }. */
  constructor(execute, { capabilities = {}, now = () => new Date().toISOString(), onFinished = async () => {} } = {}) {
    this.execute = execute
    this.capabilities = capabilities
    this.now = now
    this.onFinished = onFinished
    this.active = null
    this.recent = []
    this.keys = new Map()
  }

  start(actor, body) {
    if (!body || typeof body !== 'object' || Object.keys(body).sort().join(',') !== 'params,requestId,scenario' || !UUID.test(body.requestId)) throw new JobRejected('Invalid request')
    let params
    try { params = validateParams(body.scenario, body.params, this.capabilities) } catch (error) { throw new JobRejected(error.message) }
    const key = `${actor}:${body.requestId}`, previous = this.keys.get(key)
    if (previous) {
      if (previous.scenario !== body.scenario) throw new JobConflict('This request id was already used for another scenario')
      return previous
    }
    if (this.active) throw new JobConflict('Another run is already active')
    const job = {
      id: randomUUID(), scenario: body.scenario, params, status: 'running', phase: 'Preparing', startedAt: this.now(), finishedAt: null,
      estimatedSeconds: estimateSeconds(body.scenario, params), reason: null, metrics: [], failures: [],
    }
    const abort = new AbortController()
    this.active = { job, abort }
    this.keys.set(key, job)
    Promise.resolve()
      .then(() => this.execute(job, abort.signal, patch => Object.assign(job, patch)))
      .then(result => {
        Object.assign(job, result)
        job.status = abort.signal.aborted ? 'cancelled' : result.passed ? 'passed' : 'failed'
      })
      .catch(error => {
        job.status = abort.signal.aborted ? 'cancelled' : 'failed'
        job.reason ??= abort.signal.aborted ? 'Stopped by the operator' : (error instanceof JobRejected ? error.message : 'The run could not complete; details withheld')
      })
      .finally(async () => {
        job.phase = 'Finished'
        job.finishedAt = this.now()
        try { await this.onFinished(job) } catch { /* the in-memory result is still shown */ }
        this.recent = [job, ...this.recent].slice(0, KEEP_RECENT)
        this.active = null
        for (const [k, v] of this.keys) if (!this.recent.includes(v)) this.keys.delete(k)
      })
    return job
  }

  stop(id) {
    if (this.active?.job.id !== id) throw new JobConflict('No active run with this id')
    this.active.job.status = 'stopping'
    this.active.job.phase = 'Stopping and cleaning up'
    this.active.abort.abort()
    return this.active.job
  }

  state() {
    return { available: true, busy: Boolean(this.active), capabilities: this.capabilities, scenarios: describeScenarios(this.capabilities), active: this.active?.job ?? null, recent: this.recent }
  }
}
