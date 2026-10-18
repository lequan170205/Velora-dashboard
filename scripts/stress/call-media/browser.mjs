import { io } from "socket.io-client";
import { Device } from "mediasoup-client";
import { safeFailure } from "./plan.mjs";
import { summarizeRtcStats } from "./diagnostics.mjs";
import { normalizeTransport } from "./media-path.mjs";
let stopRequested = false;
window.veloraStopCallPilot = () => {
  stopRequested = true;
};
const assertRunning = () => {
  if (stopRequested) throw new Error("operator stop");
};
const key = location.hash.slice(1),
  headers = { "x-run-key": key, "content-type": "application/json" };
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(path, data) {
  const r = await fetch(path, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error("HTTP request failed");
  return r.json();
}
function wait(socket, event, filter = () => true, ms = 15000, label = event) {
  let cancel;
  const promise = new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      socket.off(event, got);
      socket.off("exception", fail);
      socket.off("disconnect", disconnect);
    };
    const got = (p) => {
      if (filter(p)) {
        cleanup();
        resolve(p);
      }
    };
    const fail = () => {
      cleanup();
      reject(new Error("socket exception"));
    };
    const disconnect = () => {
      cleanup();
      reject(new Error("socket disconnected"));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(label + " timeout"));
    }, ms);
    cancel = () => {
      cleanup();
      reject(new Error("operator stop"));
    };
    socket.on(event, got);
    socket.on("exception", fail);
    socket.on("disconnect", disconnect);
  });
  // Cancellation can happen before another pending promise is awaited.
  promise.catch(() => {});
  return { promise, cancel };
}
function request(
  socket,
  event,
  payload,
  response,
  label,
  filter = (p) => p?.callId === payload.callId,
) {
  const w = wait(socket, response, filter, 15000, label);
  socket.emit(event, payload);
  return w.promise;
}
async function connect(id, baseUrl) {
  const { token } = await api("/token", { id });
  const s = io(baseUrl + "/call", {
    path: "/call/socket.io",
    transports: ["websocket"],
    auth: { token, groupLifecycleVersion: 3 },
    autoConnect: false,
    forceNew: true,
    reconnection: false,
  });
  // Remember why a socket closed so a failed run can say "ping timeout" or "transport close".
  s.on("disconnect", (reason) => {
    s.disconnectReason = reason;
    s.disconnectedAt = Date.now();
  });
  const ready = wait(s, "call_socket_ready", () => true, 20000, "socket ready");
  s.on("connect_error", () => ready.cancel());
  s.connect();
  try {
    await ready.promise;
    return s;
  } catch (e) {
    s.disconnect();
    throw e;
  }
}
async function media(socket, callId, capabilities, tone, mediaAddressOverride) {
  const device = new Device();
  await device.load({ routerRtpCapabilities: capabilities });
  const context = new AudioContext();
  await context.resume();
  const oscillator = context.createOscillator(),
    destination = context.createMediaStreamDestination();
  oscillator.frequency.value = tone;
  oscillator.connect(destination);
  oscillator.start();
  const track = destination.stream.getAudioTracks()[0],
    transports = [];
  const endpoint = {
    socket,
    device,
    context,
    oscillator,
    track,
    transports,
    consumers: [],
    consumer: null,
    producer: null,
    callId,
    turnServerEntries: 0,
  };
  try {
    for (const direction of ["send", "recv"]) {
      const opts = await request(
        socket,
        "create_transport",
        { callId, direction },
        "transport_created",
        "transport",
      );
      endpoint.turnServerEntries = Array.isArray(opts.iceServers)
        ? opts.iceServers.length
        : 0;
      const normalized = normalizeTransport(opts, mediaAddressOverride);
      const transport =
        direction === "send"
          ? device.createSendTransport(normalized)
          : device.createRecvTransport(normalized);
      transports.push(transport);
      endpoint[direction] = transport;
      transport.on("connect", ({ dtlsParameters }, callback, errback) => {
        request(
          socket,
          "connect_transport",
          { callId, transportId: transport.id, dtlsParameters },
          "transport_connected",
          "connect",
          (p) => p?.callId === callId && p.transportId === transport.id,
        ).then(callback, errback);
      });
      if (direction === "send")
        transport.on(
          "produce",
          ({ kind, rtpParameters }, callback, errback) => {
            const requestId = crypto.randomUUID();
            request(
              socket,
              "produce",
              {
                callId,
                transportId: transport.id,
                kind,
                rtpParameters,
                requestId,
                audioEnabled: true,
              },
              "producer_created",
              "produce",
              (p) => p?.requestId === requestId && p.callId === callId,
            ).then((p) => callback({ id: p.producerId }), errback);
          },
        );
    }
    endpoint.producer = await endpoint.send.produce({ track });
    return endpoint;
  } catch (e) {
    closeMedia(endpoint);
    throw e;
  }
}
function closeMedia(e) {
  if (!e) return;
  e.consumers?.forEach((c) => c.close());
  e.transports?.forEach((t) => t.close());
  e.track?.stop();
  try {
    e.oscillator?.stop();
  } catch {}
  e.context?.close().catch(() => {});
}
async function consume(endpoint, producer) {
  const requestId = crypto.randomUUID(),
    { socket, callId } = endpoint;
  const p = await request(
    socket,
    "consume",
    {
      callId,
      transportId: endpoint.recv.id,
      producerId: producer.id,
      rtpCapabilities: endpoint.device.rtpCapabilities,
      requestId,
    },
    "consumer_created",
    "consume",
    (x) => x?.callId === callId && x.requestId === requestId,
  );
  const c = await endpoint.recv.consume({
    id: p.id ?? p.consumerId,
    producerId: p.producerId ?? producer.id,
    kind: p.kind,
    rtpParameters: p.rtpParameters,
  });
  endpoint.consumers.push(c);
  endpoint.consumer = c;
  await request(
    socket,
    "resume_consumer",
    { callId, consumerId: c.id },
    "consumer_resumed",
    "resume",
    (x) => x?.callId === callId && x.consumerId === c.id,
  );
}
async function sample(e) {
  const stats = await e.consumer.getStats();
  let bytes = 0,
    packets = 0,
    lost = 0,
    jitter = 0;
  stats.forEach((r) => {
    if (r.type === "inbound-rtp") {
      bytes += r.bytesReceived ?? 0;
      packets += r.packetsReceived ?? 0;
      lost += r.packetsLost ?? 0;
      jitter = Math.max(jitter, r.jitter ?? 0);
    }
  });
  return { bytes, packets, lost, jitter, at: Date.now() };
}
async function iceRoute(e) {
  const stats = await e.recv.getStats();
  const transport = [...stats.values()].find(
    (r) => r.type === "transport" && r.selectedCandidatePairId,
  );
  const pair = transport
    ? stats.get(transport.selectedCandidatePairId)
    : [...stats.values()].find(
        (r) =>
          r.type === "candidate-pair" && r.nominated && r.state === "succeeded",
      );
  const local = pair ? stats.get(pair.localCandidateId) : null,
    remote = pair ? stats.get(pair.remoteCandidateId) : null;
  return {
    localType: local?.candidateType ?? null,
    remoteType: remote?.candidateType ?? null,
    protocol: local?.protocol ?? null,
    relayProtocol: local?.relayProtocol ?? null,
    roundTripSeconds: pair?.currentRoundTripTime ?? null,
  };
}
async function connectivity(e) {
  return {
    audioContext: e.context.state,
    trackState: e.track.readyState,
    trackEnabled: e.track.enabled,
    turnServerEntries: e.turnServerEntries,
    send: {
      state: e.send.connectionState,
      ...summarizeRtcStats(await e.send.getStats()),
    },
    recv: {
      state: e.recv.connectionState,
      ...summarizeRtcStats(await e.recv.getStats()),
    },
  };
}
async function setupPair(pair, config) {
  const item = {
    roomId: pair.roomId,
    callerId: pair.caller,
    calleeId: pair.callee,
    sockets: [],
    media: [],
    callId: null,
    cleanup: [],
  };
  const started = performance.now();
  let invitation;
  try {
    assertRunning();
    item.phase = "connect caller";
    window.veloraCallProgress = { phase: item.phase };
    item.caller = await connect(pair.caller, config.baseUrl);
    item.sockets.push(item.caller);
    item.phase = "connect callee";
    window.veloraCallProgress = { phase: item.phase };
    item.callee = await connect(pair.callee, config.baseUrl);
    item.sockets.push(item.callee);
    invitation = wait(
      item.callee,
      "incoming_call",
      (p) => p?.conversationId === pair.roomId && p.initiatorId === pair.caller,
      15000,
      "invitation",
    );
    item.phase = "initiate";
    window.veloraCallProgress = { phase: item.phase };
    const joined = await request(
      item.caller,
      "initiate_call",
      {
        conversationId: pair.roomId,
        targetUserId: pair.callee,
        selectedInviteeIds: [pair.callee],
        callType: "VOICE",
      },
      "call_joined",
      "initiate",
      (p) =>
        p?.role === "host" &&
        p.session?.conversationId === pair.roomId &&
        p.session?.initiatorId === pair.caller,
    );
    item.callId = joined.callId;
    const ring = await invitation.promise;
    item.phase = "accept";
    window.veloraCallProgress = { phase: item.phase };
    const accepted = await request(
      item.callee,
      "accept_incoming_call",
      {
        callId: item.callId,
        actionId: crypto.randomUUID(),
        ...(ring.invitationId ? { invitationId: ring.invitationId } : {}),
      },
      "incoming_call_acceptance",
      "accept",
    );
    if (
      accepted.outcome !== "accepted" &&
      accepted.outcome !== "already_accepted"
    )
      throw new Error("accept refused");
    item.inviteAcceptMs = performance.now() - started;
    item.phase = "caller media";
    window.veloraCallProgress = { phase: item.phase };
    const a = await media(
      item.caller,
      item.callId,
      joined.rtpCapabilities,
      440,
      config.mediaAddressOverride,
    );
    item.media.push(a);
    item.phase = "callee media";
    window.veloraCallProgress = { phase: item.phase };
    const b = await media(
      item.callee,
      item.callId,
      accepted.rtpCapabilities,
      550,
      config.mediaAddressOverride,
    );
    item.media.push(b);
    item.phase = "consume";
    window.veloraCallProgress = { phase: item.phase };
    await consume(a, b.producer);
    await consume(b, a.producer);
    item.transportSetupMs = performance.now() - started;
    return item;
  } catch (e) {
    invitation?.cancel();
    await cleanupPair(item);
    e.callFailure = {
      callId: item.callId,
      roomId: item.roomId,
      phase: item.phase,
      cleanup: item.cleanup,
    };
    throw e;
  }
}
async function cleanupPair(item) {
  // Only call IDs issued to this test are ever touched.
  if (item.callId && item.caller?.connected) {
    try {
      await request(
        item.caller,
        "leave_call",
        { callId: item.callId, reason: "ended" },
        "call_left",
        "leave",
      );
      item.cleanup.push("call_left");
    } catch {
      item.cleanup.push("leave timeout");
    }
  }
  item.media.forEach(closeMedia);
  item.sockets.forEach((s) => s.disconnect());
}
window.veloraCallDone = false;
window.veloraCallReport = null;
try {
  const config = await api("/config", {}),
    report = {
      startedAt: new Date().toISOString(),
      stages: [],
      passed: false,
      scope: config.mediaAddressOverride
        ? "Host-local synthetic voice over real Call Service/SFU; fixture candidate override, no Internet UDP or TURN validation"
        : "Browser synthetic voice over real Call Service/SFU; excludes native UI, push delivery and video",
      mediaAddressOverridden: Boolean(config.mediaAddressOverride),
    };
  for (const stage of config.stages) {
    const live = [],
      result = {
        calls: stage.calls,
        seconds: stage.seconds,
        pairs: [],
        passed: false,
      };
    try {
      for (const pair of config.pairs.slice(0, stage.calls)) {
        assertRunning();
        live.push(await setupPair(pair, config));
      }
      // Ignore setup ramp; simultaneous media measurement begins only now.
      await delay(2000);
      const holdStartedAt = Date.now();
      const previous = await Promise.all(
        live.flatMap((x) => x.media.map(sample)),
      );
      const minBytes = previous.map((x) => x.bytes),
        minPackets = previous.map((x) => x.packets);
      let stalled = false;
      for (let seconds = 0; seconds < stage.seconds; seconds += 5) {
        await delay(Math.min(5, stage.seconds - seconds) * 1000);
        assertRunning();
        const dropped = live.flatMap((x) => x.sockets.filter((s) => !s.connected));
        if (dropped.length) {
          const error = new Error("socket disconnected");
          // Client-side reasons only (socket.io close reasons); no ids or tokens.
          error.disconnects = dropped.map((s) => ({
            reason: String(s.disconnectReason ?? "unknown").slice(0, 40),
            atSecond: s.disconnectedAt
              ? Math.round((s.disconnectedAt - holdStartedAt) / 1000)
              : null,
          }));
          throw error;
        }
        const current = await Promise.all(
          live.flatMap((x) => x.media.map(sample)),
        );
        current.forEach((x, i) => {
          if (x.bytes <= previous[i].bytes || x.packets <= previous[i].packets)
            stalled = true;
          previous[i] = x;
        });
        window.veloraCallProgress = {
          stage: report.stages.length + 1,
          calls: live.length,
          seconds: Math.min(seconds + 5, stage.seconds),
          stalled,
        };
      }
      live.forEach((x, i) =>
        result.pairs.push({
          roomId: x.roomId,
          callId: x.callId,
          inviteAcceptMs: x.inviteAcceptMs,
          transportSetupMs: x.transportSetupMs,
          audio: x.media.map((_, j) => ({
            bytes: previous[i * 2 + j].bytes - minBytes[i * 2 + j],
            packets: previous[i * 2 + j].packets - minPackets[i * 2 + j],
            lost: previous[i * 2 + j].lost,
            jitterSeconds: previous[i * 2 + j].jitter,
          })),
        }),
      );
      for (let i = 0; i < live.length; i++)
        result.pairs[i].iceRoutes = await Promise.all(
          live[i].media.map(iceRoute),
        );
      for (let i = 0; i < live.length; i++)
        result.pairs[i].connectivity = await Promise.all(
          live[i].media.map(connectivity),
        );
      if (stalled) throw new Error("media stalled");
      result.passed = true;
    } catch (e) {
      result.failure = safeFailure(e);
      if (e.callFailure) result.failedPair = e.callFailure;
      if (e.disconnects) result.disconnects = e.disconnects;
    } finally {
      for (const x of live) {
        await cleanupPair(x);
        result.cleanup ??= [];
        result.cleanup.push({ callId: x.callId, receipts: x.cleanup });
      }
    }
    if (result.cleanup?.some((x) => !x.receipts.includes("call_left")))
      result.passed = false;
    report.stages.push(result);
    if (!result.passed) break;
    await delay(10000);
  }
  report.passed =
    report.stages.length === config.stages.length &&
    report.stages.every((s) => s.passed);
  report.finishedAt = new Date().toISOString();
  window.veloraCallReport = report;
} catch (e) {
  window.veloraCallReport = { passed: false, failure: safeFailure(e) };
} finally {
  window.veloraCallDone = true;
}
