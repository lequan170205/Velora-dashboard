import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, mkdir, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
const exec = promisify(execFile),
  docker = "/opt/homebrew/bin/docker";
export async function dockerJson(container, code) {
  const { stdout } = await exec(
    docker,
    ["exec", container, "node", "-e", code],
    { timeout: 40000, maxBuffer: 100000 },
  );
  const line = stdout.split("\n").findLast((x) => x.startsWith("{"));
  if (!line) throw new Error("Runtime audit unavailable");
  return JSON.parse(line);
}
export async function callState(config) {
  const code = `const Redis=require('ioredis');const r=new Redis({host:process.env.REDIS_HOST,port:Number(process.env.REDIS_PORT),password:process.env.REDIS_PASSWORD,tls:(process.env.REDIS_HOST||'').includes('upstash')?{servername:process.env.REDIS_HOST}:undefined,maxRetriesPerRequest:1,connectTimeout:5000,lazyConnect:true});(async()=>{try{await r.connect();const users=${JSON.stringify(config.accounts.map((x) => x.id))},rooms=${JSON.stringify(config.rooms.map((x) => x.id))};const a=await r.hmget('call:sessions:active-by-user',...users),g=await r.mget(...rooms.map(id=>'call:conversation:'+id+':active-group'));const states=[];for(const id of [...new Set([...a,...g].filter(Boolean))]){const raw=await r.get('call:'+id+':session');states.push(raw?JSON.parse(raw).status:'missing');}console.log(JSON.stringify({activeUserPointers:a.filter(Boolean).length,statuses:states}));}finally{r.disconnect();}})().catch(()=>process.exitCode=1)`;
  return dockerJson("microservices-boilerplate-call-service-1", code);
}
export async function fixtureTokens(config) {
  const code = `const{PrismaClient}=require('@prisma/notification-client');const u=new URL(process.env.NOTIFICATION_DATABASE_URL);u.searchParams.set('connection_limit','1');u.searchParams.set('pool_timeout','10');const p=new PrismaClient({datasources:{db:{url:u.toString()}}});(async()=>{try{const n=await p.pushToken.count({where:{userId:{in:${JSON.stringify(config.accounts.map((x) => x.id))}},isActive:true}});console.log(JSON.stringify({active:n}));}finally{await p.$disconnect();}})().catch(()=>process.exitCode=1)`;
  return dockerJson("microservices-boilerplate-notification-service-1", code);
}
export async function ownedSessions(config, report) {
  const ids = config.accounts.map((x) => x.id),
    scope = {
      ids,
      start: report.startedAt,
      end: report.finishedAt,
      maxSessions: report.authentication.logins,
    };
  const code = `const fs=require('fs'),crypto=require('crypto'),{PrismaClient}=require('@prisma/auth-client');const scope=${JSON.stringify(scope)};const url=new URL(process.env.AUTH_DATABASE_URL);url.searchParams.set('connection_limit','1');url.searchParams.set('pool_timeout','10');const where={userId:{in:scope.ids},revoked:false,createdAt:{gte:new Date(Date.parse(scope.start)-2000),lte:new Date(Date.parse(scope.end)+2000)}};const make=()=>new PrismaClient({datasources:{db:{url:url.toString()}}});(async()=>{const p=make();let rows;try{rows=await p.refreshToken.findMany({where,select:{encryptedToken:true},take:scope.maxSessions+1});}finally{await p.$disconnect();}if(rows.length>scope.maxSessions)throw new Error('scope');const key=crypto.createHash('sha256').update('velora-refresh-token:'+process.env.JWT_SECRET).digest();let failed=0;for(const row of rows){const [iv,tag,cipher]=row.encryptedToken.split('.');const d=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64url'));d.setAuthTag(Buffer.from(tag,'base64url'));const token=Buffer.concat([d.update(Buffer.from(cipher,'base64url')),d.final()]).toString('utf8');try{const q=await fetch('http://api-gateway:3000/auth/mobile/logout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({refreshToken:token}),signal:AbortSignal.timeout(10000)});if(!q.ok)failed++;}catch{failed++;}}const q=make();let active;try{active=await q.refreshToken.count({where});}finally{await q.$disconnect();}console.log(JSON.stringify({active,failed,pool:1}));})().catch(()=>process.exitCode=1)`;
  return dockerJson("microservices-boilerplate-auth-service-1", code);
}
async function metric(query) {
  const r = await fetch(
    "http://127.0.0.1:9090/api/v1/query?" + new URLSearchParams({ query }),
    { signal: AbortSignal.timeout(4000) },
  );
  if (!r.ok) throw new Error("Metrics unavailable");
  const d = await r.json(),
    v = d.data?.result;
  if (
    !Array.isArray(v) ||
    v.length !== 1 ||
    !Number.isFinite(Number(v[0].value[1]))
  )
    throw new Error("Metrics unavailable");
  return Number(v[0].value[1]);
}
export async function resources() {
  const queries = {
    rooms: "sum(velora_call_mediasoup_worker_rooms)",
    sockets: "sum(velora_call_socket_connections)",
    workerCpu: "max(rate(velora_call_mediasoup_worker_cpu_seconds_total[1m]))",
    callMemory:
      'sum(velora_process_resident_memory_bytes{service="call-service"})',
    hostCpu:
      '1-avg(rate(node_cpu_seconds_total{job="node-exporter",mode="idle"}[1m]))',
  };
  const values = await Promise.all(
    Object.entries(queries).map(async ([k, v]) => [k, await metric(v)]),
  );
  return { at: new Date().toISOString(), ...Object.fromEntries(values) };
}
export async function pipelineReady() {
  const v = await Promise.all([
    metric("velora_conversation_notification_outbox_pending"),
    metric("sum(velora_notification_jobs_outstanding)"),
    metric("velora_notification_backlog_sample_up"),
    metric("velora_notification_backlog_last_sample_timestamp_seconds"),
    metric("velora_notification_database_up"),
    metric('up{job="call-service"}'),
  ]);
  return (
    v[0] === 0 &&
    v[1] === 0 &&
    v[2] === 1 &&
    Date.now() / 1000 - v[3] < 45 &&
    v[4] === 1 &&
    v[5] === 1
  );
}
export async function runtime() {
  const marker = await readFile(
    join(homedir(), ".local/state/velora/deployed-sha"),
    "utf8",
  );
  const { stdout } = await exec(
    docker,
    [
      "inspect",
      "microservices-boilerplate-call-service-1",
      "microservices-boilerplate-api-gateway-1",
      "microservices-boilerplate-auth-service-1",
      "microservices-boilerplate-notification-service-1",
    ],
    { timeout: 15000, maxBuffer: 2000000 },
  );
  const cs = JSON.parse(stdout);
  if (cs.some((c) => !c.State.Running || c.State.Restarting))
    throw new Error("Runtime unavailable");
  return {
    deployed: marker.trim(),
    containers: cs.map((c) => ({
      name: c.Name,
      image: c.Config.Image,
      startedAt: c.State.StartedAt,
      restarts: c.RestartCount,
    })),
  };
}
export async function lanAddress() {
  const { stdout: route } = await exec("/sbin/route", ["-n", "get", "default"]);
  const name = route.match(/interface:\s*(\S+)/)?.[1];
  if (!name) throw new Error("LAN address unavailable");
  const { stdout } = await exec("/usr/sbin/ipconfig", ["getifaddr", name]);
  return stdout.trim();
}
export async function prepareBrowser(root, signal) {
  const target = join(
    root,
    "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  );
  try {
    await stat(target);
    return target;
  } catch {}
  await mkdir(root, { recursive: true, mode: 0o700 });
  const { stdout } = await exec("/bin/df", ["-k", root]);
  const free = Number(stdout.trim().split("\n").at(-1).trim().split(/\s+/)[3]);
  if (free < 2 * 1024 * 1024) throw new Error("Browser preparation failed");
  if (process.platform !== "darwin" || process.arch !== "arm64")
    throw new Error("Browser preparation failed");
  const response = await fetch(
    "https://storage.googleapis.com/chrome-for-testing-public/155.0.8059.39/mac-arm64/chrome-mac-arm64.zip",
    { signal },
  );
  if (!response.ok) throw new Error("Browser preparation failed");
  const archive = join(root, "browser.zip");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const { open } = await import("node:fs/promises");
  const file = await open(archive, "w", 0o600);
  let count = 0;
  try {
    for await (const chunk of response.body) {
      count += chunk.length;
      if (count > 250000000) throw new Error("Browser preparation failed");
      await file.write(chunk);
    }
  } finally {
    await file.close();
  }
  const { stdout: names } = await exec("/usr/bin/unzip", ["-Z1", archive], {
    timeout: 15000,
    maxBuffer: 2000000,
  });
  if (
    names
      .split("\n")
      .filter(Boolean)
      .some(
        (name) =>
          name.startsWith("/") ||
          name.split("/").includes("..") ||
          !name.startsWith("chrome-mac-arm64/"),
      )
  )
    throw new Error("Browser preparation failed");
  await exec("/usr/bin/ditto", ["-x", "-k", archive, root], { timeout: 60000 });
  await rm(archive, { force: true });
  await stat(target);
  return target;
}
