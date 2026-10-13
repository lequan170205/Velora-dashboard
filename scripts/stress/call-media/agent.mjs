import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateConfig } from "../runner.mjs";
import { choosePairs } from "./plan.mjs";
import { privateIpv4 } from "./media-path.mjs";
import { CallJobStore, JobConflict } from "./job-store.mjs";
import { adminAuthorizer } from "./agent-auth.mjs";
import { checked, failureMessages } from "./checks.mjs";
import {
  fixtureTokens,
  callState,
  pipelineReady,
  resources,
  runtime,
  lanAddress,
  prepareBrowser,
  ownedSessions,
} from "./native-ops.mjs";

const root = dirname(fileURLToPath(import.meta.url)),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function input() {
  let s = "";
  for await (const c of process.stdin) {
    s += c;
    if (s.length > 150000) throw new Error("Invalid fixture input");
  }
  return validateConfig(JSON.parse(s));
}
async function main() {
  const config = await input();
  if (
    config.baseUrl !== "https://velora-app.me" ||
    !/^velora-call-agent-[a-f0-9]{12}$/.test(root.split("/").at(-1))
  )
    throw new Error("Invalid agent scope");
  choosePairs(config, 5);
  const authorize = adminAuthorizer(config.baseUrl),
    browserRoot = join(root, "browser-cache");
  async function ready() {
    const state = await checked("Fixture state audit unavailable", () =>
      callState(config),
    );
    return (
      state.activeUserPointers === 0 &&
      !state.statuses.some((x) =>
        ["active", "accepting", "ringing", "initiated"].includes(x),
      ) &&
      (await checked("Pipeline metrics unavailable", pipelineReady))
    );
  }
  async function settle() {
    const end = Date.now() + 180000;
    while (
      !(await ready()) ||
      (await checked("Resource metrics unavailable", resources)).rooms !== 0
    ) {
      if (Date.now() > end) throw new Error("Cleanup incomplete");
      await sleep(5000);
    }
  }
  const store = new CallJobStore(
    async (job, signal, update) => {
      const jobRoot = join(root, "runs", job.id);
      await mkdir(jobRoot, { recursive: true, mode: 0o700 });
      let sampler,
        child,
        baseline,
        resourceBusy = false;
      const deadline = setTimeout(() => store.active?.abort.abort(), 900000);
      try {
        baseline = await checked("Runtime audit unavailable", runtime);
        const processes = await import("node:child_process").then(
          ({ execFileSync }) =>
            execFileSync("/bin/ps", ["-axo", "command="], { encoding: "utf8" }),
        );
        if (
          processes
            .split("\n")
            .some((row) =>
              /node .*velora-(?:call-local|chat-demo25)-[a-f0-9]{12}\//.test(
                row,
              ),
            )
        )
          throw new Error("Pipeline not settled");
        if (
          !(await ready()) ||
          (await checked("Resource metrics unavailable", resources)).rooms !== 0
        )
          throw new Error("Pipeline not settled");
        if (
          (
            await checked("Push token audit unavailable", () =>
              fixtureTokens(config),
            )
          ).active !== 0
        )
          throw new Error("Fixture not ready");
        const address = await checked("LAN address unavailable", lanAddress);
        if (!privateIpv4(address)) throw new Error("Fixture not ready");
        update({ phase: "prepare" });
        const chrome = await checked("Browser preparation failed", () =>
          prepareBrowser(browserRoot, signal),
        );
        sampler = setInterval(async () => {
          if (resourceBusy) return;
          resourceBusy = true;
          try {
            job.samples.push(await resources());
            if (job.samples.length > 240) job.samples.shift();
          } catch {
          } finally {
            resourceBusy = false;
          }
        }, 5000);
        for (const calls of job.preset === "demo" ? [1, 3, 5] : [1]) {
          if (signal.aborted) throw new Error("Stopped by operator");
          if (
            JSON.stringify(
              await checked("Runtime audit unavailable", runtime),
            ) !== JSON.stringify(baseline)
          )
            throw new Error("Deployment changed");
          if (!(await ready())) throw new Error("Pipeline not settled");
          update({ currentCalls: calls, phase: "setup", progress: null });
          const output = join(jobRoot, "call-" + calls + ".json");
          child = spawn(
            "/opt/homebrew/bin/node",
            [
              join(root, "runner.mjs"),
              "--manifest-stdin",
              "--calls",
              String(calls),
              "--lan-media-address",
              address,
              "--browser-bundle",
              join(root, "browser.mjs"),
              "--chrome",
              chrome,
              "--run",
              "--output",
              output,
            ],
            { stdio: ["pipe", "pipe", "pipe"] },
          );
          let buffer = "";
          child.stdout.on("data", (x) => {
            buffer += x;
            const lines = buffer.split("\n");
            buffer = lines.pop();
            if (buffer.length > 50000) buffer = "";
            for (const line of lines) {
              try {
                const p = JSON.parse(line);
                if (
                  Number.isFinite(p.seconds) &&
                  p.seconds >= 0 &&
                  p.seconds <= 30
                )
                  update({
                    phase: "measuring",
                    progress: {
                      seconds: p.seconds,
                      calls,
                      stalled: Boolean(p.stalled),
                    },
                  });
              } catch {}
            }
          });
          child.stderr.on("data", () => {});
          const stop = () => {
            try {
              child.kill("SIGINT");
            } catch {}
          };
          signal.addEventListener("abort", stop, { once: true });
          const complete = new Promise((resolve, reject) => {
            child.once("error", () => reject(new Error("Media failed")));
            child.once("exit", (code) => resolve(code));
          });
          child.stdin.end(JSON.stringify(config));
          if (signal.aborted) stop();
          let code;
          try {
            code = await complete;
          } finally {
            signal.removeEventListener("abort", stop);
            child = null;
          }
          let report;
          try {
            report = JSON.parse(await readFile(output, "utf8"));
          } catch {
            report = {
              passed: false,
              startedAt: job.startedAt,
              finishedAt: new Date().toISOString(),
              authentication: { logins: calls * 2 + 2 },
            };
          }
          const stage = report.stages?.[0],
            audio = stage?.pairs?.flatMap((p) => p.audio) ?? [];
          const receipt = {
            calls,
            seconds: calls === 1 ? 20 : 30,
            passed: false,
            packetsMin: audio.length
              ? Math.min(...audio.map((a) => a.packets))
              : null,
            packetsMax: audio.length
              ? Math.max(...audio.map((a) => a.packets))
              : null,
            reportedLost: audio.reduce((s, a) => s + a.lost, 0),
            jitterMs: audio.length
              ? Math.max(...audio.map((a) => a.jitterSeconds)) * 1000
              : null,
            leaveReceipts:
              stage?.cleanup?.filter((c) => c.receipts.includes("call_left"))
                .length ?? 0,
            logoutRevoked: report.sessionCleanup?.revoked ?? 0,
          };
          job.stages.push(receipt);
          update({ phase: "cleanup", progress: null });
          const sessions = await checked("Session audit unavailable", () =>
            ownedSessions(config, report),
          );
          await settle();
          if (
            sessions.active ||
            sessions.failed ||
            report.sessionCleanup?.failed ||
            code !== 0 ||
            !report.passed ||
            receipt.leaveReceipts !== calls ||
            receipt.logoutRevoked !== calls * 2
          )
            throw new Error(
              signal.aborted ? "Stopped by operator" : "Media failed",
            );
          if (
            JSON.stringify(
              await checked("Runtime audit unavailable", runtime),
            ) !== JSON.stringify(baseline)
          )
            throw new Error("Deployment changed");
          receipt.passed = true;
        }
        job.samples.push(
          await checked("Resource metrics unavailable", resources),
        );
      } catch (e) {
        job.failure = signal.aborted
          ? "Stopped by operator"
          : failureMessages.has(e.message)
            ? e.message
            : "Test or cleanup did not complete";
        throw e;
      } finally {
        clearTimeout(deadline);
        if (sampler) clearInterval(sampler);
        update({ phase: "cleanup" });
        if (child) {
          child.kill("SIGINT");
          await sleep(3000);
        }
        // Do not free the slot while owned fixture state is still settling.
        try {
          await settle();
        } catch {
          job.failure = "Cleanup incomplete";
        }
        while (resourceBusy) await sleep(20);
        if (job.failure === "Cleanup incomplete")
          throw new Error("Cleanup incomplete");
      }
    },
    {
      onFinished: (job) =>
        writeFile(
          join(root, "runs", job.id, "report.json"),
          JSON.stringify(job, null, 2) + "\n",
          { mode: 0o600 },
        ),
    },
  );
  const server = createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify(body));
    };
    if (req.method === "GET" && req.url === "/health") {
      send(200, { ready: true, busy: store.state().busy });
      return;
    }
    try {
      if (req.headers.origin) {
        send(403, { error: "Use the dashboard gateway" });
        return;
      }
      const actor = await authorize(
        req.headers.authorization?.replace(/^Bearer /, ""),
      );
      if (req.method === "GET" && req.url === "/runs") {
        send(200, {
          ...store.state(),
          fixtureParticipants: 10,
          fixtureRooms: 5,
        });
        return;
      }
      let text = "";
      for await (const c of req) {
        text += c;
        if (text.length > 4096) throw new Error("Invalid body");
      }
      if (req.method === "POST" && req.url === "/runs") {
        const job = store.start(actor.id, JSON.parse(text));
        send(202, job);
        return;
      }
      const stop = req.url?.match(/^\/runs\/([0-9a-f-]{36})\/stop$/i);
      if (req.method === "POST" && stop) {
        send(200, store.stop(stop[1]));
        return;
      }
      send(404, { error: "Not found" });
    } catch (e) {
      send(
        e instanceof JobConflict
          ? 409
          : e.message === "Unauthorized"
            ? 401
            : 400,
        { error: "Request rejected" },
      );
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(18944, "127.0.0.1", resolve);
  });
  console.log(
    "Call companion ready on loopback; fixture credentials remain in memory.",
  );
  async function close() {
    store.active?.abort.abort();
    const end = Date.now() + 210000;
    while (store.state().busy && Date.now() < end) await sleep(1000);
    // Never remove a browser binary or exit while its owned runner still uses it.
    if (store.state().busy) {
      setTimeout(() => void close(), 60000);
      return;
    }
    server.close();
    await rm(browserRoot, { recursive: true, force: true });
    process.exit(0);
  }
  process.once("SIGTERM", () => void close());
  process.once("SIGINT", () => void close());
  setTimeout(() => void close(), 8 * 60 * 60 * 1000);
}
main().catch(() => {
  console.error("Call companion could not start; private details withheld");
  process.exitCode = 1;
});
