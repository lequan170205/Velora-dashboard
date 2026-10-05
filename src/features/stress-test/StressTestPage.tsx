import { useEffect, useRef, useState } from 'react'
import { Download, Play, RefreshCw, Square, Zap } from 'lucide-react'
import { io } from 'socket.io-client'
import { Button } from '../../shared/components/ui/button'
import { Card, CardContent } from '../../shared/components/ui/card'
import { Input, NativeSelect } from '../../shared/components/ui/input'
import { Label } from '../../shared/components/ui/label'
import { Badge } from '../../shared/components/ui/badge'
import { useOverviewQuery } from '../monitoring/hooks/useOverviewQuery'
import { formatBytes, formatPercent } from '../monitoring/formatters'
import { createTestGroup, fixtureMembersByEmail, getConversations, getSocketToken, socketOrigin, type ConversationOption } from './api'
import { csvReport, PROFILES, runChat, validateStages, type Report, type Stage } from './runner'

import { prepareRooms } from './fixtures'

const HISTORY_KEY = 'velora.stress.history.v1'
const CONFIG_KEY = 'velora.stress.config.v1'
function readStorage<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback } catch { return fallback }
}
function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const ms = (value: number | null | undefined) => value == null ? '—' : `${Math.round(value)} ms`
const roomLabel = (room: ConversationOption) => room.name?.replace(/^Velora stress [a-f0-9]{24} (\d{2})$/, 'Velora stress $1') || `${room.isGroup ? 'Group' : 'Direct'} ${room.id.slice(-8)}`
const resultLabel = (report: Report) => report.passed ? 'Passed' : report.loadPassed ? 'Load passed / retry failed' : 'Incomplete / failed'
function initialConfig() {
  const saved = readStorage<{ conversationId?: string; conversationIds?: string[]; mode?: string; profile?: string; stages?: Stage[] }>(CONFIG_KEY, {})
  const profile = saved.profile && Object.hasOwn(PROFILES, saved.profile) ? saved.profile : 'smoke'
  let stages = structuredClone(PROFILES[profile])
  try { if (Array.isArray(saved.stages)) { validateStages(saved.stages); stages = saved.stages } } catch { /* Ignore stale or corrupt settings. */ }
  return { conversationIds: Array.isArray(saved.conversationIds) ? saved.conversationIds.filter((id): id is string => typeof id === 'string').slice(0, 20) : [], mode: saved.mode === 'multiple' ? 'multiple' : 'single', conversationId: typeof saved.conversationId === 'string' ? saved.conversationId : '', profile, stages }
}

export function StressTestPage() {
  const [savedConfig] = useState(initialConfig)
  const [conversationId, setConversationId] = useState(typeof savedConfig.conversationId === 'string' ? savedConfig.conversationId : '')
  const [mode, setMode] = useState(savedConfig.mode)
  const [selectedIds, setSelectedIds] = useState<string[]>(savedConfig.conversationIds)
  const [fixtureEmail, setFixtureEmail] = useState('')
  const [preparing, setPreparing] = useState(false)
  const [preparation, setPreparation] = useState<string | null>(null)
  const [profile, setProfile] = useState(Object.hasOwn(PROFILES, savedConfig.profile) ? savedConfig.profile : 'smoke')
  const [stages, setStages] = useState<Stage[]>(() => savedConfig.stages)
  const [conversations, setConversations] = useState<ConversationOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [active, setActive] = useState(false)
  const [report, setReport] = useState<Report | null>(null)
  const [history, setHistory] = useState<Report[]>(() => {
    const stored = readStorage<Report[]>(HISTORY_KEY, [])
    return Array.isArray(stored) ? stored.filter((r) => r?.finishedAt && r.totals && r.delivery && Array.isArray(r.stages) && Array.isArray(r.plan)).slice(0, 5) : []
  })
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const monitoring = useOverviewQuery('Unable to load server observation')

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; controller.current?.abort('Left the stress-test page') }
  }, [])
  useEffect(() => {
    const abort = new AbortController()
    setLoading(true)
    getConversations(abort.signal).then((items) => {
      setConversations(items)
      setConversationId((current) => items.some((c) => c.id === current) ? current : '')
    }).catch(() => { if (!abort.signal.aborted) setError('Could not load your conversations. Retry after checking the API.') })
      .finally(() => { if (!abort.signal.aborted) setLoading(false) })
    return () => abort.abort()
  }, [])
  useEffect(() => {
    if (!active) return
    const hidden = () => { if (document.hidden) controller.current?.abort('Browser tab hidden; generator timing is unreliable') }
    const offline = () => controller.current?.abort('Browser went offline')
    const leaving = () => controller.current?.abort('Page closed')
    document.addEventListener('visibilitychange', hidden)
    window.addEventListener('offline', offline)
    window.addEventListener('pagehide', leaving)
    return () => { document.removeEventListener('visibilitychange', hidden); window.removeEventListener('offline', offline); window.removeEventListener('pagehide', leaving) }
  }, [active])

  async function reloadConversations() {
    setLoading(true); setError(null)
    try { setConversations(await getConversations()) } catch { setError('Could not load your conversations.') } finally { setLoading(false) }
  }
  async function prepare() {
    const source = conversations.find((c) => c.id === conversationId)
    if ((!source && !fixtureEmail.trim()) || !confirmed || active || controller.current) return
    const abort = new AbortController(); controller.current = abort
    setPreparing(true); setError(null); setPreparation('Preparing 0/20 rooms…')
    try {
      const template = fixtureEmail.trim() ? await fixtureMembersByEmail(fixtureEmail, abort.signal) : source!
      const work = () => prepareRooms({ source: template, signal: abort.signal, load: () => getConversations(abort.signal), create: (name, members) => createTestGroup(name, members, abort.signal),
        onProgress: (done, created) => { if (mounted.current) setPreparation(`Prepared ${done}/20 rooms · ${created} created`) } })
      const rooms = navigator.locks ? await navigator.locks.request('velora-stress-fixtures', work) : await work()
      if (!mounted.current) return
      setConversations((current) => [...current.filter((c) => !rooms.some((room) => room.id === c.id)), ...rooms])
      setSelectedIds(rooms.map((room) => room.id)); setMode('multiple'); setProfile('distributed'); setStages(structuredClone(PROFILES.distributed)); setReport(null); setConfirmed(false)
      localStorage.setItem(CONFIG_KEY, JSON.stringify({ conversationId, conversationIds: rooms.map((room) => room.id), mode: 'multiple', profile: 'distributed', stages: PROFILES.distributed }))
    } catch {
      if (mounted.current) setError('Preparation stopped. Completed groups are kept; reload and prepare again to reuse them. Check the test email, source members and API access.')
    } finally { controller.current = null; if (mounted.current) setPreparing(false) }
  }
  const runIds = mode === 'multiple' ? selectedIds : conversationId ? [conversationId] : []
  const roomsValid = runIds.length > 0 && runIds.length <= 20 && runIds.every((id) => conversations.some((c) => c.id === id))
  const busy = active || preparing
  async function start() {
    if (active || controller.current || !confirmed || !roomsValid) return
    const abort = new AbortController(); controller.current = abort
    setActive(true); setError(null); setReport(null)
    try {
      const origin = socketOrigin()
      // Token is held in this run closure only, never in React state, storage or reports.
      let token = ''
      const result = await runChat({
        conversationId: runIds[0], conversationIds: runIds, profile, stages: structuredClone(stages), signal: abort.signal,
        ensureSession: async () => { token = await getSocketToken(abort.signal) },
        createSocket: () => io(origin, { path: '/socket.io', transports: ['websocket'], auth: { token }, reconnection: false, forceNew: true, autoConnect: false, timeout: 8000 }),
        onUpdate: (snapshot) => { if (mounted.current) setReport(snapshot) },
      })
      token = ''
      const stored = readStorage<Report[]>(HISTORY_KEY, [])
      const next = [result, ...(Array.isArray(stored) ? stored.filter((r) => r?.finishedAt) : [])].slice(0, 5)
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); localStorage.setItem(CONFIG_KEY, JSON.stringify({ conversationId, conversationIds: selectedIds, mode, profile, stages })) }
      catch { if (mounted.current) setError('Browser storage is unavailable. Export this result before leaving.') }
      if (mounted.current) setHistory(next)
    } catch {
      if (mounted.current) setError('Could not start. Check stage limits, session and the configured API origin.')
    } finally {
      controller.current = null
      if (mounted.current) setActive(false)
    }
  }
  function changeProfile(value: string) {
    setProfile(value); setStages(structuredClone(PROFILES[value])); setConfirmed(false); setReport(null)
  }
  const planned = stages.reduce((sum, stage) => sum + stage.rps * stage.seconds, 0)
  const duration = stages.reduce((sum, stage) => sum + stage.seconds, 0)
  let stagesError: string | null = null
  try { validateStages(stages); if (profile === 'distributed' && runIds.length !== 20) throw new Error('Select 20 rooms for the distributed preset.') } catch (error) { stagesError = error instanceof Error ? error.message : 'Check stage settings.' }
  const totals = report?.totals
  const status = preparing ? preparation ?? 'Preparing rooms' : active ? report?.phase ?? 'Starting' : report ? resultLabel(report) : 'Ready'
  const resources = monitoring.data
  const statsCards = [
    ['Synced', `${totals?.synced ?? 0} / ${totals?.attempted ?? 0}`, 'Settled load attempts'],
    ['ACK p95', ms(totals?.p95), 'Client emit → sender sync'],
    ['Delivery p95', ms(report?.delivery.p95), 'Observer events across selected rooms'],
    ['Rooms / users', `${report?.conversationIds?.length ?? runIds.length} / ${report?.signedInUsers ?? 1}`, 'Conversations / signed-in users'],
    ['Sender sockets', `${report?.senderSockets ?? 0}`, 'Plus one receiver socket'],
    ['Emitted/s', report?.samples.at(-1)?.emittedRps?.toFixed(1) ?? '—', 'Actual generator rate, recent sample'],
    ['Synced/s', report?.samples.at(-1)?.syncedRps?.toFixed(1) ?? '—', 'Sender confirmations, recent sample'],
    ['Errors / skipped', `${(totals?.failed ?? 0) + (totals?.timeout ?? 0) + (totals?.disconnected ?? 0)} / ${report?.skipped ?? 0}`, 'Includes timeout and disconnect'],
  ]
  return <section className="space-y-5" aria-labelledby="stress-title">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-medium uppercase tracking-wider text-ink-3">Demo tools / Chat load</p>
        <h1 id="stress-title" className="mt-1 text-2xl font-semibold">Stress test</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-2">Generate real chat traffic, observe the server, and keep the results. Your dashboard session refreshes automatically.</p></div>
      <Badge tone={busy ? 'info' : report?.passed ? 'good' : report ? 'warn' : 'neutral'}>{status}</Badge>
    </div>
    {error && <p role="alert" className="rounded-card border border-bad/30 bg-bad-soft p-4 text-sm text-bad">{error}</p>}
    {report?.retryCheck?.status === 'failed' && <div role="status" className="rounded-card border border-warn/30 bg-warn-soft p-4 text-sm text-ink-2"><p className="font-semibold">Retry check failed. Load test can continue.</p><p className="mt-1">{report.retryCheck.detail} Each load message uses a new ID. This run measures load; retry correctness remains failed.</p></div>}
    <div className="grid items-start gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
      <Card><CardContent className="space-y-5">
        <div><h2 className="font-semibold">Run configuration</h2><p className="mt-1 text-sm text-ink-2">One signed-in user, multiple sender sockets, one receiver across selected rooms.</p></div>
        <div><Label htmlFor="stress-conversation">Fixture source / single room</Label>
          <NativeSelect id="stress-conversation" value={conversationId} disabled={busy || loading} onChange={(e) => { setConversationId(e.target.value); setConfirmed(false); setReport(null) }}>
            <option value="">{loading ? 'Loading your conversations…' : 'Choose a dedicated test conversation'}</option>
            {conversations.map((c) => <option key={c.id} value={c.id}>{roomLabel(c)}</option>)}
          </NativeSelect>
          <div className="mt-2 flex items-center justify-between gap-2"><span className="text-xs text-ink-3">Only conversations you belong to.</span><Button variant="ghost" size="sm" disabled={busy || loading} onClick={() => void reloadConversations()}><RefreshCw size={14} aria-hidden="true" />Reload</Button></div>
          {!loading && !conversations.length && <p className="mt-2 text-sm text-warn">Create a test group in the mobile app and add this admin account, then reload.</p>}
        </div>
        <div className="space-y-3">
          <div><Label htmlFor="stress-fixture-email">Test member email (optional)</Label><Input id="stress-fixture-email" type="email" value={fixtureEmail} disabled={busy} placeholder="Existing test account" onChange={(e) => { setFixtureEmail(e.target.value); setConfirmed(false) }} /><p className="mt-1 text-xs text-ink-3">Creates groups with this account and you. Leave empty to copy source members.</p></div>
          <Button variant="secondary" className="min-h-11 w-full whitespace-normal" disabled={busy || loading || !confirmed || (!conversationId && !fixtureEmail.trim())} onClick={() => void prepare()}>Prepare / reuse 20 test groups</Button>
          <p className="text-xs leading-relaxed text-ink-3">Uses the chosen test email or source members. Choose test accounts only; this creates real groups without changing the source.</p>
          {preparation && <p role="status" className="text-sm text-ink-2">{preparation}</p>}
          <Label htmlFor="stress-workload">Room distribution</Label>
          <NativeSelect id="stress-workload" value={mode} disabled={busy} onChange={(e) => { setMode(e.target.value); setConfirmed(false); setReport(null); if (profile === 'distributed') changeProfile('smoke') }}><option value="single">Single conversation</option><option value="multiple">Multiple conversations</option></NativeSelect>
          {mode === 'multiple' && <fieldset className="space-y-2"><legend className="text-sm font-medium">Selected rooms ({selectedIds.length}/20)</legend>
            <div className="max-h-56 overflow-y-auto rounded-control border border-line p-2">{conversations.filter((c) => selectedIds.includes(c.id) || c.name?.startsWith('Velora stress ')).map((c) => <label key={c.id} className="flex min-h-9 cursor-pointer items-start gap-2 py-1 text-sm text-ink-2"><input type="checkbox" className="mt-1 size-4 shrink-0 accent-brand" checked={selectedIds.includes(c.id)} disabled={busy || (!selectedIds.includes(c.id) && selectedIds.length >= 20)} onChange={(e) => { setSelectedIds((ids) => e.target.checked ? [...ids, c.id] : ids.filter((id) => id !== c.id)); setConfirmed(false); setReport(null) }} /><span className="break-all">{roomLabel(c)}</span></label>)}</div>
          </fieldset>}
        </div>
        <div><Label htmlFor="stress-profile">Preset</Label><NativeSelect id="stress-profile" value={profile} disabled={busy} onChange={(e) => changeProfile(e.target.value)}>
          <option value="smoke">Smoke — verify first</option><option value="demo">Demo — ramp and recover</option><option value="distributed">Distributed — 20 rooms, up to 50/s</option><option value="recovery">Recovery — light traffic</option>
        </NativeSelect></div>
        <div className="rounded-control border border-line bg-raised p-3 text-sm"><span className="font-mono font-semibold">{planned.toLocaleString()}</span> planned messages · <span className="font-mono">{duration}s</span><p className="mt-1 text-xs text-ink-3">Plus auth checks, setup writes and response draining.</p></div>
        {stagesError && <p role="alert" className="text-sm text-bad">{stagesError}</p>}
        <label className="flex cursor-pointer items-start gap-3 text-sm text-ink-2"><input type="checkbox" className="mt-1 size-4 shrink-0 accent-brand" checked={confirmed} disabled={busy} onChange={(e) => setConfirmed(e.target.checked)} />All selected members are test accounts without bots. Groups and messages are stored; test devices may receive push notifications.</label>
        <div className="flex gap-2"><Button className="h-11 flex-1" disabled={busy || loading || !confirmed || !roomsValid || !!stagesError} onClick={() => void start()}><Play size={16} aria-hidden="true" />Start test</Button>
          <Button variant="danger" className="h-11" disabled={!busy} onClick={() => controller.current?.abort('Stopped by operator')}><Square size={16} aria-hidden="true" />Stop</Button></div>
        <p className="text-xs leading-relaxed text-ink-3">Keep this tab visible. Leaving or going offline stops the run. Tokens and passwords are excluded from results.</p>
      </CardContent></Card>
      <div className="min-w-0 space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">{statsCards.map(([title, value, description]) => <Card key={title}><CardContent className="p-4"><p className="text-sm text-ink-2">{title}</p><p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{value}</p><p className="mt-2 text-xs text-ink-3">{description}</p></CardContent></Card>)}</div>
        <Card><CardContent>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Load stages</h2><span className="text-xs text-ink-3">Total messages/s across sender sockets</span></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b border-line text-ink-3"><th className="pb-3 font-medium">Stage</th><th className="pb-3 font-medium">Sockets</th><th className="pb-3 font-medium">Messages/s</th><th className="pb-3 font-medium">Seconds</th><th className="pb-3 font-medium">Actual sent/s</th><th className="pb-3 font-medium">Result</th></tr></thead>
            <tbody>{stages.map((stage, index) => { const result = report?.stages[index]; return <tr key={stage.name} className="border-b border-line last:border-0">
              <th className="py-3 pr-3 font-medium">{index + 1}. {stage.name}</th>
              {(['sockets', 'rps', 'seconds'] as const).map((key) => <td key={key} className="py-3 pr-3"><Input aria-label={`${stage.name} ${key}`} type="number" min={key === 'seconds' ? 1 : 0} max={key === 'seconds' ? 600 : 100} step={1} disabled={busy} className="w-20" value={stage[key]} onChange={(e) => { setConfirmed(false); setReport(null); setStages((old) => old.map((s, i) => i === index ? { ...s, [key]: Number(e.target.value) } : s)) }} /></td>)}
              <td className="py-3 pr-3 font-mono text-xs">{result?.emittedRps.toFixed(1) ?? '—'}</td><td className="py-3 text-xs text-ink-2">{result ? `${result.synced}/${result.attempted} synced · ${ms(result.p95)}` : active && report?.phase === stage.name ? 'Running' : '—'}</td>
            </tr> })}</tbody></table></div>
          {report && <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-sm text-ink-2">{report.stopReason || `${report.phase} · ${report.senderSockets} sender sockets · ${report.inFlight} pending`}</p>
            <div className="flex gap-2"><Button variant="secondary" size="sm" disabled={busy || !report.finishedAt} onClick={() => download(`${report.id}.json`, JSON.stringify(report, null, 2), 'application/json')}><Download size={14} aria-hidden="true" />JSON</Button><Button variant="secondary" size="sm" disabled={busy || !report.finishedAt} onClick={() => download(`${report.id}.csv`, csvReport(report), 'text/csv')}><Download size={14} aria-hidden="true" />CSV</Button></div></div>}
        </CardContent></Card>
        <Card><CardContent><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-semibold"><Zap size={16} aria-hidden="true" />Server observation</h2><span className="text-xs text-ink-3">{monitoring.isError ? 'Metrics unavailable' : resources ? `Sample ${new Date(resources.generatedAt).toLocaleTimeString()}` : 'Waiting for metrics'}</span></div>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">{[
            ['Host CPU', resources?.host.cpuUsageRatio == null ? '—' : formatPercent(resources.host.cpuUsageRatio)],
            ['Host RAM', resources?.host.memoryUsedBytes == null ? '—' : formatBytes(resources.host.memoryUsedBytes)],
            ['Chat sends/s', resources?.conversation.sendRequestsPerSecond?.toFixed(1) ?? '—'],
            ['Handler p95', ms(resources?.conversation.p95SendLatencySeconds == null ? null : resources.conversation.p95SendLatencySeconds * 1000)],
          ].map(([label, value]) => <div key={label}><p className="text-xs text-ink-3">{label}</p><p className="mt-1 font-mono text-lg font-semibold">{value}</p></div>)}</div>
          <p className="mt-4 text-xs leading-relaxed text-ink-3">Server metrics refresh every 5s; rates use a 1-minute window. Sender ACK happens before all handler work finishes, so ACK p95 and handler p95 differ.</p>
        </CardContent></Card>
      </div>
    </div>
    {report?.rooms && <Card><CardContent><h2 className="font-semibold">Per-conversation results</h2><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm"><thead><tr className="border-b border-line text-ink-3"><th className="py-2">Room</th><th>Synced / sent</th><th>Delivered</th><th>Timeouts</th><th>p95</th></tr></thead><tbody>{report.rooms.map((room, index) => <tr key={room.conversationId} className="border-b border-line last:border-0"><th className="max-w-64 py-2 pr-3 break-words font-medium">{conversations.find((c) => c.id === room.conversationId) ? roomLabel(conversations.find((c) => c.id === room.conversationId)!) : `Room ${index + 1}`}</th><td>{room.synced}/{room.attempted}</td><td>{room.received}</td><td>{room.timeout}</td><td>{ms(room.p95)}</td></tr>)}</tbody></table></div></CardContent></Card>}
    <Card><CardContent><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Saved runs</h2><span className="text-xs text-ink-3">Last 5 runs in this browser</span></div>
      {!history.length ? <p className="mt-3 text-sm text-ink-2">Finish a smoke test to save the first result.</p> : <ul className="mt-3 divide-y divide-line">{history.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="text-sm font-medium">{item.profile} · {new Date(item.startedAt).toLocaleString()}</p><p className="mt-1 text-xs text-ink-3">{resultLabel(item)} · {item.totals.synced} synced · ACK p95 {ms(item.totals.p95)}</p></div><Button size="sm" variant="secondary" onClick={() => { if (!busy) { setReport(item); setSelectedIds(item.conversationIds ?? [item.conversationId]); setMode((item.conversationIds?.length ?? 1) > 1 ? 'multiple' : 'single'); setStages(structuredClone(item.plan)); setProfile(item.profile); setConversationId(conversations.some((c) => c.id === item.conversationId) ? item.conversationId : ''); setConfirmed(false) } }} disabled={busy}>View result</Button></li>)}</ul>}
      <p className="mt-4 text-xs text-ink-3">Synthetic text tests backend persistence and fan-out. It does not measure mobile encryption, native push UI or WebRTC/SFU media capacity. Retry preflight checks one identity; it does not prove exactly-once delivery.</p>
    </CardContent></Card>
  </section>
}
