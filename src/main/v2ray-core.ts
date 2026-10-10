import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { access, chmod, copyFile, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createServer, Socket } from 'node:net'
import { basename, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable, Transform } from 'node:stream'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { V2rayCoreStatus } from '../shared/types'

const execFileAsync = promisify(execFile)

/**
 * Pinned Xray-core release. The archive digest is checked before anything is
 * extracted, so a compromised mirror cannot get a binary onto the machine.
 */
interface XrayAsset {
  name: string
  /** Upstream release digest; empty means automatic install is disabled. */
  sha256: string
  executable: string
}

export const XRAY_RELEASE: { version: string; baseUrl: string; assets: Record<string, XrayAsset> } = {
  version: '26.3.27',
  baseUrl: 'https://github.com/XTLS/Xray-core/releases/download/v26.3.27',
  assets: {
    'win32-x64': {
      name: 'Xray-windows-64.zip',
      sha256: 'd004c39288ce9ada487c6f398c7c545f7d749e44bdfdd59dbc9f865afba4e1ad',
      executable: 'xray.exe'
    },
    'darwin-arm64': {
      name: 'Xray-macos-arm64-v8a.zip',
      sha256: '2e93a67e8aa1936ecefb307e120830fcbd4c643ab9b1c46a2d0838d5f8409eaf',
      executable: 'xray'
    },
    'darwin-x64': {
      name: 'Xray-macos-64.zip',
      sha256: 'f5b0471d3459eff1b82e48af0aeac186abcc3298210070afbbbd8437a4e8b203',
      executable: 'xray'
    },
    'linux-x64': {
      name: 'Xray-linux-64.zip',
      sha256: '23cd9af937744d97776ee35ecad4972cf4b2109d1e0fe6be9930467608f7c8ae',
      executable: 'xray'
    }
  }
}

export type XrayPlatformKey = keyof typeof XRAY_RELEASE.assets

export function currentPlatformKey(): XrayPlatformKey | undefined {
  const key = `${process.platform}-${process.arch}`
  return key in XRAY_RELEASE.assets ? (key as XrayPlatformKey) : undefined
}

/** Reserves an ephemeral loopback port. Xray cannot bind port 0 itself, so the
 * port has to be discovered here; the socket is closed immediately before the
 * child starts, which leaves a small but acceptable race on a local machine. */
export async function reserveLoopbackPort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('无法分配本地端口')))
        return
      }
      const { port } = address
      server.close(() => resolve(port))
    })
  })
}

async function waitForPort(port: number, timeoutMs: number, isAlive: () => boolean): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isAlive()) throw new Error('Xray 进程在监听端口前已退出')
    const connected = await new Promise<boolean>((resolve) => {
      const socket = new Socket()
      const finish = (value: boolean): void => {
        socket.destroy()
        resolve(value)
      }
      socket.setTimeout(500)
      socket.once('connect', () => finish(true))
      socket.once('timeout', () => finish(false))
      socket.once('error', () => finish(false))
      socket.connect(port, '127.0.0.1')
    })
    if (connected) return
    // Each attempt costs up to 500 ms plus a 100 ms sleep, so stop when another
    // round could not fit inside the budget instead of overshooting it.
    if (Date.now() + 600 >= deadline) break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('Xray 未能在限定时间内监听本地端口')
}

export interface V2rayCoreOptions {
  vaultPath: string
  /** Where a bundled binary lives, when the app ships one. */
  resourcesPath?: string
  logger?: { info: (message: string, detail?: unknown) => void; error: (message: string, detail?: unknown) => void }
}

/**
 * Owns the Xray binary: locating, installing, and verifying it. Process
 * lifecycle lives in V2rayManager; this class only deals with the artifact.
 */
export class V2rayCore {
  private readonly root: string
  private readonly binaryPath: string
  private readonly resourcesPath?: string

  constructor(private readonly options: V2rayCoreOptions) {
    this.root = join(options.vaultPath, 'v2ray')
    this.binaryPath = join(this.root, 'xray', currentPlatformKey() ? XRAY_RELEASE.assets[currentPlatformKey()!].executable : 'xray')
    this.resourcesPath = options.resourcesPath
  }

  get executablePath(): string {
    return this.binaryPath
  }

  private async binaryIsUsable(path: string): Promise<boolean> {
    try {
      await access(path, constants.X_OK)
      const info = await stat(path)
      return info.isFile() && info.size > 1024
    } catch {
      return false
    }
  }

  /** Bundled binary first, then the previously installed one. */
  async locate(): Promise<string | undefined> {
    const key = currentPlatformKey()
    if (!key) return undefined
    const executable = XRAY_RELEASE.assets[key].executable
    if (this.resourcesPath) {
      const bundled = join(this.resourcesPath, 'v2ray', executable)
      if (await this.binaryIsUsable(bundled)) return bundled
    }
    if (await this.binaryIsUsable(this.binaryPath)) return this.binaryPath
    return undefined
  }

  async status(): Promise<V2rayCoreStatus> {
    const located = await this.locate()
    if (!located) {
      return {
        installed: false,
        message: currentPlatformKey()
          ? '尚未安装 Xray 内核，请先下载或导入本地内核'
          : `当前平台（${process.platform}-${process.arch}）暂不支持自动安装，请手动导入 Xray 内核`
      }
    }
    const version = await this.readVersion(located)
    return {
      installed: true,
      version,
      path: located,
      source: located === this.binaryPath ? 'downloaded' : 'imported',
      message: version ? `Xray ${version}` : 'Xray 内核可用'
    }
  }

  private async readVersion(executable: string): Promise<string | undefined> {
    try {
      const { stdout } = await execFileAsync(executable, ['version'], { timeout: 10_000 })
      const match = stdout.match(/Xray\s+(\d+\.\d+\.\d+)/i) ?? stdout.match(/^(\d+\.\d+\.\d+)/m)
      return match?.[1]
    } catch (error) {
      this.options.logger?.error('读取 Xray 版本失败', error)
      return undefined
    }
  }

  async install(): Promise<V2rayCoreStatus> {
    const key = currentPlatformKey()
    if (!key) throw new Error(`当前平台（${process.platform}-${process.arch}）暂不支持自动安装 Xray`)
    const asset = XRAY_RELEASE.assets[key]
    if (!asset.sha256) {
      throw new Error('Xray 内核尚未固定校验值，请手动导入本地内核')
    }
    await mkdir(this.root, { recursive: true })
    const archivePath = join(this.root, `${asset.name}.download`)
    const response = await fetch(`${XRAY_RELEASE.baseUrl}/${asset.name}`, {
      headers: { accept: 'application/octet-stream', 'user-agent': 'Prism-Browser/0.1' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10 * 60_000)
    })
    if (!response.ok || !response.body) throw new Error(`Xray 下载失败（HTTP ${response.status}）`)
    const hash = createHash('sha256')
    const source = Readable.from(response.body as unknown as AsyncIterable<Uint8Array>)
    const digest = new Transform({
      transform: (chunk: Buffer, _encoding, callback) => {
        hash.update(chunk)
        callback(null, chunk)
      }
    })
    await pipeline(source, digest, createWriteStream(archivePath, { mode: 0o600 }))
    const actual = hash.digest('hex')
    if (actual !== asset.sha256.toLowerCase()) {
      await rm(archivePath, { force: true })
      throw new Error(`Xray 校验失败：期望 ${asset.sha256.slice(0, 12)}…，实际 ${actual.slice(0, 12)}…`)
    }
    await this.extractArchive(archivePath, this.root)
    await rm(archivePath, { force: true })
    if (!(await this.binaryIsUsable(this.binaryPath))) throw new Error('Xray 压缩包中没有找到可执行文件')
    await chmod(this.binaryPath, 0o755)
    this.options.logger?.info('Xray 内核安装完成', { version: XRAY_RELEASE.version })
    return this.status()
  }

  private async extractArchive(archivePath: string, destination: string): Promise<void> {
    if (process.platform === 'win32') {
      const command = `Expand-Archive -LiteralPath '${archivePath.replaceAll("'", "''")}' -DestinationPath '${destination.replaceAll("'", "''")}' -Force`
      await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { timeout: 120_000 })
      return
    }
    await execFileAsync('unzip', ['-o', '-q', archivePath, '-d', destination], { timeout: 120_000 })
  }

  /** Copies a user-supplied Xray binary into the vault. */
  async importFrom(sourcePath: string): Promise<V2rayCoreStatus> {
    const key = currentPlatformKey()
    if (!key) throw new Error('当前平台暂不支持使用 Xray 内核')
    if (!(await this.binaryIsUsable(sourcePath))) throw new Error('所选文件不是可执行的 Xray 内核')
    const version = await this.readVersion(sourcePath)
    if (!version) throw new Error('所选文件不是有效的 Xray 内核（无法读取版本）')
    await mkdir(join(this.root, 'xray'), { recursive: true })
    await copyFile(sourcePath, this.binaryPath)
    await chmod(this.binaryPath, 0o755)
    this.options.logger?.info('已导入本地 Xray 内核', { version, path: basename(sourcePath) })
    return this.status()
  }
}

export interface XrayProcess {
  process: ChildProcess
  port: number
  configPath: string
  stop: () => Promise<void>
}

export interface StartXrayOptions {
  node: import('../shared/types').V2rayNode
  configPath: string
  config: Record<string, unknown>
  logPath: string
  timeoutMs?: number
  spawnImpl?: typeof spawn
}

/** Starts one Xray child bound to a freshly reserved loopback port. */
export async function startXray(executable: string, options: StartXrayOptions): Promise<XrayProcess> {
  const spawnImpl = options.spawnImpl ?? spawn
  const port = await reserveLoopbackPort()
  const config = { ...options.config }
  const inbounds = (config.inbounds as Array<Record<string, unknown>> | undefined) ?? []
  if (inbounds[0]) inbounds[0].port = port
  config.inbounds = inbounds
  await mkdir(join(options.configPath, '..'), { recursive: true })
  await writeFile(options.configPath, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o600 })

  const child = spawnImpl(executable, ['run', '-config', options.configPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })

  let stderr = ''
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr = `${stderr}${chunk.toString('utf8')}`.slice(-8192)
  })

  let exited = false
  child.once('exit', () => { exited = true })

  try {
    await waitForPort(port, options.timeoutMs ?? 15_000, () => !exited)
  } catch (error) {
    child.kill('SIGKILL')
    const detail = stderr.trim()
    throw new Error(detail ? `${(error as Error).message}：${detail.slice(-400)}` : (error as Error).message)
  }

  return {
    process: child,
    port,
    configPath: options.configPath,
    stop: async () => {
      if (exited) return
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          child.kill('SIGKILL')
          resolve()
        }, 3000)
        child.once('exit', () => {
          clearTimeout(timer)
          resolve()
        })
        child.kill('SIGTERM')
      })
    }
  }
}
