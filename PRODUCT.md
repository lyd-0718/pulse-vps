# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary user:** The VPS owner (solo operator) managing 3–4 personal VPS servers, checking the dashboard from desktop and mobile browsers.
- **Unauthenticated visitors (secondary / incidental):** Anyone who lands on `vps.ydiws.xyz` without logging in sees a masked, read-only overview (IP addresses redacted, administrative mutations locked) rather than full management controls.

## Product Purpose

Provide a single, customizable personal monitoring console for 3–4 VPS instances that stays completely isolated from the monitored servers themselves. Success means the owner can open `vps.ydiws.xyz` at any time and immediately complete four core jobs:

1. Scan online status, CPU/memory/disk health, real-time Rx/Tx throughput, and remaining monthly traffic quota across all servers.
2. Diagnose multi-ISP network latency spikes and external site availability (including the owner's existing services such as `sub.ydiws.xyz`).
3. Inspect Docker container health and per-container CPU/memory usage on each host.
4. Track VPS renewal expiry countdowns, provider specs, and normalized monthly/annual holding costs.

## Positioning

Unlike self-hosted monitoring stacks (which go down when the host VPS fails) or heavy multi-tenant SaaS monitoring tools, PulseVPS runs its entire web frontend, API, D1 storage, and independent external edge prober on the owner's own Cloudflare Free account, paired with a single-binary pure-Go push agent (`CGO_ENABLED=0`) on each VPS—giving full architectural isolation, zero extra hosting cost, and full code-level customization.

## Operating Context

- **Hosting & isolation:** Deployed to Cloudflare (`Workers + D1 + Static Assets`) on custom domain `vps.ydiws.xyz` under the owner's Cloudflare Free account, coexisting strictly alongside an existing Worker (`sub-worker` on `sub.ydiws.xyz`).
- **Two runtime modes:** Ships with a built-in **Demo mode** (4 simulated VPS nodes ticking every 3 seconds) for local preview and UX iteration, plus a **Live mode** backed by D1 and real Go agents.
- **Agent lifecycle:** Each VPS runs a lightweight compiled Go binary (`pulse-vps-agent`, Linux `amd64`/`arm64`) installed via `/install.sh` with a per-node bearer token (stored SHA-256 hashed in D1), pushing metrics, Docker stats via `/var/run/docker.sock`, and TCPing/HTTP probe results on an interval.
- **Admin access:** Owner authenticates via admin password (`ADMIN_PASSWORD`) + HMAC-SHA256 token (`JWT_SECRET`) to add/edit/delete nodes, rotate tokens, manage probe targets, and edit site settings.

## Capabilities and Constraints

### Confirmed Capabilities
- **Host telemetry:** Real-time CPU, load average, memory/swap, disk, uptime, Rx/Tx bandwidth speed, and historical metric retention (`1h` / `6h` / `24h` / `7d`) with 1-minute throttled D1 writes.
- **Monthly traffic quota accounting:** Reboot-safe cycle byte tracking per node with configurable monthly GB limit and reset day.
- **Docker container monitoring:** Per-node container inventory, status, CPU percentage, and memory usage/limit.
- **Dual-perspective probing:** VPS-side TCPing/HTTP latency probes reported by Go agents, plus Cloudflare Cron (`*/2 * * * *`) external HTTP availability probes.
- **Asset & billing ledger:** Provider, region, specs, price, currency conversion (`CNY` / `USD` / `EUR`), billing cycle normalization, auto-renew status, notes, and expiry countdown.

### Hard Constraints
- **Cloudflare Free tier ceiling:** Must stay comfortably inside Cloudflare Workers Free plan quotas (100k requests/day, D1 100k writes/day, Cron triggers) and **never interfere with or modify the existing `sub-worker` (`sub.ydiws.xyz`)**.
- **Deployment gate:** Remote Cloudflare deployment and remote DNS/Worker mutations happen only upon explicit owner approval.

### Open / Undecided Product Facts
- **Final brand name:** Currently using `PulseVPS`; not locked if the owner later decides to rename it.
- **Alert notifications:** Outage, quota-threshold, and expiry push alerts (e.g., Telegram / Webhook) are not yet built and remain undecided.
- **Remote control actions:** Whether to keep the console strictly read-only or add remote container/host actions later is undecided.

## Brand Commitments

- **Working name & domain:** `PulseVPS` (`vps.ydiws.xyz`), Chinese primary UI copy (`zh-CN`).
- **Owner-pinned interface constraints (binding):** Light-mode Apple Liquid Glass visual direction (no dark mode as the default/primary look; no high-frequency vertical-stripe backgrounds that clash optically behind glass panels).

## Evidence on Hand

- **Working full-stack implementation:** Frontend (`src/`), Cloudflare Worker API & Cron prober (`worker/`), D1 schema (`migrations/0001_init.sql`), pure-Go agent (`agent/`), and build/deploy scripts (`scripts/build-agent.sh`, `scripts/deploy-cf.sh`).
- **Verified local end-to-end data:** Built-in 4-node Demo dataset (`src/lib/demo-data.ts`) and local live-agent reporting verified against `wrangler dev` + local D1 (`http://127.0.0.1:8787/`).
- **Verified Cloudflare account capacity (read-only audit):** `ydiws.xyz` active on Workers Free plan; `sub-worker` uses ~650 req/day and 0 D1 databases; `vps.ydiws.xyz` is currently unassigned.
- **Absences (do not fabricate):** No real production VPS telemetry, customer testimonials, SLA guarantees, or live remote Cloudflare deployment yet.

## Product Principles

1. **Isolation first:** The monitoring plane lives on Cloudflare, independent of every monitored VPS, so a host outage is immediately visible rather than silencing the monitor.
2. **At-a-glance clarity over dashboard bloat:** Designed for 3–4 personal nodes—surface live status, speed, quota, containers, latency, and expiry cleanly without enterprise-monitoring noise.
3. **Zero-cost, low-footprint operation:** Keep Worker requests, D1 write frequency, and Go agent CPU/RAM overhead minimal to stay effortlessly within Cloudflare Free limits and tiny VPS specs.
4. **Safe defaults with instant owner control:** Mask sensitive host details for unauthenticated visits while giving the authenticated owner full node, probe, and asset management in one place.
