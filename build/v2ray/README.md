# Bundled Xray core

`package.json` maps this directory to `resources/v2ray/` inside the packaged app.
`V2rayCore.locate()` checks `resources/v2ray/` first, so a core placed here is used
directly and users never need to download or import one.

## Contents

- `xray.exe` — Windows x64 core, from Xray-core `v26.3.27`.
- `LICENSE-xray.txt` — the MPL-2.0 license that Xray-core ships under.

## Per-platform notes

The file name must be exactly `xray.exe` on Windows and `xray` on macOS/Linux;
the app resolves that single path. A Windows build therefore ships only the
Windows core. To build for macOS or Linux, replace this file with the matching
release binary (keep the file name `xray`) before packaging.

Release digests for `v26.3.27` are recorded in `XRAY_RELEASE` in
`src/main/v2ray-core.ts`. When bumping the version, download from
<https://github.com/XTLS/Xray-core/releases>, verify the digest against the
release asset, then update both the binary here and the constants there.

## Licensing

Xray-core is a separate work under MPL-2.0. Keep `LICENSE-xray.txt` alongside
the binary in any distribution; do not present it as part of Prism's own MIT
licensed source.
