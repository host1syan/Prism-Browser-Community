import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BrowserProfile } from '../shared/types'
import { AutomationAuditLog } from './automation-audit'
import { LocalAutomationManager } from './automation-server'
import { McpAuditLog } from './mcp-audit'
import { McpControlManager } from './mcp-control-manager'
import { McpPermissionStore } from './mcp-permission-store'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true }))) })

function profile(id: string, serialNumber: number): BrowserProfile {
  return {
    id, serialNumber, name: `环境 ${serialNumber}`, note: '', group: 'g', tags: ['t'], extensionIds: [], color: '#123456', startUrls: [], kernelVersion: '',
    window: { mode: 'auto', x: 0, y: 0, width: 1280, height: 720 }, favorite: false,
    proxy: { protocol: 'direct', host: '', username: '', password: '' },
    fingerprint: { seed: serialNumber, hardwareProfileId: 'macos-host', platform: 'macos', platformVersion: '15.0.0', brand: 'Chrome', brandVersion: '144.0.0.0', hardwareConcurrency: 8, language: 'zh-CN', acceptLanguages: 'zh-CN,zh', timezone: 'Asia/Shanghai', webrtcPolicy: 'proxy_only', networkIdentityMode: 'manual', proxyExitPolicy: 'warn', screenWidth: 1440, screenHeight: 900, disabledSpoofing: [] },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: 'closed'
  }
}

async function rpc(endpoint: string, token: string | undefined, method: string, params?: unknown) {
  const response = await fetch(`${endpoint}/v1/rpc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ id: 'req-1', method, params })
  })
  return { status: response.status, body: await response.json().catch(() => null) }
}

describe('local automation + MCP end to end', () => {
  it('serves the automation API, gates MCP permissions and drives the stdio server', async () => {
    const root = await mkdtemp(join(tmpdir(), 'prism-e2e-')); roots.push(root)
    const items = [profile('profile-1', 1), profile('profile-2', 2)]
    const profiles = {
      list: () => items,
      get: (id: string) => { const item = items.find((v) => v.id === id); if (!item) throw new Error('missing'); return item }
    }
    const launcher = {
      launch: vi.fn(async (id: string) => ({ ...profiles.get(id), status: 'running' as const })),
      close: vi.fn(async (id: string) => ({ ...profiles.get(id), status: 'closed' as const })),
      openPage: vi.fn(async (_id: string, url: string) => ({ url, title: 'T', readyState: 'complete' })),
      pageSnapshot: vi.fn(async () => ({ url: 'https://e.com/', title: 'T', readyState: 'complete', elements: [{ role: 'link', name: 'Next', ref: 'p1-e1' }], truncated: false })),
      clickPageElement: vi.fn(async () => ({ url: 'https://e.com/n', title: 'N', readyState: 'complete' })),
      typePageElement: vi.fn(async () => ({ url: 'https://e.com/', title: 'T', readyState: 'complete' }))
    }
    const mcpAudit = new McpAuditLog(root); await mcpAudit.initialize()
    const automationAudit = new AutomationAuditLog(root); await automationAudit.initialize()
    const mcp = new McpControlManager(new McpPermissionStore(root), profiles as never, launcher as never, mcpAudit, () => undefined)
    await mcp.initialize()
    const automation = new LocalAutomationManager({
      profiles: profiles as never, launcher: launcher as never, audit: automationAudit,
      appVersion: '0.2.0-beta.1', resourcesPath: '/nonexistent', onChanged: () => undefined
    })
    automation.attachMcpBroker(mcp)

    const started = await automation.start()
    const endpoint = started.endpoint!
    expect(endpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(started.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/)

    // 1. unauthenticated request is rejected
    expect((await rpc(endpoint, undefined, 'profiles.list')).status).toBe(401)
    expect((await rpc(endpoint, 'wrong-token', 'profiles.list')).status).toBe(401)

    // 2. automation API answers the four whitelisted methods
    const list = await rpc(endpoint, started.accessToken, 'profiles.list')
    expect(list.status).toBe(200)
    expect((list.body as { result: unknown[] }).result).toHaveLength(2)
    const launched = await rpc(endpoint, started.accessToken, 'profiles.launch', { profileId: 'profile-1' })
    expect((launched.body as { result: { status: string } }).result.status).toBe('running')
    expect(automation.status().controlledProfileIds).toEqual(['profile-1'])
    const bad = await rpc(endpoint, started.accessToken, 'profiles.launch', { profileId: '../../etc' })
    expect((bad.body as { error: { message: string } }).error.message).toContain('环境 ID 无效')
    const unknown = await rpc(endpoint, started.accessToken, 'shell.exec')
    expect((unknown.body as { error: { message: string } }).error.message).toContain('白名单')

    // 3. MCP permission gate still applies over the same channel
    await mcp.setPermission('profile-1', true)
    const mcpList = await rpc(endpoint, started.accessToken, 'mcp.profiles.list', {})
    expect((mcpList.body as { result: { id: string }[] }).result.map((p) => p.id)).toEqual(['profile-1'])
    const denied = await rpc(endpoint, started.accessToken, 'mcp.pages.open', { profileId: 'profile-2', url: 'https://example.com/' })
    expect((denied.body as { error: { message: string } }).error.message).toContain('尚未允许')

    // 4. the real stdio server drives the real HTTP API
    const connection = await automation.mcpConnection()
    expect(connection.env.PRISM_MCP_ENDPOINT).toBe(endpoint)
    const child = spawn(connection.command, connection.args, { env: { ...process.env, ...connection.env }, stdio: ['pipe', 'pipe', 'pipe'] })
    const replies: Record<string, unknown>[] = []
    let buffered = ''
    child.stdout.on('data', (chunk: Buffer) => {
      buffered += chunk.toString('utf8')
      for (;;) {
        const end = buffered.indexOf('\n')
        if (end < 0) break
        const line = buffered.slice(0, end); buffered = buffered.slice(end + 1)
        if (line.trim()) replies.push(JSON.parse(line))
      }
    })
    const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`)
    const waitFor = async (id: number) => {
      for (let i = 0; i < 200; i++) {
        const hit = replies.find((r) => r.id === id)
        if (hit) return hit
        await new Promise((r) => setTimeout(r, 50))
      }
      throw new Error(`no reply for ${id}; got ${JSON.stringify(replies)}`)
    }

    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } })
    const init = await waitFor(1) as { result: { serverInfo: { name: string }, protocolVersion: string } }
    expect(init.result.serverInfo.name).toBe('prism-browser')
    expect(init.result.protocolVersion).toBe('2025-06-18')

    send({ jsonrpc: '2.0', method: 'notifications/initialized' })
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    const tools = await waitFor(2) as { result: { tools: { name: string }[] } }
    expect(tools.result.tools.map((t) => t.name)).toContain('prism_page_type')
    expect(tools.result.tools).toHaveLength(8)

    send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'prism_profiles_list', arguments: {} } })
    const call = await waitFor(3) as { result: { content: { text: string }[] } }
    expect(JSON.parse(call.result.content[0].text).map((p: { id: string }) => p.id)).toEqual(['profile-1'])

    send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'prism_page_read', arguments: { profileId: 'profile-2' } } })
    const blocked = await waitFor(4) as { result: { isError: boolean, content: { text: string }[] } }
    expect(blocked.result.isError).toBe(true)
    expect(blocked.result.content[0].text).toContain('尚未允许')

    child.kill('SIGKILL')
    await automation.stop(false)
    expect(automation.status().state).toBe('stopped')
    await automation.shutdown()
  }, 60_000)
})
