# Prism Browser Community

**[English](README.md)** | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md) | [Português (Brasil)](README.pt-BR.md)

[Français](README.fr.md) | [Українська](README.uk.md) | [Español](README.es.md) | [Türkçe](README.tr.md) | [日本語](README.ja.md) | [हिन्दी](README.hi.md)

Author: [DFarm](https://x.com/DFarm_club)

Official website: [https://prismbrowser.app/](https://prismbrowser.app/)

Prism Browser is a local fingerprint-browser profile manager built on a customized Chromium. Each profile has independent cookies, cache, extension data, proxy settings, and fingerprint configuration, making it suitable for managing multiple isolated browser identities.

Browser profiles, cookies, proxy credentials, and browsing history remain on the user's device by default. The Community edition is free to use and does not limit the number of local profiles.

## Source Code Maintenance Notice

This repository will remain publicly available for learning, review, and community builds. Starting with Prism Browser `v0.3.17`, product features, fixes, and later source-code changes will no longer be routinely synchronized to this repository. As the desktop app, fingerprint kernels, cross-platform packaging, Pro features, and multiple release branches have grown, maintaining separate public and product code lines has created a substantial development and testing burden.

As a specific exception, this update ports the general localization support from 0.3.19 and translates the existing public interface. It does not include private Pro runtimes, licensing services, new Pro features, or private release configuration. This does not resume ongoing synchronization of product source code.

The existing source code, commit history, and historical releases will remain available. For future features, fixes, and installers, please refer to the [official website](https://prismbrowser.app/) and this repository's [Releases](../../releases) page.

## Interface Languages

The desktop interface supports **13 languages**: Simplified Chinese, Traditional Chinese, English, Russian, Vietnamese, Thai, Brazilian Portuguese, French, Ukrainian, Spanish, Turkish, Japanese, and Hindi.

- Startup matches the preferred system display language, with English as the fallback for unsupported or unavailable languages.
- Switch instantly using the language selector in the upper-right corner. A manual choice is saved locally and takes precedence on subsequent launches.
- Menus, common dialogs, forms, dates, and sorting follow the interface language. Translation catalogs are bundled; no online translation service is required.
- Interface language is independent of profile fingerprint language and time zone. Switching preserves profile names, notes, tags, and unsaved edits.
- The README is also available in all 13 languages above; use the links at the top of the page to switch. See the [localization guide](docs/localization.md) to contribute translations.

## Quick Download and Setup

### 1. Download the app

Open the project's [Releases](../../releases) page and download the latest package for your operating system:

- macOS: download the DMG installer or ZIP package;
- Windows: download the installer or the installation-free Portable package.

Release packages include a ready-to-use Chromium 144 fingerprint kernel. Regular users do not need to compile Chromium themselves.

If your system blocks an unsigned build:

- macOS: confirm that you want to open it in **System Settings → Privacy & Security**;
- Windows: select **More info → Run anyway** in the SmartScreen prompt.

Only download files from this project's Releases page and compare the file's SHA-256 with the checksum published with the release.

### 2. Create your first profile

1. Open Prism Browser and select **New Profile**;
2. Enter a profile name, then choose the system, language, time zone, screen, and hardware identity as needed;
3. Leave the connection direct when no proxy is needed. Otherwise, enter the protocol, host, port, and credentials, then test the connection;
4. Save the profile and select **Open**;
5. After the window closes, its cookies, cache, bookmarks, and extension data remain in that profile.

Every profile uses an independent user-data directory. Duplicating a profile preserves its settings while generating a new profile identity and seed.

## Main Features

- Create and run multiple independent browser profiles
- Independent cookies, cache, bookmarks, and extension data for every profile
- HTTP, HTTPS, and SOCKS5 proxies with WebRTC leak prevention
- User-Agent, language, time zone, screen, CPU, memory, and GPU identity configuration
- Consistent Canvas, WebGL, Audio, DOMRect, font, Speech, and WebGPU surfaces
- Profile duplication, groups, tags, favorites, bulk operations, and trash
- Local migration of cookies, individual profiles, or the complete workspace
- Numbered profile Dock icons on macOS and taskbar icons on Windows

## Verification Coverage

The current kernel is continuously cross-checked with the following pages and local audit tools:

| Test | Coverage |
| --- | --- |
| Pixelscan | Browser, operating system, location, automation, and fingerprint consistency |
| CreepJS | Window, Worker, Intl, Canvas, WebGL, Audio, DOMRect, fonts, and Speech |
| BrowserLeaks | Canvas, WebGL, fonts, Audio, WebRTC, client hints, and screen information |
| IPhey | Browser, location, IP, hardware, software, and bot signals; RDP sessions may be flagged separately |
| Prism fingerprint matrix | Same-seed restart stability, different-seed separation, and cross-iframe/Worker identity consistency |
| Prism profile-data audit | Cookie and storage persistence plus isolation between profiles |

Fingerprint-testing sites change over time, so no release promises to pass every third-party test forever. Proxy quality, IP reputation, remote desktop sessions, system fonts, and real hardware also affect results.

## For Developers

### Build the desktop app

You need Node.js 22 or later, npm, and the basic build tools for your platform.

```bash
npm ci
npm run typecheck
npm run build
```

Run in development mode:

```bash
npm run dev
```

Create an application package without a bundled fingerprint kernel:

```bash
# macOS
npm run dist:mac

# Windows
npm run dist:win
```

After packaging, you can import a locally compiled Chromium build from the **Browser Kernels** page in the application.

### Build the Chromium 144 fingerprint kernel

The first Chromium build downloads the complete source tree and toolchain. We recommend 32 GB of RAM and approximately 300 GB of free SSD space. Use a short build path without spaces on the platform's native file system.

Pinned versions, upstream commits, patch order, and SHA-256 values are recorded in `tools/kernel-lock.json`. Shared patches are in `tools/kernel-patches`, while platform scripts are located in:

- macOS arm64: `tools/macos-kernel`
- Windows x64: `tools/windows-kernel`

The scripts prepare the pinned sources, verify and apply patches, generate the GN configuration, invoke Ninja, and produce Chromium, Chromedriver, installer artifacts, a build manifest, and SHA-256 checksums.

#### macOS arm64

You need Xcode, Git, Python 3, Ninja, and an APFS build volume. Accept the Xcode license, then run these commands from the repository root:

```bash
cd tools/macos-kernel
./Check-Prerequisites.sh /Volumes/ds/prism-kernel
./Prepare-Source.sh /Volumes/ds/prism-kernel
./Build-Kernel.sh /Volumes/ds/prism-kernel 4
```

Replace `/Volumes/ds/prism-kernel` with your build directory. The final number controls Ninja parallelism.

#### Windows x64

You need Windows 10/11 x64, Visual Studio Desktop development with C++, the Windows SDK, Git, Python 3, and an NTFS build volume. A clean Python virtual environment is recommended to avoid package-name conflicts from Anaconda environments.

Open a non-administrator PowerShell session in the repository and run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
cd tools\windows-kernel
.\Check-Prerequisites.ps1 -BuildRoot D:\prism-chromium
.\Prepare-Source.ps1 -BuildRoot D:\prism-chromium
.\Build-Kernel.ps1 -BuildRoot D:\prism-chromium -Jobs 4
```

Replace `D:\prism-chromium` with your own short-path NTFS build directory. If the prerequisite check asks you to enable Windows long-path support, follow its instructions, restart Windows, and then continue.

#### Resume an interrupted build and find artifacts

After a Ninja graph has been generated, rerun the platform's `Build-Kernel` command to resume incrementally after a shutdown or interrupted build. The complete source tree does not need to be downloaded again.

Build artifacts are written to `artifacts/<version>-<platform>` inside the selected build root, and logs are written to `logs`. See the platform guides for detailed dependencies, incremental patching, and troubleshooting:

- `tools/macos-kernel/README.md`
- `tools/windows-kernel/README.md`

### Use a locally compiled kernel

Open the **Browser Kernels** page in Prism Browser and select **Import Local Build**:

- macOS: select the generated `Chromium.app`;
- Windows: select the Chromium build or extracted directory containing `chrome.exe`.

Verify the kernel after importing it, then make it the active kernel. Existing profiles retain their data and settings.

## Free and local

Everything runs on the local machine; there is no account, subscription, or activation. The local automation API, scheduled tasks, and local AI control through MCP are part of the free build, and the fingerprint kernel ships with the app.

## Security Reports

Do not post activation codes, proxy passwords, cookies, wallet information, complete browser profiles, private keys, or diagnostic files containing personal data in public issues. When reporting a security problem, provide minimal reproduction steps, affected versions, platform, and impact after removing sensitive data.

A score change on a third-party fingerprint-testing site is not necessarily a security vulnerability. Include the site, test time, kernel version, operating system, and exact failed fields when reporting detection issues.

## License and Third-party Components

Code owned by Prism Browser Community is released under the MIT License. Chromium, ungoogled-chromium, fingerprint-chromium, Electron, React, Ant Design, Vite, TypeScript, Vitest, proxy-chain, undici, zod, and other third-party components remain subject to their respective open-source licenses.

Chromium builds and distributions must retain the `LICENSE`, `LICENSES`, and component notices required by Chromium's source tree and packaged artifacts. The Prism Browser name, logo, and icons are not automatically licensed as trademarks by the source-code license.

Use this project only for lawful and authorized browser isolation, automation testing, privacy research, and account management. Users are responsible for complying with target-site terms and applicable local laws.

## Star History

[![Prism Browser Community Star History](https://api.star-history.com/svg?repos=DFarm6/Prism-Browser-Community&type=Date)](https://www.star-history.com/#DFarm6/Prism-Browser-Community&Date)
