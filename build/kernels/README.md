# Bundled Chromium fingerprint kernel

`package.json` maps `build/kernels/current/` to `resources/kernels/current/` inside
the packaged app. `locateBundledBrowser()` reads a `manifest.json` from that
directory and verifies every critical file against it, so a kernel staged here
ships as the app's built-in engine and users never import one manually.

## Producing it

```bash
npm run kernel:prepare-bundled -- --platform windows-x64
npm run kernel:prepare-bundled -- --platform macos-arm64
npm run kernel:prepare-bundled -- --list          # available platforms
```

The script downloads the pinned kernel from the project's own releases, verifies
its SHA-256, refuses any build that lacks the Prism fingerprint patches, then
writes `build/kernels/current/` plus the schemaVersion 2 manifest the app
expects. Pass `--archive /path/to/Prism-Kernel-*.zip` to use a local copy
instead of downloading.

Only one platform can be staged at a time, because the app resolves a single
`resources/kernels/current/` path. Re-run the script before switching targets.

## Why not compile Chromium

The published kernels are built from the same patch set as
`tools/kernel-lock.json`, which is why they carry the switches
`src/main/launch-args.ts` passes at launch (`--fingerprint-render-identity`,
`--fingerprint-language`, `--prism-profile-serial`, `--disable-spoofing`, …).
Compiling Chromium locally is only necessary to change that patch set; it needs
a native toolchain and roughly 300 GB of disk.

A stock Chromium or a plain fingerprint-chromium build is **not** usable: it
accepts the launch arguments but ignores them, so profiles would start with
fingerprinting silently disabled. The staging script checks for the patch
markers and fails rather than producing such a package.

## Licensing

The kernel is a Chromium derivative and stays under its own licenses. Keep the
Chromium `LICENSE` and `LICENSES` files that accompany the build directory in
any distribution.
