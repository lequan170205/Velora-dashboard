# Presenting the stress test

Goal: show the committee that the system really runs under load, not just a final number.

## Before the session
1. The stress agent must be running on the homelab (the page shows **Ready** in the top right; if it says **Agent offline**, start it as described in the README).
2. Open https://dashboard.velora-app.me/#/stress-test as an admin and keep the tab visible.
3. Have the Velora app open on a phone or simulator, signed in as a test user who can message and call another test user.
4. Run **Chat messages → Light** once beforehand to check everything is connected.

## The demo (about 7 minutes)
1. Click **Present** (top right), then **Start demo**. It runs *Mixed → Campus 10k*: 2,000 sockets, 33 messages/s, 10 short-call pairs and, with Chrome on the agent, 10 long calls with real audio.
2. Narrate the phase bar: *open sockets → settle → steady load → wind down*.
3. Point at the live charts (taken from the production monitoring while the load runs): sockets climb to the 2,000 target, messages/s settles near 33, latency p95 stays flat, CPU shows RabbitMQ and Mongo as the busiest containers, and SFU rooms show the real-audio calls.
4. **While the steady load phase runs**, send a message and place a call from the phone. It should stay smooth; this is the strongest proof.
5. At the end the verdict appears (PASSED/FAILED with the criteria count, ack p95, call setup p95, peak CPU). **Exit** the presenter and use **Download JSON** to keep the numbers and the server samples.

## What the numbers mean (and do not)
- The load comes from 50 fixture accounts; each account stands for many devices. It runs on the same machine as the services, over loopback.
- It measures the chat and signaling path and the SFU with synthetic audio. It does not cover HTTP APIs, push notifications, video, or the public internet path.
- Rates on the charts use the monitoring service's one-minute window, so they lag a little behind the generator.
