# Release checklist

Only publish when the user requests publication to a selected repository. Packaging alone is not authorization to push. Keep this source tree separate from instance data.

- Run the Skill Creator frontmatter validator if available.
- Run `node scripts/audit-release.mjs` from repository root; inspect the file list as well. It is a guardrail, not a comprehensive secret detector.
- Run backend tests from a copied clean instance after `npm ci`; compile helper; syntax-check shell; run included lifecycle tests.
  From repository root: `node tests/manual-power.mjs`, `node tests/stale-screen.mjs`, `node tests/remote-version.mjs`, `node tests/seed-device.mjs`.
- Never include private URL fragments, secrets, SSH keys, logs, data, screenshots from the device, complete serials, cached personal images, task metadata or pending actions.
- No node_modules, compiler download/cache, generated binary or live server settings in the source archive. Keep lockfile and third-party notices.
- Include font OFL notices; do not casually bundle FBInk, jailbreak payloads or firmware.
- Mark latest observed V6 power-button operation as user-confirmed (2026-10-02); retain caveats for cross-model compatibility, deep-cycle combinations and battery life.
- Regenerate a source zip from clean files only, list archive contents, then calculate SHA-256. Never zip the entire private project directory.
- Inspect generated instance scripts: they must require independent domains/secrets and never send data to the developer's services.

This is a personal-device, single-user baseline. Before promotion as a broad end-user product, separately review credential rotation/revocation, backups, richer offline UX, pagination and unattended recovery.
