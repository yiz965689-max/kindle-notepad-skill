# Compatibility and evidence

Baseline: Kindle Paperwhite 4 Wi-Fi, firmware 5.18.1.1.1, Linux 4.1.15 ARMv7, 1072×1448 Y8 framebuffer (stride 1088), Goodix type-B touchscreen `/dev/input/event2`. Device prerequisites: an already-working script launcher, LIPC, Upstart and FBInk at `/mnt/us/libkh/bin/fbink`. This is not a jailbreak distribution.

## Evidence as of 2026-10-02

User-confirmed on original device: in-place rendering without home-page mixing; online update; touch completion; V5 minute clock and faster touch; V6 fixed power-button sleep/wake (confirmed 2026-10-02).

Prior versions demonstrated RTC deep wake and Wi-Fi recovery. Do not represent that as full validation of the final combined V6 lifecycle. Final repeated sleep/sync/wake cycles, undo/offline recovery on physical hardware, very rapid power toggles, and multi-hour battery measurements remain separate validation work.

Local tests cover backend auth/CAS/idempotency/layout, draft upload behavior, power-state mocks and stale-screen blocking. Mocks cannot establish firmware behavior or absence of display flashes.

Known power finding: BusyBox on this firmware rejects `sleep 0.1`. The old polling loop therefore spun without delay, confounding earlier battery observations. The included helper now implements millisecond waits using `nanosleep`. Do not quote the old battery results as an intrinsic always-on cost measurement.

## Adapting another device

Do not use the raw model serial as a public identifier. Discover framebuffer size, touch device name/ranges, framebuffer rotation, power properties, and native process names read-only. Update rendering and hit boxes together. Recalibrate before enabling writes; otherwise a tap could complete the wrong item.

Reject unsupported input capabilities; the current helper deliberately accepts only Goodix type-B input. The bundled ARM target is not suitable for every Kindle. Keep user actions and credentials untouched while probing.

## Modes

Awake: clock every minute, bounded touch sessions renewed continuously, version probe roughly five seconds, weather/content full refresh about five minutes.

Manual sleep: clock/probe/touch workers stop, image persists, RTC requests 300 seconds at every ready-to-suspend event. Actual interval includes firmware transition delays. Full wake is required for this device's Wi-Fi, frontlight is held at zero during scheduled work, then it returns to sleep. Manual wake restores frontlight and awake workers, not a dedicated power-button network-refresh command.

No immediate phone-to-deep-sleep push. No guarantee of whole-minute updates during sleep. Low battery (≤15%), USB and errors can end the program despite the normal no-auto-sleep policy.
