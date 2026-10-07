export function percentiles(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const at = q => sorted.length ? sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)] : null
  return { count: sorted.length, p50: at(.5), p95: at(.95), p99: at(.99) }
}
export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('operator stop'))
    const done = () => { signal?.removeEventListener('abort', abort); resolve() }
    const timer = setTimeout(done, ms)
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new Error('operator stop')) }
    signal?.addEventListener('abort', abort, { once: true })
  })
}
export async function boundedMap(items, concurrency, action) {
  let index = 0, failure
  const result = new Array(items.length)
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length && !failure) {
      const i = index++
      try { result[i] = await action(items[i], i) } catch (error) { failure ??= error }
    }
  }))
  if (failure) throw failure
  return result
}
export function skippedSlots(start, slot, now, interval, planned) {
  const late = now - (start + slot * interval)
  // Small timer jitter is acceptable; a materially late slot is not replayed.
  return late >= interval / 4 ? Math.min(Math.ceil(late / interval), planned - slot) : 0
}
// Recipient bit masks keep bookkeeping bounded without storing raw event payloads.
export class Ledger {
  constructor(accounts, { now = performance.now.bind(performance), deadline = 8000, signal } = {}) {
    this.now = now; this.deadline = deadline; this.records = new Map(); this.pending = new Set()
    this.bits = new Map(accounts.map((a, i) => [a.id, 1n << BigInt(i)]))
    this.traces = []; this.omitted = 0; this.replayWaiters = new Map()
    this.abort = () => { for (const e of this.pending) this.finish(e, 'operator stop') }
    this.signal = signal; signal?.addEventListener('abort', this.abort, { once: true })
  }
  begin({ id, room, sender, recipients, kind, stage }) {
    if (this.records.has(id)) throw new Error('duplicate outgoing identity')
    const e = { id, room, sender, kind, stage, recipients,
      expected: recipients.reduce((mask, id) => mask | this.bits.get(id), 0n),
      seen: 0n, timely: 0n, ackMs: null, ackCount: 0, storedId: null,
      duplicate: 0, unexpected: 0, lateAck: 0, deliveryMs: [], started: this.now(), done: false }
    e.promise = new Promise(resolve => { e.resolve = resolve })
    if (this.traces.length < 500) {
      e.trace = { clientMessageId: id, conversationId: room, senderId: sender,
        kind, emittedAt: new Date().toISOString() }
      this.traces.push(e.trace)
    } else this.omitted++
    this.records.set(id, e); this.pending.add(e)
    e.timer = setTimeout(() => this.finish(e, 'deadline'), this.deadline)
    return e
  }
  valid(e, msg, receiver, ack = false) {
    if (msg.conversationId !== e.room || msg.senderId !== e.sender ||
        (ack ? receiver !== e.sender : !(e.expected & (this.bits.get(receiver) ?? 0n))) ||
        typeof msg.id !== 'string' || !msg.id || (e.storedId && e.storedId !== msg.id)) {
      e.unexpected++; return false
    }
    e.storedId ??= msg.id
    return true
  }
  ack(msg, receiver) {
    const e = this.records.get(msg?.clientMessageId)
    if (!e || !this.valid(e, msg, receiver, true)) return
    e.ackCount++
    const elapsed = this.now() - e.started
    if (e.ackMs === null && elapsed < this.deadline) e.ackMs = elapsed
    else if (elapsed >= this.deadline && e.ackMs === null) e.lateAck++
    const waiter = this.replayWaiters.get(e.id)
    if (waiter && e.ackCount > waiter.baseline) { clearTimeout(waiter.timer); this.replayWaiters.delete(e.id); waiter.resolve() }
    this.complete(e)
  }
  delivery(msg, receiver) {
    const e = this.records.get(msg?.clientMessageId)
    if (!e || !this.valid(e, msg, receiver)) return
    const bit = this.bits.get(receiver)
    if (e.seen & bit) { e.duplicate++; return }
    e.seen |= bit
    const elapsed = this.now() - e.started
    if (elapsed < this.deadline) { e.timely |= bit; e.deliveryMs.push(elapsed) }
    this.complete(e)
  }
  failed(msg, receiver) {
    const e = this.records.get(msg?.clientMessageId)
    if (e && receiver === e.sender && msg.conversationId === e.room) this.finish(e, 'message rejected')
  }
  complete(e) { if (!e.done && e.ackMs !== null && e.timely === e.expected) this.finish(e) }
  finish(e, error = null) {
    if (e.done) return
    e.done = true; e.error = error; clearTimeout(e.timer); this.pending.delete(e)
    if (e.trace) Object.assign(e.trace, { ackMs: e.ackMs, expected: e.recipients.length, timely: this.count(e.timely), error })
    e.resolve(e)
  }
  count(mask) { let n = 0; while (mask) { mask &= mask - 1n; n++ } return n }
  good(e) { return !e.error && e.ackMs !== null && e.timely === e.expected && !e.unexpected && !e.duplicate }
  replay(e, send) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.replayWaiters.delete(e.id); reject(new Error('replay ACK deadline')) }, this.deadline)
      this.replayWaiters.set(e.id, { baseline: e.ackCount, timer, resolve })
      send()
    })
  }
  summary(entries) {
    const deliveries = { expected: 0, timely: 0, received: 0, missing: 0, late: 0, duplicate: 0, unexpected: 0 }
    const ack = [], deliverySamples = []
    let deliverySampleCount = 0
    for (const e of entries) {
      if (e.ackMs !== null) ack.push(e.ackMs)
      deliveries.expected += e.recipients.length
      deliveries.timely += this.count(e.timely); deliveries.received += this.count(e.seen)
      deliveries.missing += e.recipients.length - this.count(e.timely)
      deliveries.late += this.count(e.seen & ~e.timely)
      deliveries.duplicate += e.duplicate; deliveries.unexpected += e.unexpected
      for (const ms of e.deliveryMs) {
        const n = ++deliverySampleCount
        if (deliverySamples.length < 10000) deliverySamples.push(ms)
        else { const i = Math.floor(Math.random() * n); if (i < 10000) deliverySamples[i] = ms }
      }
    }
    return { emitted: entries.length, timelyAck: ack.length,
      ackTimeout: entries.filter(e => e.ackMs === null && e.error === 'deadline').length,
      errors: entries.filter(e => e.error && e.error !== 'deadline').length,
      lateAck: entries.reduce((sum, e) => sum + e.lateAck, 0),
      failedMessages: entries.filter(e => !this.good(e)).length,
      ack: percentiles(ack), delivery: { ...percentiles(deliverySamples), observations: deliverySampleCount,
        sampled: deliverySampleCount > 10000 }, deliveries }
  }
  close() {
    this.abort(); this.signal?.removeEventListener('abort', this.abort)
    for (const w of this.replayWaiters.values()) { clearTimeout(w.timer); w.resolve() }
    this.replayWaiters.clear()
  }
}
