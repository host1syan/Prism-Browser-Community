import { mkdir, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type {
  V2rayCoreStatus,
  V2rayNodeTestResult,
  V2rayNodeView,
  V2raySubscription,
  V2raySubscriptionDraft
} from '../shared/types'

import { classifyProxyFailure } from './proxy-tester'
import { safeErrorText } from './redaction'
import { buildXrayConfig } from './v2ray-config'
import { startXray, V2rayCore, type XrayProcess } from './v2ray-core'
import {
  MAX_SUBSCRIPTION_BYTES,
  parseSubscriptionContent,
  validateSubscriptionUrl
} from './v2ray-subscription'
import { V2rayStore } from './v2ray-store'

interface RunningRelay {
  nodeId: string
  host: string
  port: number
  relay: XrayProcess
}

interface Logger {
  info: (message: string, detail?: unknown) => void
  error: (message: string, detail?: unknown) => void
}

/** Hard ceiling for one node probe, Xray startup included. */
export const NODE_TEST_TIMEOUT_MS = 10_000

function remainingMs(deadline: number): number {
  return Math.max(0, deadline - Date.now())
}

/** Partial parse failures are surfaced on the subscription instead of aborting. */
function parseWarningText(errors: string[]): string | undefined {
  return errors.length ? `部分节点无法解析：${errors.slice(0, 3).join('；')}` : undefined
}

export interface V2rayManagerOptions {
  store: V2rayStore
  core: V2rayCore
  vaultPath: string
  logger?: Logger
  fetchImpl?: typeof fetch
}

/**
 * Orchestrates v2ray subscriptions and the per-profile Xray relay.
 *
 * Each profile gets its own relay process so that two profiles can never share
 * an exit IP by accident, and stopping one never disturbs another.
 */
export class V2rayManager {
  private readonly store: V2rayStore
  private readonly core: V2rayCore
  private readonly vaultPath: string
  private readonly logger?: Logger
  private readonly fetchImpl: typeof fetch
  private readonly running = new Map<string, RunningRelay>()
  private readonly starting = new Map<string, Promise<RunningRelay>>()
  private readonly startingNode = new Map<string, string>()

  constructor(options: V2rayManagerOptions) {
    this.store = options.store
    this.core = options.core
    this.vaultPath = options.vaultPath
    this.logger = options.logger
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async initialize(): Promise<void> {
    await this.store.initialize()
  }

  coreStatus(): Promise<V2rayCoreStatus> {
    return this.core.status()
  }

  installCore(): Promise<V2rayCoreStatus> {
    return this.core.install()
  }

  async importCore(sourcePath: string): Promise<V2rayCoreStatus> {
    return this.core.importFrom(sourcePath)
  }

  listSubscriptions(): V2raySubscription[] {
    return this.store.listSubscriptions()
  }

  listNodes(subscriptionId?: string): V2rayNodeView[] {
    return this.store.listNodes(subscriptionId)
  }

  /** Resolves a node into the loopback SOCKS5 endpoint the proxy bridge dials. */
  async ensureRunning(profileId: string, nodeId: string, startupTimeoutMs?: number): Promise<{ host: string; port: number }> {
    const existing = this.running.get(profileId)
    if (existing && existing.nodeId === nodeId) return { host: existing.host, port: existing.port }
    const pending = this.starting.get(profileId)
    if (pending && this.startingNode.get(profileId) === nodeId) {
      const relay = await pending
      return { host: relay.host, port: relay.port }
    }
    if (pending) {
      // A different node was requested while this profile was still starting.
      await pending.catch(() => undefined)
    }
    const task = this.startRelay(profileId, nodeId, startupTimeoutMs)
    this.starting.set(profileId, task)
    this.startingNode.set(profileId, nodeId)
    try {
      const relay = await task
      return { host: relay.host, port: relay.port }
    } finally {
      if (this.starting.get(profileId) === task) {
        this.starting.delete(profileId)
        this.startingNode.delete(profileId)
      }
    }
  }

  private async startRelay(profileId: string, nodeId: string, startupTimeoutMs?: number): Promise<RunningRelay> {
    const node = this.store.node(nodeId)
    if (!node) throw new Error('所选 v2ray 节点不存在，请重新选择节点')
    const executable = await this.core.locate()
    if (!executable) throw new Error('尚未安装 Xray 内核，请在「网络代理」中先安装或导入内核')
    await this.stop(profileId)

    const profileRoot = join(this.vaultPath, 'v2ray', 'runtime', profileId)
    await mkdir(profileRoot, { recursive: true })
    const configPath = join(profileRoot, 'config.json')
    const logPath = join(profileRoot, 'xray.log')
    const config = buildXrayConfig(node, 0, logPath)

    let relay: XrayProcess
    try {
      relay = await startXray(executable, { node, configPath, config, logPath, timeoutMs: startupTimeoutMs })
    } catch (error) {
      this.logger?.error('Xray 启动失败', { profileId, nodeId, error: safeErrorText(error) })
      throw new Error(`v2ray 节点连接失败：${safeErrorText(error)}`)
    }
    const entry: RunningRelay = { nodeId, host: '127.0.0.1', port: relay.port, relay }
    relay.process.once('exit', (code) => {
      if (this.running.get(profileId) === entry) this.running.delete(profileId)
      if (code !== 0 && code !== null) this.logger?.error('Xray 进程异常退出', { profileId, nodeId, code })
    })
    this.running.set(profileId, entry)
    this.logger?.info('v2ray 节点已连接', { profileId, nodeId, port: relay.port })
    return entry
  }

  async stop(profileId: string): Promise<void> {
    const entry = this.running.get(profileId)
    if (!entry) return
    this.running.delete(profileId)
    await entry.relay.stop().catch(() => undefined)
    await rm(join(this.vaultPath, 'v2ray', 'runtime', profileId), { recursive: true, force: true }).catch(() => undefined)
  }

  async addSubscription(draft: V2raySubscriptionDraft): Promise<V2raySubscription> {
    const name = draft.name.trim().slice(0, 60)
    if (!name) throw new Error('订阅名称不能为空')
    const id = randomUUID()
    if (draft.source === 'url') {
      const url = validateSubscriptionUrl(draft.content)
      await this.store.addSubscription({ id, name, source: 'url', url })
      // The subscription is kept when the first fetch fails so the user can
      // retry; refreshSubscription records the error on the stored record.
      return this.refreshSubscription(id)
    }
    const trimmed = draft.content.trim()
    if (!trimmed) throw new Error('请粘贴订阅内容或节点链接')
    const { nodes, errors } = parseSubscriptionContent(trimmed, id)
    await this.store.addSubscription({ id, name, source: 'manual' })
    await this.store.replaceNodes(id, nodes, parseWarningText(errors))
    const created = this.store.getSubscription(id)
    if (!created) throw new Error('订阅创建失败')
    return created
  }

  async refreshSubscription(id: string): Promise<V2raySubscription> {
    const subscription = this.store.getSubscription(id)
    if (!subscription) throw new Error('v2ray 订阅不存在')
    if (subscription.source !== 'url') throw new Error('手动订阅不需要刷新，请重新粘贴内容')
    const url = this.store.subscriptionUrl(id)
    if (!url) throw new Error('订阅地址已丢失，请重新添加')
    let text: string
    try {
      const response = await this.fetchImpl(url, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'user-agent': 'Prism-Browser/0.1', accept: '*/*' },
        signal: AbortSignal.timeout(30_000)
      })
      if (!response.ok) throw new Error(`订阅服务返回 HTTP ${response.status}`)
      const declaredSize = Number(response.headers.get('content-length') ?? 0)
      if (declaredSize > MAX_SUBSCRIPTION_BYTES) throw new Error('订阅内容超过 4 MB 上限')
      text = await response.text()
    } catch (error) {
      const message = safeErrorText(error)
      await this.store.setSubscriptionError(id, message)
      throw new Error(`订阅更新失败：${message}`)
    }
    const { nodes, errors } = parseSubscriptionContent(text, id)
    await this.store.replaceNodes(id, nodes, parseWarningText(errors))
    const updated = this.store.getSubscription(id)
    if (!updated) throw new Error('v2ray 订阅不存在')
    return updated
  }

  async removeSubscription(id: string): Promise<void> {
    // Profiles still pinned to a node of this subscription must stop relaying,
    // otherwise they would keep using a node the user just deleted.
    const orphaned = [...this.running.entries()].filter(([, entry]) => {
      const node = this.store.node(entry.nodeId)
      return node?.subscriptionId === id
    })
    await Promise.allSettled(orphaned.map(([profileId]) => this.stop(profileId)))
    await this.store.removeSubscription(id)
  }

  /**
   * Starts a throwaway relay for one node, measures the round trip to the
   * GeoIP endpoint through it, and records the result on the node.
   *
   * The whole probe — starting Xray included — is capped by NODE_TEST_TIMEOUT_MS,
   * so a dead node cannot hold the UI for longer than that.
   */
  async testNode(nodeId: string): Promise<V2rayNodeTestResult> {
    const node = this.store.node(nodeId)
    if (!node) throw new Error('v2ray 节点不存在')
    const startedAt = Date.now()
    const deadline = startedAt + NODE_TEST_TIMEOUT_MS
    const probeId = `probe-${randomUUID()}`
    const result = await (async (): Promise<V2rayNodeTestResult> => {
      try {
        const endpoint = await this.ensureRunning(probeId, nodeId, remainingMs(deadline))
        const budget = remainingMs(deadline)
        if (budget <= 0) throw new Error('节点测速超时')
        const { ProxyAgent, request } = await import('undici')
        const dispatcher = new ProxyAgent(`socks5://${endpoint.host}:${endpoint.port}`)
        try {
          const response = await request('https://ipwho.is/', {
            dispatcher,
            method: 'GET',
            headers: { accept: 'application/json', 'user-agent': 'Prism-Browser/0.1' },
            headersTimeout: budget,
            bodyTimeout: budget,
            signal: AbortSignal.timeout(budget)
          })
          if (response.statusCode !== 200) {
            await response.body.dump()
            throw new Error(`检测服务返回 HTTP ${response.statusCode}`)
          }
          const data = await response.body.json() as {
            success?: boolean
            ip?: string
            country?: string
            country_code?: string
            timezone?: { id?: string }
          }
          if (data.success === false || !data.ip) throw new Error('节点出口检测失败')
          return {
            ok: true,
            latencyMs: Date.now() - startedAt,
            testedAt: new Date().toISOString(),
            ip: data.ip,
            country: data.country,
            countryCode: data.country_code?.toUpperCase(),
            timezone: data.timezone?.id
          }
        } finally {
          await dispatcher.close().catch(() => undefined)
        }
      } catch (error) {
        const failureKind = classifyProxyFailure(error)
        return {
          ok: false,
          latencyMs: Date.now() - startedAt,
          testedAt: new Date().toISOString(),
          error: failureKind === 'timeout' && Date.now() >= deadline
            ? `测速超过 ${NODE_TEST_TIMEOUT_MS / 1000} 秒`
            : safeErrorText(error),
          failureKind
        }
      } finally {
        await this.stop(probeId)
      }
    })()
    // A vanished node must not turn a measurement into a hard failure.
    await this.store.recordNodeTest(nodeId, result).catch(() => undefined)
    return result
  }

}
