#!/usr/bin/env node
/**
 * Stages an official Prism kernel build so electron-builder can bundle it.
 *
 * The app resolves a bundled kernel from `resources/kernels/current/`, and
 * `locateBundledBrowser()` refuses anything without a schemaVersion 2
 * `manifest.json` carrying a `criticalFilesSha256` aggregate. The official
 * kernel releases ship a plain Chromium build directory without that manifest,
 * so it is generated here.
 *
 * Usage:
 *   node tools/prepare-bundled-kernel.mjs --platform windows-x64
 *   node tools/prepare-bundled-kernel.mjs --platform windows-x64 --archive ./Prism-Kernel.zip
 *   node tools/prepare-bundled-kernel.mjs --list
 *
 * Without --archive the pinned release is downloaded from GitHub.
 */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { cp, mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputRoot = join(projectRoot, 'build', 'kernels', 'current')

/**
 * Kernels published by the Prism project. These are built from the same patch
 * set as `tools/kernel-lock.json`, which is why a bundled build matches the
 * switches in `src/main/launch-args.ts` without any local compilation.
 */
const KERNELS = {
  'windows-x64': {
    version: '153.0.8010.53',
    tag: 'kernels-windows-x64-20260923',
    asset: 'Prism-Kernel-153.0.8010.53-windows-x64.zip',
    sha256: 'b5b9a86cbd9487b2ab784c279bb4fabe374e13b8e1555c99ee436160c2016e45',
    executable: 'chrome.exe',
    target: 'win32-x64'
  },
  'windows-x64-150': {
    version: '150.0.7871.186',
    tag: 'kernels-windows-x64-150-20260923',
    asset: 'Prism-Kernel-150.0.7871.186-windows-x64.zip',
    sha256: '6e5ddb3e09cbf14489f919d90bd4a87ddfd79b4a8c707f59d40f4aff46b53841',
    executable: 'chrome.exe',
    target: 'win32-x64'
  },
  'macos-arm64': {
    version: '153.0.8010.53',
    tag: 'kernels-macos-arm64-20260922',
    asset: 'Prism-Kernel-153.0.8010.53-darwin-arm64.dmg',
    sha256: '507e191852c1439c42cb67a0fec99cf72a6fabb718cecb623b20bc7bf8da86d3',
    executable: 'Chromium.app/Contents/MacOS/Chromium',
    target: 'darwin-arm64'
  }
}

// Mirrors WINDOWS_CRITICAL_NAMES in src/main/kernel-integrity.ts. Files that do
// not exist in the build are skipped, exactly as the app does.
const WINDOWS_CRITICAL_NAMES = [
  'chrome.dll',
  'chrome_elf.dll',
  'icudtl.dat',
  'resources.pak',
  'v8_context_snapshot.bin',
  'snapshot_blob.bin'
]

const MAC_FRAMEWORK = 'Chromium.app/Contents/Frameworks/Chromium Framework.framework/Versions/Current/Chromium Framework'

function portable(p) {
  return p.split(sep).join('/')
}

async function hashFile(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

async function isNonEmptyFile(path) {
  try {
    const info = await stat(path)
    return info.isFile() && info.size > 0
  } catch {
    return false
  }
}

/** Same candidate set and ordering the app uses, so digests line up. */
async function discoverCriticalPaths(root, executableRelative) {
  const candidates = new Set([executableRelative])
  if (executableRelative.toLowerCase().endsWith('.exe')) {
    for (const name of WINDOWS_CRITICAL_NAMES) candidates.add(name)
  } else {
    candidates.add(MAC_FRAMEWORK)
  }
  const existing = []
  for (const candidate of candidates) {
    if (await isNonEmptyFile(join(root, candidate))) existing.push(portable(candidate))
  }
  return existing.sort()
}

function aggregateCriticalFiles(files) {
  const hash = createHash('sha256')
  for (const file of files) hash.update(`${file.path}\0${file.size}\0${file.sha256}\n`)
  return hash.digest('hex')
}

async function collectIntegrity(root, executableRelative) {
  const paths = await discoverCriticalPaths(root, executableRelative)
  if (!paths.includes(portable(executableRelative))) {
    throw new Error(`内核缺少入口文件 ${executableRelative}`)
  }
  const criticalFiles = []
  for (const path of paths) {
    const absolute = join(root, path)
    const info = await stat(absolute)
    criticalFiles.push({ path, size: info.size, sha256: await hashFile(absolute) })
  }
  return { criticalFiles, criticalFilesSha256: aggregateCriticalFiles(criticalFiles) }
}

/** The archive holds a single top-level build directory; return it. */
async function findBuildRoot(extracted) {
  const entries = await readdir(extracted, { withFileTypes: true })
  const directories = entries.filter((entry) => entry.isDirectory())
  if (directories.length === 1) return join(extracted, directories[0].name)
  if (directories.length === 0) throw new Error('压缩包中没有找到内核目录')
  throw new Error(`压缩包结构不符合预期：包含 ${directories.length} 个顶层目录`)
}

async function extract(archive, destination) {
  if (archive.toLowerCase().endsWith('.dmg')) {
    const mount = await mkdtemp(join(tmpdir(), 'prism-dmg-'))
    try {
      await execFileAsync('hdiutil', ['attach', archive, '-nobrowse', '-readonly', '-mountpoint', mount])
      const app = (await readdir(mount)).find((name) => name.endsWith('.app'))
      if (!app) throw new Error('DMG 中没有找到 Chromium.app')
      await execFileAsync('ditto', [join(mount, app), join(destination, app)])
      return
    } finally {
      await execFileAsync('hdiutil', ['detach', mount, '-force']).catch(() => undefined)
      await rm(mount, { recursive: true, force: true })
    }
  }
  if (process.platform === 'win32') {
    const escapedArchive = archive.replaceAll("'", "''")
    const escapedDestination = destination.replaceAll("'", "''")
    await execFileAsync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -LiteralPath '${escapedArchive}' -DestinationPath '${escapedDestination}' -Force`
    ], { timeout: 600_000 })
    return
  }
  await execFileAsync('unzip', ['-o', '-q', archive, '-d', destination], { timeout: 600_000 })
}

async function download(spec, destination) {
  const url = `https://github.com/DFarm6/Prism-Browser-Community/releases/download/${spec.tag}/${spec.asset}`
  process.stdout.write(`下载 ${spec.asset} …\n`)
  const response = await fetch(url, {
    headers: { accept: 'application/octet-stream', 'user-agent': 'Prism-Browser-build' },
    redirect: 'follow',
    signal: AbortSignal.timeout(30 * 60_000)
  })
  if (!response.ok || !response.body) throw new Error(`内核下载失败（HTTP ${response.status}）`)
  const chunks = []
  for await (const chunk of response.body) chunks.push(Buffer.from(chunk))
  const buffer = Buffer.concat(chunks)
  await writeFile(destination, buffer)
  return buffer
}

async function sha256Of(path) {
  return hashFile(path)
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--list')) {
    for (const [key, spec] of Object.entries(KERNELS)) {
      process.stdout.write(`${key.padEnd(18)} ${spec.version}  ${spec.asset}\n`)
    }
    return
  }

  const platformIndex = args.indexOf('--platform')
  const platformKey = platformIndex >= 0 ? args[platformIndex + 1] : 'windows-x64'
  const spec = KERNELS[platformKey]
  if (!spec) throw new Error(`未知平台 ${platformKey}；可用：${Object.keys(KERNELS).join(', ')}`)

  const archiveIndex = args.indexOf('--archive')
  const localArchive = archiveIndex >= 0 ? resolve(args[archiveIndex + 1]) : undefined

  const staging = await mkdtemp(join(tmpdir(), 'prism-kernel-'))
  try {
    let archive = localArchive
    if (!archive) {
      archive = join(staging, spec.asset)
      await download(spec, archive)
    }

    const actual = await sha256Of(archive)
    if (actual !== spec.sha256) {
      throw new Error(`内核校验失败：期望 ${spec.sha256}，实际 ${actual}`)
    }
    process.stdout.write(`校验通过：${spec.asset}\n`)

    const extracted = join(staging, 'extracted')
    await mkdir(extracted, { recursive: true })
    await extract(archive, extracted)

    const buildRoot = await findBuildRoot(extracted)
    const executableRelative = spec.executable

    // Verify the build actually carries the switches the app passes at launch.
    // A stock Chromium would pass the digest check but silently ignore every
    // fingerprint switch, so this is the only guard against a wrong archive.
    const markers = [
      'fingerprint-render-identity',
      'fingerprint-language',
      'prism-profile-serial',
      'prism-profile-id',
      'disable-spoofing'
    ]
    const library = join(buildRoot, 'chrome.dll')
    if (await isNonEmptyFile(library)) {
      const found = new Set()
      for (const marker of markers) {
        const hit = await execFileAsync('grep', ['-aqF', marker, library], { maxBuffer: 1024 * 1024 })
          .then(() => true, () => false)
        if (hit) found.add(marker)
      }
      const missing = markers.filter((marker) => !found.has(marker))
      if (missing.length) {
        throw new Error(`该构建缺少 Prism 指纹补丁（${missing.join('、')}），不能用作指纹内核`)
      }
      process.stdout.write('补丁校验通过：包含 Prism 指纹开关\n')
    }

    const integrity = await collectIntegrity(buildRoot, executableRelative)
    const executableRecord = integrity.criticalFiles.find((file) => file.path === portable(executableRelative))
    if (!executableRecord) throw new Error('完整性清单缺少浏览器入口')

    const manifest = {
      schemaVersion: 2,
      version: spec.version,
      assetName: spec.asset,
      sha256: executableRecord.sha256,
      installedAt: new Date().toISOString(),
      executableRelative,
      executableSha256: executableRecord.sha256,
      executableSize: executableRecord.size,
      ...integrity,
      source: 'release',
      target: spec.target
    }

    await rm(outputRoot, { recursive: true, force: true })
    await mkdir(dirname(outputRoot), { recursive: true })
    await cp(buildRoot, outputRoot, { recursive: true })
    await writeFile(join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 })

    process.stdout.write(`\n内核已就绪：${relative(projectRoot, outputRoot)}\n`)
    process.stdout.write(`  版本      ${spec.version}\n`)
    process.stdout.write(`  目标      ${spec.target}\n`)
    process.stdout.write(`  关键文件  ${integrity.criticalFiles.length} 个\n`)
    process.stdout.write(`  聚合摘要  ${integrity.criticalFilesSha256.slice(0, 16)}…\n`)
    process.stdout.write('\n现在可以运行 npm run dist:win（或 npx electron-builder --win portable zip --x64）。\n')
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

main().catch((error) => {
  process.stderr.write(`\n准备内置内核失败：${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
