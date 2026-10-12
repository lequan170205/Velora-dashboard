import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
const root = new URL("../.call-stress-agent/", import.meta.url).pathname;
await mkdir(root, { recursive: true });
await build({
  entryPoints: ["scripts/stress/call-media/browser.mjs"],
  bundle: true,
  platform: "browser",
  format: "esm",
  outfile: root + "browser.mjs",
});
const nodeOptions = {
  bundle: true,
  platform: "node",
  format: "esm",
  banner: {
    js: "import {createRequire as __nodeRequire} from 'node:module'; var require=__nodeRequire(import.meta.url);",
  },
  external: ["bufferutil", "utf-8-validate"],
};
await build({
  ...nodeOptions,
  entryPoints: ["scripts/stress/call-media/run.mjs"],
  outfile: root + "runner.mjs",
});
await build({
  ...nodeOptions,
  entryPoints: ["scripts/stress/call-media/agent.mjs"],
  outfile: root + "agent.mjs",
});
console.log("Built isolated call agent; fixtures are not embedded.");
