# Device installation and rollback

Read compatibility first. Do not upgrade firmware, re-jailbreak, reset the device, or remove books as part of installation. Ensure enough storage and battery. Do not assume a USB mount gives a remote shell; this baseline runs copied scripts only after the user safely disconnects and opens a launcher entry.

## Build and stage

After `create-instance.mjs`, compile with a separately installed Zig toolchain (the original development compiler was Zig 0.15.2; do not fetch unverified binaries):

```sh
zig cc -target arm-linux-musleabihf -mcpu=cortex_a7 -static -O2 -Wall -Wextra -Werror skills/kindle-note/assets/device/kindle-touch.c -o /absolute/private-instance/device-stage/kindle-note/kindle-touch-v6
```

Check output architecture before installing. This does not bundle third-party runtime notices for binary redistribution; distribute source or handle those notices separately.

Once your backend works, seed image and matching metadata:

```sh
node skills/kindle-note/scripts/seed-device.mjs /absolute/private-instance
```

This only sends an authenticated GET to your own server and writes staging files. It does not edit reminders or write USB. It seeds `cached-screen.png`, `task-meta`, timezone offset and device-only configuration. The initial image can be empty reminders.

## USB copy

Confirm the actual mount and device, then back up any existing `kindle-note` and launch entries **outside the public repo**. Do not merge blindly into another user's deployment. With explicit installation scope, copy staged `kindle-note` into the device root and staged `documents/Kindle-Note-Start-V6.sh` into its documents folder. Keep the existing launcher/FBInk dependency. Never expose staging secrets in output.

Verify copied file hashes, flush writes, and safely eject using the OS (macOS: `diskutil eject` with the verified exact mount). Stop and ask the user to unplug and open `Kindle-Note-Start-V6`. Do not open the launcher while USB is mounted.

## Consolidated check

Within roughly three minutes: entry opens; clock changes across a minute; one task completion updates without home mixing; power button sleeps while preserving Note; press again after ~10 seconds to wake and interact. Do not claim five-minute RTC behavior was covered by this short check. For deep-cycle evidence, ask for logs after normal use instead of repeatedly demanding a long wait.

V6 masks the frontlight for automatic RTC work and restores it only on manual wake. Confirm actual behavior on each model. Rapid toggles during an automatic network cycle are a known untested race boundary.

## Rollback

Connect USB to request shutdown; inspect the last cleanup markers when available. If the runtime is stuck or an old RAM lock remains, ask for a normal restart (not factory reset), then restore the backed-up exact files. Do not recursively delete unknown `/var/tmp` contents or kill unrelated processes. Files left by another running version must not be treated as proof that no process is using them.

On runtime exit, restore original power setting, owned display components, and saved light level. If the interface remains unresponsive, stop further writes and obtain a normal reboot from the user; do not keep trying experimental entries.
