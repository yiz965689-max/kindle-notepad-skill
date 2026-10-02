---
name: kindle-note
description: Build, adapt, deploy, or troubleshoot Kindle Note, a reminders and weather dashboard for an already-jailbroken Kindle with a phone web editor. Use for this e-ink dashboard workflow, not generic Kindle reading, jailbreak installation, or unrelated websites.
---

# Kindle Note

Provide a self-hosted phone editor and a low-power e-ink dashboard. The included baseline is **V6 power-button fix, experimental**. Do not describe it as universally compatible or fully device-verified.

## Start with the actual device

Read [compatibility and evidence](references/compatibility.md) before device changes. Ask only for missing model, firmware, screen dimensions, jailbreak/launcher status, and intended power behavior. Do not ask for a full serial number. The assets target PW4, 1072×1448, firmware 5.18.1.1.1, Linux ARMv7; other devices require adaptation.

Distinguish requests to explain, diagnose, package, deploy, and publish. This skill is not authorization to jailbreak, factory-reset, update firmware, publish a repository, purchase hosting, or alter unrelated services. Stop when a physical Kindle action is needed, state that single action, and resume after confirmation. Safely eject USB storage yourself when tools permit.

## Choose the work

- **New instance / server:** read [deployment](references/deployment.md). Use `scripts/create-instance.mjs` to copy clean assets and generate independent credentials outside the public repository. Use the user's chosen host, never the original author's infrastructure. Single Node process and private reverse-proxy network are correctness/security requirements of this baseline.
- **USB installation / power / touch:** read [device lifecycle](references/device.md). Build the included touch helper, seed a valid cached image with `scripts/seed-device.mjs`, back up exact targets, then copy the staged files. Do not automatically install just because USB is mounted.
- **Troubleshooting:** read [known failures](references/troubleshooting.md). Collect bounded, relevant logs locally; redact tokens, tasks and precise location from public output. Do not infer successful suspend or synchronization from a static e-ink picture.
- **Sharing / release:** read [release checklist](references/release.md). Use the repository's `scripts/audit-release.mjs`; build from a whitelist, not the user's working directory. A request for an uploadable package does not request an actual GitHub push.

## Invariants

- Phone editing is a draft until **Upload to Kindle**; uploaded means server saved, not device displayed. Awake mode checks a lightweight revision roughly every five seconds. Deep sleep cannot receive immediate uploads.
- Task image, hit map, and revision must describe the same snapshot. Preserve CAS conflict checks, durable pending actions, idempotency receipts, and stale-image input blocking. Never silently rebase an old completion on a different task list.
- Use independent ADMIN and DEVICE credentials. Never copy ADMIN credentials to Kindle. Browser keys become secure cookies; do not remove authentication to avoid repeated login.
- Deep sleep stops normal timers. RTC work wakes the system, refreshes, and returns to sleep. Do not promise exact minute boundaries, no frontlight flash, or a battery-life figure without device evidence.
- On this baseline, `preventScreenSaver=1` also blocks manual sleep. V6 uses `touchScreenSaverTimeout=1` while active instead. Stop those timer resets when sleeping.
- This firmware's `sleep` rejects fractional seconds. Use the compiled helper's `--delay-ms` mode; do not reintroduce `sleep 0.1`.
- Never stop the main framework/cvm. Retain the stable-start gate, exact awesome PID/start-time ownership, USB abort, cleanup, and watchdog. No forced home launch during USB transitions.

## Validation and handoff

Run backend tests, shell syntax checks, helper compilation, and relevant lifecycle simulations. These do not replace physical validation. Keep a rollback copy and use one consolidated device test of at most three minutes where possible. Longer battery/deep-sleep observation should happen during normal use, not repeated forced waiting.

Report what was changed, what was tested, what remains unverified, and the next required manual step. Do not claim successful installation, eject, deployment, or GitHub publication without a corresponding successful operation.
