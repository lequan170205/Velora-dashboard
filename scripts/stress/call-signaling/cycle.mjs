// One call lifecycle over real Socket.IO signaling: initiate -> ring -> accept -> hold -> leave.
// No media transports are created, so this measures the control plane only.
import { randomUUID } from 'node:crypto'

export function waitFor(socket, event, { filter = () => true, ms = 15000, label = event, signal } = {}) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      socket.off(event, got); socket.off('exception', fail); socket.off('disconnect', gone)
      signal?.removeEventListener('abort', stop)
    }
    const got = payload => { if (filter(payload)) { cleanup(); resolve(payload) } }
    const fail = payload => { cleanup(); reject(Object.assign(new Error('socket exception'), { serverException: payload })) }
    const gone = () => { cleanup(); reject(new Error('socket disconnected')) }
    const stop = () => { cleanup(); reject(new Error('operator stop')) }
    const timer = setTimeout(() => { cleanup(); reject(new Error(`${label} timeout`)) }, ms)
    socket.on(event, got); socket.on('exception', fail); socket.on('disconnect', gone)
    if (signal?.aborted) return stop()
    signal?.addEventListener('abort', stop, { once: true })
  })
}

// Resolves with per-phase latencies (ms). On failure the error carries `phase`
// and `callId` so the runner can end the call and attribute the failure.
export async function runCycle(pair, { caller, callee }, { now = performance.now.bind(performance), sleep, holdMs = 0, timeoutMs = 15000, signal: outer } = {}) {
  const state = { phase: 'initiate', callId: null }
  // One local signal lets a failed phase cancel the waiters armed for later phases.
  const local = new AbortController()
  const relay = () => local.abort()
  if (outer?.aborted) relay(); else outer?.addEventListener('abort', relay, { once: true })
  const signal = local.signal
  try {
    const opts = { ms: timeoutMs, signal }
    const ring = waitFor(callee, 'incoming_call', { ...opts, label: 'invitation',
      filter: p => p?.conversationId === pair.roomId && p.initiatorId === pair.caller })
    const joined = waitFor(caller, 'call_joined', { ...opts, label: 'initiate',
      filter: p => p?.role === 'host' && p.session?.conversationId === pair.roomId && p.session?.initiatorId === pair.caller })
    ring.catch(() => {}); joined.catch(() => {})
    const t0 = now()
    caller.emit('initiate_call', { conversationId: pair.roomId, targetUserId: pair.callee, selectedInviteeIds: [pair.callee], callType: 'VOICE' })
    const host = await joined
    state.callId = host.callId
    const t1 = now()
    state.phase = 'ring'
    const invitation = await ring
    const t2 = now()
    state.phase = 'accept'
    const acceptance = waitFor(callee, 'incoming_call_acceptance', { ...opts, label: 'accept', filter: p => p?.callId === state.callId })
    acceptance.catch(() => {})
    callee.emit('accept_incoming_call', { callId: state.callId, actionId: randomUUID(), ...(invitation.invitationId ? { invitationId: invitation.invitationId } : {}) })
    const accepted = await acceptance
    if (accepted.outcome !== 'accepted' && accepted.outcome !== 'already_accepted') throw new Error('accept refused')
    const t3 = now()
    if (holdMs > 0) { state.phase = 'hold'; await sleep(holdMs, signal) }
    state.phase = 'leave'
    const left = waitFor(caller, 'call_left', { ...opts, label: 'leave', filter: p => p?.callId === state.callId })
    left.catch(() => {})
    const t4 = now()
    caller.emit('leave_call', { callId: state.callId, reason: 'ended' })
    await left
    const t5 = now()
    // Both sides must leave: a guest that stays joined keeps the call open and the fixture users busy.
    state.phase = 'leave callee'
    const guestLeft = waitFor(callee, 'call_left', { ...opts, label: 'leave', filter: p => p?.callId === state.callId })
    guestLeft.catch(() => {})
    callee.emit('leave_call', { callId: state.callId, reason: 'ended' })
    await guestLeft
    const t6 = now()
    state.callId = null
    return { initiateMs: t1 - t0, ringMs: t2 - t0, acceptMs: t3 - t2, setupMs: t3 - t0, leaveMs: t5 - t4, guestLeaveMs: t6 - t5, totalMs: t6 - t0 }
  } catch (error) {
    error.phase = state.phase; error.callId = state.callId
    throw error
  } finally {
    outer?.removeEventListener('abort', relay)
    local.abort()
  }
}

// Best effort: end a call left open by a failed cycle so fixture users are free again.
// Success means the host's leave was acknowledged; the guest may not have joined, so its result is ignored.
export async function endCall(caller, callId, { callee, timeoutMs = 5000 } = {}) {
  if (!callId) return false
  const leave = async socket => {
    if (!socket?.connected) return false
    try {
      const left = waitFor(socket, 'call_left', { ms: timeoutMs, label: 'leave', filter: p => p?.callId === callId })
      left.catch(() => {})
      socket.emit('leave_call', { callId, reason: 'ended' })
      await left
      return true
    } catch { return false }
  }
  const [hostLeft] = await Promise.all([leave(caller), leave(callee)])
  return hostLeft
}
