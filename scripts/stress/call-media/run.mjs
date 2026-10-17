// Isolated Chrome profile, existing fixture auth, real SFU voice, bounded pilot.
import { readFile, writeFile, stat, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import WebSocket from "ws";
import { AuthManager, validateConfig } from "../runner.mjs";
import { choosePairs, MAX_CONCURRENT_CALLS, safeFailure } from "./plan.mjs";
import { privateIpv4 } from "./media-path.mjs";
const dependencyRequire = createRequire(import.meta.url);
const dir = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2),
  value = (k) => args[args.indexOf(k) + 1];
let rawConfig;
if (args.includes("--manifest-stdin")) {
  if (args.includes("--manifest"))
    throw new Error("choose one manifest source");
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 150000) throw new Error("oversized manifest");
  }
  try {
    rawConfig = JSON.parse(input);
  } catch {
    throw new Error("Invalid private manifest; details withheld");
  }
} else {
  if (!args.includes("--manifest")) throw new Error("--manifest required");
  const manifest = value("--manifest"),
    mode = (await stat(manifest)).mode;
  if (mode & 0o077) throw new Error("Manifest must be private (0600)");
  try {
    rawConfig = JSON.parse(await readFile(manifest, "utf8"));
  } catch {
    throw new Error("Invalid private manifest; details withheld");
  }
}
const config = validateConfig(rawConfig);
const mediaAddressOverride = args.includes("--lan-media-address")
  ? value("--lan-media-address")
  : undefined;
if (args.includes("--lan-media-address") && !privateIpv4(mediaAddressOverride))
  throw new Error("host-local media requires a private IPv4");
if (config.baseUrl !== "https://velora-app.me")
  throw new Error("Pilot is limited to the established public origin");
const demo = args.includes("--demo"),
  calls = args.includes("--calls") ? Number(value("--calls")) : 1;
if (args.includes("--calls") && demo)
  throw new Error("choose separate stage or legacy demo");
if (!Number.isInteger(calls) || calls < 1 || calls > MAX_CONCURRENT_CALLS)
  throw new Error(`calls must be 1..${MAX_CONCURRENT_CALLS}`);
// Hold time per stage; the default keeps the established 20/30 s windows.
const holdSeconds = args.includes("--seconds")
  ? Number(value("--seconds"))
  : undefined;
if (
  holdSeconds !== undefined &&
  (!Number.isInteger(holdSeconds) || holdSeconds < 10 || holdSeconds > 900)
)
  throw new Error("seconds must be 10..900");
if (holdSeconds !== undefined && demo)
  throw new Error("choose separate stage or legacy demo");
const stages = demo
  ? [
      { calls: 1, seconds: 30 },
      { calls: 3, seconds: 30 },
      { calls: 5, seconds: 30 },
    ]
  : [{ calls, seconds: holdSeconds ?? (calls === 1 ? 20 : 30) }];
const pairs = choosePairs(config, demo ? 5 : calls),
  selected = new Set(pairs.flatMap((p) => [p.caller, p.callee]));
if (args.includes("--plan")) {
  console.log(
    JSON.stringify({
      network: false,
      baseUrl: config.baseUrl,
      fixtureUsers: selected.size,
      distinctRooms: pairs.length,
      stages,
      media: mediaAddressOverride
        ? "Host-local fixture candidate override over real WebRTC/SFU"
        : "Synthetic audio over real WebRTC/SFU",
      internetUdpValidated: false,
      excludes: [
        "native call UI",
        "FCM/APNs delivery",
        "video",
        "production capacity estimate",
      ],
    }),
  );
  process.exit(0);
}
if (!args.includes("--run") || !args.includes("--output"))
  throw new Error("Use --plan first; actual run requires --run --output");
const output = value("--output");
try {
  await stat(output);
  throw new Error("Refusing to overwrite report");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const controller = new AbortController(),
  auth = new AuthManager(config, { signal: controller.signal }),
  key = randomUUID();
const timeout = setTimeout(() => controller.abort(), 600000);
process.on("SIGINT", () => controller.abort());
process.on("SIGTERM", () => controller.abort());
const startedAt = new Date().toISOString();
let chrome,
  profile,
  server,
  cdp,
  report,
  seq = 0,
  lastProgress = null,
  browserExit = null,
  lastBrowserCommand = null;
const pending = new Map();
async function command(method, params = {}) {
  lastBrowserCommand = method;
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      pending.delete(id);
      reject(new Error("browser timeout"));
    }, 15000);
    pending.set(id, {
      resolve: (x) => {
        clearTimeout(t);
        resolve(x);
      },
      reject: (e) => {
        clearTimeout(t);
        reject(e);
      },
    });
    cdp.send(JSON.stringify({ id, method, params }));
  });
}
const sleep = (ms) =>
  new Promise((resolve, reject) => {
    if (controller.signal.aborted) return reject(new Error("operator stop"));
    const t = setTimeout(() => {
      controller.signal.removeEventListener("abort", stop);
      resolve();
    }, ms);
    const stop = () => {
      clearTimeout(t);
      reject(new Error("operator stop"));
    };
    controller.signal.addEventListener("abort", stop, { once: true });
  });
try {
  // Live membership verified before any call; no direct DB connection needed.
  for (const p of pairs) {
    const account = config.accounts.find((a) => a.id === p.caller),
      token = await auth.token(account);
    const d = await auth.request("/conversations/" + p.roomId, null, { token }),
      ids = d.participantIds ?? d.participants?.map((p) => p.id);
    if (
      d.isGroup !== true ||
      !Array.isArray(ids) ||
      JSON.stringify([...ids].sort()) !==
        JSON.stringify([...p.participantIds].sort())
    )
      throw new Error("membership mismatch");
  }
  let bundle;
  if (args.includes("--browser-bundle"))
    bundle = await readFile(value("--browser-bundle"));
  else {
    const esbuild = dependencyRequire("esbuild");
    const built = await esbuild.build({
      entryPoints: [join(dir, "browser.mjs")],
      bundle: true,
      platform: "browser",
      format: "esm",
      write: false,
    });
    bundle = built.outputFiles[0].contents;
  }
  server = createServer(async (req, res) => {
    try {
      if (req.url === "/" && req.method === "GET") {
        res.setHeader("content-type", "text/html");
        res.end(
          '<!doctype html><meta charset="utf-8"><title>Velora isolated call pilot</title><script type="module" src="/app.js"></script>',
        );
        return;
      }
      if (req.url === "/app.js" && req.method === "GET") {
        res.setHeader("content-type", "application/javascript");
        res.end(bundle);
        return;
      }
      if (req.method !== "POST" || req.headers["x-run-key"] !== key) {
        res.writeHead(403);
        res.end();
        return;
      }
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 2048) throw new Error("oversized request");
      }
      const data = JSON.parse(body),
        send = (x) => {
          res.setHeader("cache-control", "no-store");
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(x));
        };
      if (req.url === "/config") {
        send({ baseUrl: config.baseUrl, pairs, stages, mediaAddressOverride });
        return;
      }
      if (req.url === "/token" && selected.has(data.id)) {
        send({
          token: await auth.token(
            config.accounts.find((a) => a.id === data.id),
          ),
        });
        return;
      }
      res.writeHead(404);
      res.end();
    } catch {
      res.writeHead(500);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  profile = await mkdtemp(join(tmpdir(), "velora-call-pilot-"));
  chrome = spawn(
    args.includes("--chrome")
      ? value("--chrome")
      : "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    [
      "--headless=new",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--autoplay-policy=no-user-gesture-required",
      "--remote-debugging-port=0",
      "--user-data-dir=" + profile,
      "about:blank",
    ],
    { stdio: "ignore", detached: true },
  );
  chrome.on("exit", (code, signal) => {
    browserExit = { code, signal };
  });
  let port;
  for (let i = 0; i < 60; i++) {
    try {
      port = Number(
        (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split(
          "\n",
        )[0],
      );
      break;
    } catch {
      await sleep(500);
    }
  }
  if (!port) throw new Error("browser timeout");
  const tabs = await fetch("http://127.0.0.1:" + port + "/json/list").then(
      (r) => r.json(),
    ),
    tab = tabs.find((t) => t.type === "page");
  cdp = new WebSocket(tab.webSocketDebuggerUrl);
  cdp.on("message", (raw) => {
    const x = JSON.parse(raw);
    if (!x.id) return;
    const p = pending.get(x.id);
    if (!p) return;
    pending.delete(x.id);
    x.error ? p.reject(new Error("browser timeout")) : p.resolve(x.result);
  });
  await new Promise((resolve, reject) => {
    cdp.once("open", resolve);
    cdp.once("error", reject);
  });
  await command("Page.navigate", {
    url: "http://127.0.0.1:" + server.address().port + "/#" + key,
  });
  while (!controller.signal.aborted) {
    await sleep(2000);
    const r = await command("Runtime.evaluate", {
      expression:
        "({done:window.veloraCallDone===true,progress:window.veloraCallProgress??null,report:window.veloraCallDone?window.veloraCallReport:null})",
      returnByValue: true,
    });
    const v = r.result.value;
    if (v?.progress) {
      lastProgress = v.progress;
      console.log(JSON.stringify(v.progress));
    }
    if (v?.done) {
      report = v.report;
      break;
    }
  }
  if (!report) throw new Error("operator stop");
} catch (e) {
  if (controller.signal.aborted && cdp?.readyState === WebSocket.OPEN) {
    try {
      await command("Runtime.evaluate", {
        expression: "window.veloraStopCallPilot?.()",
      });
      const end = Date.now() + 45000;
      while (Date.now() < end) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const r = await command("Runtime.evaluate", {
          expression: "window.veloraCallDone?window.veloraCallReport:null",
          returnByValue: true,
        });
        if (r.result.value) {
          report = r.result.value;
          break;
        }
      }
    } catch {}
  }
  report ??= {
    passed: false,
    failure: safeFailure(e),
    lastProgress,
    browserExit,
    lastBrowserCommand,
    finishedAt: new Date().toISOString(),
  };
} finally {
  clearTimeout(timeout);
  // Browser exit releases owned tracks/transports/sockets; normal server leave receipts are required for PASS.
  if (cdp) {
    try {
      await command("Browser.close");
    } catch {}
    cdp.close();
  }
  if (chrome && chrome.exitCode === null) {
    try {
      process.kill(-chrome.pid, "SIGTERM");
    } catch {}
    await new Promise((resolve) => {
      const t = setTimeout(() => {
        try {
          process.kill(-chrome.pid, "SIGKILL");
        } catch {}
        resolve();
      }, 3000);
      chrome.once("exit", () => {
        clearTimeout(t);
        resolve();
      });
    });
  }
  if (server) await new Promise((resolve) => server.close(resolve));
  report ??= { passed: false, failure: "operator stop" };
  report.startedAt = startedAt;
  report.finishedAt = new Date().toISOString();
  report.mediaAddressOverridden = Boolean(mediaAddressOverride);
  report.authentication = auth.stats;
  report.sessionCleanup = await auth.logoutAll();
  if (report.sessionCleanup.failed) report.passed = false;
  if (profile) await rm(profile, { recursive: true, force: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
}
console.log(
  JSON.stringify({
    passed: report.passed,
    failure: report.failure,
    stages: report.stages?.map((s) => ({
      calls: s.calls,
      passed: s.passed,
      failure: s.failure,
    })),
    sessionCleanup: report.sessionCleanup,
    output,
  }),
);
process.exitCode = report.passed ? 0 : 1;
