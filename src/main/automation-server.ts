import { randomBytes, randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { access } from 'node:fs/promises'
import { join } from 'node:path'
import type { AutomationStartResult, AutomationStatus, BrowserProfile, McpStatus } from '../shared/types'
import type { Logger } from './app-logger'
import type { AutomationAuditLog } from './automation-audit'
import type { BrowserLauncher } from './browser-launcher'
import type { ProfileStore } from './profile-store'

const MAX_BODY_BYTES = 64 * 1024
const STARTUP_TIMEOUT_MS = 5_000

interface McpBridge {
  handleAgentRequest(method: string, params: Record<string, unknown> | undefined, requestId: string): Promise<unknown>
  status(agentRunning?: boolean): McpStatus
  resetSessions(): void
}

export interface LocalAutomationOptions {
  profiles: ProfileStore
  launcher: BrowserLauncher
  audit: AutomationAuditLog
  appVersion: string
  resourcesPath: string
  onChanged: (status: AutomationStatus) => void
  logger?: Logger
}

function publicAutomationProfile(profile: BrowserProfile) {
  return {
    id: profile.id,
    serialNumber: profile.serialNumber,
    name: profile.name,
    group: profile.group,
    tags: [...profile.tags],
    status: profile.status,
    lastOpenedAt: profile.lastOpenedAt
  }
}

function validProfileId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(value)
}

/** Resolves the stdio MCP entry point, which ships outside the asar archive. */
async function resolveMcpServerPath(resourcesPath: string): Promise<string | undefined> {
  const candidates = [
    join(resourcesPath, 'mcp', 'server.mjs'),
    join(import.meta.dirname, '..', '..', 'build', 'mcp', 'server.mjs')
  ]
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      continue
    }
  }
  return undefined
}

export class LocalAutomationManager {
  private current: AutomationStatus = { state: 'stopped', message: '本地自动化 API 未启动', controlledProfileIds: [] }
  private server: Server | null = null
  private starting: Promise<AutomationStartResult> | null = null
  private readonly controlled = new Set<string>()
  private accessToken = ''
  private tokenExposed = false
  private mcpBroker?: McpBridge

  constructor(private readonly options: LocalAutomationOptions) {}

  status(): AutomationStatus {
    return { ...this.current, controlledProfileIds: [...this.controlled] }
  }

  attachMcpBroker(broker: McpBridge): void { this.mcpBroker = broker }

  /**
   * Returns the stdio server configuration a local AI client should spawn. The
   * server is a plain Node script, so the client reuses the Electron binary in
   * Node mode instead of shipping a second executable.
   */
  async mcpConnection(): Promise<{
    command: string
    args: string[]
    env: Record<string, string>
  } & McpStatus> {
    if (!this.mcpBroker) throw new Error('MCP 控制器尚未就绪')
    if (this.current.state !== 'running') await this.start()
    if (!this.accessToken) throw new Error('本地自动化 API 未返回访问令牌')
    if (this.tokenExposed) throw new Error('MCP 临时令牌已经显示过；如需重新配置，请停止后重新启动 MCP')
    const serverPath = await resolveMcpServerPath(this.options.resourcesPath)
    if (!serverPath) throw new Error('未找到内置 MCP 服务脚本，请重新安装应用')
    this.tokenExposed = true
    return {
      ...this.mcpBroker.status(true),
      command: process.execPath,
      args: [serverPath],
      env: {
        ELECTRON_RUN_AS_NODE: '1',
        PRISM_MCP_ENDPOINT: this.current.endpoint!,
        PRISM_MCP_TOKEN: this.accessToken
      }
    }
  }

  async start(): Promise<AutomationStartResult> {
    if (this.current.state === 'running') throw new Error('本地自动化 API 已经在运行；如需新令牌，请先停止后重新启动')
    if (this.starting) return this.starting
    this.starting = this.startInternal()
    try {
      return await this.starting
    } finally {
      this.starting = null
    }
  }

  private async startInternal(): Promise<AutomationStartResult> {
    this.setStatus({ state: 'starting', message: '正在启动本地自动化 API', controlledProfileIds: [] })
    try {
      const server = createServer((request, response) => void this.handleRequest(request, response))
      await new Promise<void>((resolvePromise, reject) => {
        const timer = setTimeout(() => reject(new Error('本地自动化 API 启动超时')), STARTUP_TIMEOUT_MS)
        server.once('error', (error) => { clearTimeout(timer); reject(error) })
        server.listen(0, '127.0.0.1', () => { clearTimeout(timer); resolvePromise() })
      })
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('本地自动化 API 未能绑定本机端口')
      this.server = server
      this.accessToken = randomBytes(32).toString('base64url')
      this.tokenExposed = false
      this.options.audit.record({ action: 'agent-start', outcome: 'success' })
      this.setStatus({
        state: 'running',
        message: '本地自动化 API 仅监听当前设备',
        endpoint: `http://127.0.0.1:${address.port}`,
        agentVersion: this.options.appVersion,
        startedAt: new Date().toISOString(),
        controlledProfileIds: []
      })
      return { ...this.status(), accessToken: this.accessToken }
    } catch (error) {
      this.server?.close()
      this.server = null
      this.options.audit.record({
        action: 'agent-start', outcome: 'failure',
        detail: error instanceof Error ? error.message : String(error)
      })
      this.setStatus({ state: 'error', message: '本地自动化 API 启动失败，请重试', controlledProfileIds: [] })
      throw error
    }
  }

  async stop(emergency = false): Promise<AutomationStatus> {
    const server = this.server
    this.server = null
    this.accessToken = ''
    this.tokenExposed = false
    if (server) await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()))
    if (emergency) {
      await Promise.allSettled([...this.controlled].map((id) => this.options.launcher.close(id)))
      this.options.audit.record({ action: 'emergency-stop', outcome: 'success' })
    } else {
      this.options.audit.record({ action: 'agent-stop', outcome: 'success' })
    }
    this.controlled.clear()
    this.mcpBroker?.resetSessions()
    this.setStatus({
      state: 'stopped',
      message: emergency ? '自动化已紧急停止，相关浏览器已关闭' : '本地自动化 API 已停止',
      controlledProfileIds: []
    })
    return this.status()
  }

  async shutdown(): Promise<void> {
    if (this.server) await this.stop(false)
    await this.options.audit.flush()
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const send = (status: number, payload: unknown): void => {
      const body = JSON.stringify(payload)
      response.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
        'cache-control': 'no-store'
      })
      response.end(body)
    }
    try {
      if (request.method !== 'POST' || request.url !== '/v1/rpc') {
        send(404, { error: { message: '未知的接口' } })
        return
      }
      const authorization = request.headers.authorization ?? ''
      const presented = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
      if (!presented || !this.accessToken || !timingSafeEqual(presented, this.accessToken)) {
        send(401, { error: { message: '访问令牌无效' } })
        return
      }
      const body = await readBody(request)
      const message = JSON.parse(body) as { id?: unknown; method?: unknown; params?: unknown }
      const id = typeof message.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(message.id) ? message.id : randomUUID()
      const method = typeof message.method === 'string' ? message.method : ''
      const params = message.params && typeof message.params === 'object'
        ? message.params as Record<string, unknown>
        : undefined
      try {
        send(200, { id, result: await this.dispatch(method, params, id) })
      } catch (error) {
        send(200, { id, error: { message: error instanceof Error ? error.message : '请求失败' } })
      }
    } catch (error) {
      this.options.logger?.error('本地自动化 API 请求处理失败', error)
      send(400, { error: { message: '请求格式无效' } })
    }
  }

  private async dispatch(method: string, params: Record<string, unknown> | undefined, id: string): Promise<unknown> {
    if (method.startsWith('mcp.')) {
      if (!this.mcpBroker) throw new Error('MCP 控制器尚未就绪')
      return this.mcpBroker.handleAgentRequest(method, params, id)
    }
    const action = method === 'profiles.list' ? 'profiles-list'
      : method === 'profiles.status' ? 'profile-status'
        : method === 'profiles.launch' ? 'profile-launch'
          : method === 'profiles.close' ? 'profile-close' : null
    if (!action) throw new Error('方法不在白名单中')
    const profileId = params?.profileId
    const auditProfileId = validProfileId(profileId) ? profileId : undefined
    this.options.audit.record({ action, outcome: 'allowed', requestId: id, profileId: auditProfileId })
    try {
      let result: unknown
      if (method === 'profiles.list') {
        result = this.options.profiles.list().map(publicAutomationProfile)
      } else {
        if (!validProfileId(profileId)) throw new Error('环境 ID 无效')
        if (method === 'profiles.status') {
          result = publicAutomationProfile(this.options.profiles.get(profileId))
        } else if (method === 'profiles.launch') {
          result = publicAutomationProfile(await this.options.launcher.launch(profileId))
          this.controlled.add(profileId)
          this.notifyCurrent()
        } else {
          result = publicAutomationProfile(await this.options.launcher.close(profileId))
          this.controlled.delete(profileId)
          this.notifyCurrent()
        }
      }
      this.options.audit.record({ action, outcome: 'success', requestId: id, profileId: auditProfileId })
      return result
    } catch (error) {
      this.options.audit.record({
        action, outcome: 'failure', requestId: id, profileId: auditProfileId,
        detail: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  private notifyCurrent(): void { this.options.onChanged(this.status()) }

  private setStatus(status: AutomationStatus): void {
    this.current = status
    this.notifyCurrent()
  }
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('请求体过大'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

function timingSafeEqual(first: string, second: string): boolean {
  const left = Buffer.from(first)
  const right = Buffer.from(second)
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index]
  return difference === 0
}
