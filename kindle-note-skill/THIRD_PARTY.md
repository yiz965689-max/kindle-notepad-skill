# Third-party components

- `assets/backend/fonts/NotoSansCJKsc-Regular.otf`: Noto Sans CJK SC, SIL Open Font License 1.1; license alongside font. Origin: https://github.com/notofonts/noto-cjk . Embedded font copyright/name metadata is retained; font not modified.
- `@resvg/resvg-js` 2.6.2: installed from npm using lockfile, not vendored. Preserve its package notices and transitive licenses in any binary/image distribution.
- Node.js, Docker, Caddy and Zig are separate tools; not bundled here.
- FBInk: separately installed device dependency (https://github.com/NiLuJe/FBInk), not bundled. Follow its own license when redistributing it.
- `kindle-touch.c` is project source. Compiling with Zig may link musl/runtime components; review and include those components' notices if distributing compiled binaries. This source release does not ship that binary.

The project invokes firmware-provided LIPC/Upstart interfaces. It does not redistribute Amazon firmware, jailbreak payloads, or private system crash reports.
