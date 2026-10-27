# Call media test (real audio through the SFU)

`run.mjs` drives real WebRTC audio between fixture accounts with an isolated Chrome profile: it logs the pairs in, starts 1-N concurrent 1-1 calls, produces synthetic voice, and checks that every endpoint keeps receiving audio packets and that each call ends with a normal `call_left`. The dashboard runs it through the stress agent (**Gọi điện → Âm thanh thật**, or inside **Hỗn hợp**); see the top-level README.

```sh
node run.mjs --manifest /abs/private-manifest.json --run --calls 5 --seconds 60 \
  --lan-media-address 192.168.x.x --chrome "/abs/Google Chrome for Testing" --browser-bundle /abs/browser.js --output /abs/report.json
```

Use `pnpm stress:agent:build` to produce the bundled `media.mjs` / `browser.js`. Calls 1..20, seconds 10..900, manifest mode `0600`.

**PASS** means every endpoint received increasing inbound audio packets in every sample, every call produced a `call_left` receipt, and every fixture login was logged out.

This is **host-local SFU voice testing**: the test clients override the announced ICE candidate with the host's private LAN address and skip TURN, so it does not validate public UDP/TURN reachability, native push UI, video, real microphones, speech quality or a user-capacity limit. The generator shares the host's CPU with the services.
