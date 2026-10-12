// Upload code only; send protected fixture credentials directly into the companion's stdin.
import { readFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { validateConfig } from "./stress/runner.mjs";
import { choosePairs } from "./stress/call-media/plan.mjs";
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--manifest")
  throw new Error("Use --manifest with a protected fixture file");
if ((await stat(args[1])).mode & 0o077)
  throw new Error("Fixture file must be private (0600)");
let config;
try {
  config = validateConfig(JSON.parse(await readFile(args[1], "utf8")));
} catch {
  throw new Error("Invalid fixture file; private details withheld");
}
if (config.baseUrl !== "https://velora-app.me")
  throw new Error("Companion is limited to the established Velora origin");
choosePairs(config, 5);
const files = Object.fromEntries(
  await Promise.all(
    ["agent.mjs", "runner.mjs", "browser.mjs"].map(async (name) => [
      name,
      (
        await readFile(
          new URL("../.call-stress-agent/" + name, import.meta.url),
        )
      ).toString("base64"),
    ]),
  ),
);
const codeHash = createHash("sha256")
  .update(JSON.stringify(files))
  .digest("hex");
const fixtureHash = createHash("sha256")
  .update(
    JSON.stringify({
      users: config.accounts.map((x) => x.id),
      rooms: config.rooms.map((x) => x.id),
    }),
  )
  .digest("hex");
const scope =
  "velora-call-agent-" + randomUUID().replaceAll("-", "").slice(0, 12);
const remote = String.raw`
import sys,json,os,subprocess,time,urllib.request,signal,shlex,base64,shutil
from pathlib import Path
p=json.load(sys.stdin)
state=Path.home()/'.local/state/velora-call-stress'
state.mkdir(parents=True,exist_ok=True,mode=0o700)
metadata=state/'agent.json'
def health():
 try:
  with urllib.request.urlopen('http://127.0.0.1:18944/health',timeout=2) as r:return json.load(r)
 except:return None
old=json.loads(metadata.read_text()) if metadata.exists() else None
live=health()
if live:
 if not old:raise SystemExit('Port is occupied by an unowned companion; left unchanged')
 if live.get('busy'):raise SystemExit('A run is active; companion left unchanged')
 command=subprocess.check_output(['ps','-p',str(old['pid']),'-o','command='],text=True).strip()
 parts=shlex.split(command)
 expected=str(Path.home()/'Downloads'/old['scope']/'agent.mjs')
 if len(parts)<2 or parts[0]!='/opt/homebrew/bin/node' or parts[1]!=expected:raise SystemExit('Companion ownership could not be verified')
 if old.get('codeHash')==p['codeHash'] and old.get('fixtureHash')==p['fixtureHash']:
  print(json.dumps({'ready':True,'reused':True,'scope':old['scope']}));sys.exit(0)
 os.kill(old['pid'],signal.SIGTERM)
 for _ in range(40):
  if not health():break
  time.sleep(1)
 if health():raise SystemExit('Previous companion is still cleaning up')
root=Path.home()/'Downloads'/p['scope']
root.mkdir(mode=0o700)
for name,data in p['files'].items():
 target=root/name;target.write_bytes(base64.b64decode(data));target.chmod(0o600)
log=open(root/'agent.log','wb');os.chmod(root/'agent.log',0o600)
child=subprocess.Popen(['/opt/homebrew/bin/node',str(root/'agent.mjs')],stdin=subprocess.PIPE,stdout=log,stderr=log,start_new_session=True)
child.stdin.write(json.dumps(p['config']).encode());child.stdin.close();log.close()
metadata.write_text(json.dumps({'pid':child.pid,'scope':p['scope'],'codeHash':p['codeHash'],'fixtureHash':p['fixtureHash']}));metadata.chmod(0o600)
for _ in range(30):
 if child.poll() is not None:raise SystemExit('Companion failed to start; private details withheld')
 if health():print(json.dumps({'ready':True,'reused':False,'scope':p['scope']}));break
 time.sleep(1)
else:
 child.terminate();raise SystemExit('Companion start timed out')
`;
const child = spawn(
  "ssh",
  [
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=12",
    "ssh.velora-app.me",
    "python3 -c " + "'" + remote.replaceAll("'", "'\\''") + "'",
  ],
  { stdio: ["pipe", "pipe", "pipe"] },
);
let output = "",
  error = "";
child.stdout.on("data", (c) => {
  output += c;
  if (output.length > 10000) child.kill();
});
child.stderr.on("data", (c) => {
  error += c;
  if (error.length > 10000) child.kill();
});
child.stdin.end(
  JSON.stringify({ files, codeHash, fixtureHash, scope, config }),
);
const timer = setTimeout(() => child.kill(), 90000);
const code = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", resolve);
});
clearTimeout(timer);
if (code !== 0)
  throw new Error(
    "Companion launch rejected or failed. Check for an active run or occupied loopback port; private details withheld.",
  );
const result = JSON.parse(output);
console.log(
  JSON.stringify(
    {
      ready: result.ready,
      reused: result.reused,
      scope: result.scope,
      dashboard: "https://dashboard.velora-app.me/#/stress-test/calls",
      lifetimeHours: 8,
      fixturesStoredOnDisk: false,
    },
    null,
    2,
  ),
);
