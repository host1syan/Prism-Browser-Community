import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type {
  V2rayNode,
  V2rayNodeTestResult,
  V2rayNodeView,
  V2raySubscription,
  V2raySubscriptionSource
} from '../shared/types'
import { identitySecretCodec, type SecretCodec } from './secret-codec'
import { sanitizeSubscriptionUrl, validateSubscriptionUrl } from './v2ray-subscription'

interface StoredSubscription {
  id: string
  name: string
  source: V2raySubscriptionSource
  /** Encrypted with the same codec as proxy passwords; empty for manual subscriptions. */
  url: string
  displayUrl: string
  createdAt: string
  updatedAt: string
  lastError?: string
}

interface StoredNode {
  id: string
  subscriptionId: string
  name: string
  protocol: V2rayNode['protocol']
  address: string
  port: number
  /** Encrypted. */
  uuid: string
  /** Encrypted. */
  password: string
  alterId?: number
  cipher?: string
  encryption?: string
  flow?: string
  security: V2rayNode['security']
  sni?: string
  publicKey?: string
  shortId?: string
  fingerprint?: string
  alpn?: string[]
  transport: V2rayNode['transport']
  host?: string
  path?: string
  parseWarning?: string
  /** Last speed test. Carried across subscription refreshes so a re-fetch does
   * not discard measurements the user just made. */
  test?: V2rayNodeTestResult
}

interface V2rayStoreFile {
  schemaVersion: 1
  subscriptions: StoredSubscription[]
  nodes: StoredNode[]
}

const EMPTY_STORE: V2rayStoreFile = { schemaVersion: 1, subscriptions: [], nodes: [] }

function safeText(value: unknown, limit: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return trimmed ? trimmed.slice(0, limit) : undefined
}

function safePort(value: unknown): number | undefined {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 65535 ? Number(value) : undefined
}

/** Re-validates a persisted measurement; a hand-edited file must not inject junk. */
function safeTestResult(value: unknown): V2rayNodeTestResult | undefined {
  if (!value || typeof value !== 'object') return undefined
  const result = value as Partial<V2rayNodeTestResult>
  if (typeof result.ok !== 'boolean' || !Number.isFinite(result.latencyMs) || Number(result.latencyMs) < 0) return undefined
  if (typeof result.testedAt !== 'string' || !Number.isFinite(Date.parse(result.testedAt))) return undefined
  return {
    ok: result.ok,
    latencyMs: Math.round(Number(result.latencyMs)),
    testedAt: result.testedAt,
    error: safeText(result.error, 300),
    failureKind: ['authentication', 'timeout', 'connection', 'unknown'].includes(result.failureKind ?? '')
      ? result.failureKind
      : undefined,
    ip: safeText(result.ip, 64),
    country: safeText(result.country, 80),
    countryCode: safeText(result.countryCode, 8)?.toUpperCase(),
    timezone: safeText(result.timezone, 80)
  }
}

/**
 * Persistent store for v2ray subscriptions and their parsed nodes.
 *
 * Subscription URLs contain access tokens, so they are encrypted at rest and
 * never leave the main process in cleartext. Nodes are re-derived from the
 * subscription payload on every refresh; only the credential fields are
 * encrypted, because those are what a profile ultimately authenticates with.
 */
export class V2rayStore {
  private subscriptions = new Map<string, StoredSubscription>()
  private nodes = new Map<string, StoredNode>()
  private writeQueue: Promise<void> = Promise.resolve()
  private readonly path: string

  constructor(vaultPath: string, private readonly secrets: SecretCodec = identitySecretCodec) {
    this.path = join(vaultPath, 'v2ray.json')
  }

  async initialize(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    let stored: V2rayStoreFile | undefined
    try {
      stored = this.parse(await readFile(this.path, 'utf8'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    this.subscriptions.clear()
    this.nodes.clear()
    for (const subscription of stored?.subscriptions ?? []) this.subscriptions.set(subscription.id, subscription)
    for (const node of stored?.nodes ?? []) {
      if (this.subscriptions.has(node.subscriptionId)) this.nodes.set(node.id, node)
    }
    // A corrupt file must not silently wipe user data, so persist only when we
    // actually read something back; the first run writes an empty store.
    if (stored) await this.persist()
  }

  private parse(raw: string): V2rayStoreFile {
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      throw new Error('v2ray 配置不是有效 JSON')
    }
    if (!value || typeof value !== 'object') throw new Error('v2ray 配置结构无效')
    const data = value as Partial<V2rayStoreFile>
    if (data.schemaVersion !== 1 || !Array.isArray(data.subscriptions) || !Array.isArray(data.nodes)) {
      throw new Error('v2ray 配置版本或结构无效')
    }
    const subscriptions: StoredSubscription[] = []
    const ids = new Set<string>()
    for (const item of data.subscriptions) {
      const stored = item as Partial<StoredSubscription>
      const id = safeText(stored.id, 100)
      if (!id || ids.has(id) || (stored.source !== 'url' && stored.source !== 'manual')) continue
      if (typeof stored.url !== 'string') continue
      ids.add(id)
      subscriptions.push({
        id,
        name: safeText(stored.name, 60) ?? '未命名订阅',
        source: stored.source,
        url: stored.url,
        displayUrl: safeText(stored.displayUrl, 300) ?? '',
        createdAt: typeof stored.createdAt === 'string' ? stored.createdAt : new Date(0).toISOString(),
        updatedAt: typeof stored.updatedAt === 'string' ? stored.updatedAt : new Date(0).toISOString(),
        lastError: safeText(stored.lastError, 500)
      })
    }
    const nodes: StoredNode[] = []
    const nodeIds = new Set<string>()
    for (const item of data.nodes) {
      const stored = item as Partial<StoredNode>
      const id = safeText(stored.id, 100)
      const subscriptionId = safeText(stored.subscriptionId, 100)
      const address = safeText(stored.address, 255)
      const port = safePort(stored.port)
      const protocol = stored.protocol
      if (!id || nodeIds.has(id) || !subscriptionId || !ids.has(subscriptionId)) continue
      if (!address || !port || !protocol || !['vmess', 'vless', 'trojan', 'shadowsocks'].includes(protocol)) continue
      if (typeof stored.uuid !== 'string' || typeof stored.password !== 'string') continue
      nodeIds.add(id)
      nodes.push({
        id,
        subscriptionId,
        name: safeText(stored.name, 60) ?? `${address}:${port}`,
        protocol,
        address,
        port,
        uuid: stored.uuid,
        password: stored.password,
        alterId: Number.isInteger(stored.alterId) ? stored.alterId : undefined,
        cipher: safeText(stored.cipher, 40),
        encryption: safeText(stored.encryption, 40),
        flow: safeText(stored.flow, 40),
        security: stored.security === 'tls' || stored.security === 'reality' ? stored.security : 'none',
        sni: safeText(stored.sni, 255),
        publicKey: safeText(stored.publicKey, 200),
        shortId: safeText(stored.shortId, 40),
        fingerprint: safeText(stored.fingerprint, 40),
        alpn: Array.isArray(stored.alpn)
          ? stored.alpn.filter((item): item is string => typeof item === 'string').slice(0, 4)
          : undefined,
        transport: ['tcp', 'ws', 'grpc', 'http', 'kcp', 'quic'].includes(stored.transport ?? '')
          ? (stored.transport as StoredNode['transport'])
          : 'tcp',
        host: safeText(stored.host, 255),
        path: safeText(stored.path, 512),
        parseWarning: safeText(stored.parseWarning, 200),
        test: safeTestResult(stored.test)
      })
    }
    return { schemaVersion: 1, subscriptions, nodes }
  }

  private async persist(): Promise<void> {
    const file: V2rayStoreFile = {
      schemaVersion: 1,
      subscriptions: [...this.subscriptions.values()],
      nodes: [...this.nodes.values()]
    }
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.path), { recursive: true })
      const temporary = `${this.path}.tmp`
      await writeFile(temporary, JSON.stringify(file, null, 2), { encoding: 'utf8', mode: 0o600 })
      await rename(temporary, this.path)
    })
    await this.writeQueue
  }

  listSubscriptions(): V2raySubscription[] {
    return [...this.subscriptions.values()]
      .map((subscription) => this.toSubscriptionView(subscription))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  }

  private toSubscriptionView(subscription: StoredSubscription): V2raySubscription {
    return {
      id: subscription.id,
      name: subscription.name,
      source: subscription.source,
      displayUrl: subscription.displayUrl,
      nodeCount: [...this.nodes.values()].filter((node) => node.subscriptionId === subscription.id).length,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
      lastError: subscription.lastError
    }
  }

  getSubscription(id: string): V2raySubscription | undefined {
    const subscription = this.subscriptions.get(id)
    return subscription ? this.toSubscriptionView(subscription) : undefined
  }

  /** Resolves the stored subscription URL for fetching. Main-process only. */
  subscriptionUrl(id: string): string | undefined {
    const subscription = this.subscriptions.get(id)
    if (!subscription || subscription.source !== 'url' || !subscription.url) return undefined
    return this.secrets.decode(subscription.url)
  }

  async addSubscription(input: {
    id: string
    name: string
    source: V2raySubscriptionSource
    url?: string
    lastError?: string
  }): Promise<V2raySubscription> {
    const now = new Date().toISOString()
    const normalizedUrl = input.url ? validateSubscriptionUrl(input.url) : undefined
    const stored: StoredSubscription = {
      id: input.id,
      name: input.name.trim().slice(0, 60) || '未命名订阅',
      source: input.source,
      url: normalizedUrl ? this.secrets.encode(normalizedUrl) : '',
      displayUrl: normalizedUrl ? sanitizeSubscriptionUrl(normalizedUrl) : '手动添加',
      createdAt: now,
      updatedAt: now,
      lastError: input.lastError
    }
    this.subscriptions.set(stored.id, stored)
    await this.persist()
    return this.toSubscriptionView(stored)
  }

  async setSubscriptionError(id: string, lastError: string | undefined): Promise<void> {
    const subscription = this.subscriptions.get(id)
    if (!subscription) return
    subscription.lastError = lastError ? lastError.slice(0, 500) : undefined
    await this.persist()
  }

  async renameSubscription(id: string, name: string): Promise<V2raySubscription> {
    const subscription = this.subscriptions.get(id)
    if (!subscription) throw new Error('v2ray 订阅不存在')
    subscription.name = name.trim().slice(0, 60) || subscription.name
    subscription.updatedAt = new Date().toISOString()
    await this.persist()
    return this.toSubscriptionView(subscription)
  }

  async removeSubscription(id: string): Promise<void> {
    this.subscriptions.delete(id)
    for (const [nodeId, node] of this.nodes) {
      if (node.subscriptionId === id) this.nodes.delete(nodeId)
    }
    await this.persist()
  }

  /** Replaces every node belonging to a subscription in one write. */
  async replaceNodes(subscriptionId: string, nodes: V2rayNode[], lastError?: string): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionId)
    if (!subscription) throw new Error('v2ray 订阅不存在')
    // Node ids are content-derived, so a refresh keeps the same id for an
    // unchanged node. Carry the measurement over instead of dropping it.
    const previous = new Map<string, V2rayNodeTestResult | undefined>()
    for (const [nodeId, node] of this.nodes) {
      if (node.subscriptionId === subscriptionId) previous.set(nodeId, node.test)
    }
    for (const [nodeId, node] of this.nodes) {
      if (node.subscriptionId === subscriptionId) this.nodes.delete(nodeId)
    }
    for (const node of nodes) {
      this.nodes.set(node.id, {
        id: node.id,
        subscriptionId,
        name: node.name,
        protocol: node.protocol,
        address: node.address,
        port: node.port,
        uuid: this.secrets.encode(node.uuid ?? ''),
        password: this.secrets.encode(node.password ?? ''),
        alterId: node.alterId,
        cipher: node.cipher,
        encryption: node.encryption,
        flow: node.flow,
        security: node.security,
        sni: node.sni,
        publicKey: node.publicKey,
        shortId: node.shortId,
        fingerprint: node.fingerprint,
        alpn: node.alpn,
        transport: node.transport,
        host: node.host,
        path: node.path,
        parseWarning: node.parseWarning,
        test: previous.get(node.id)
      })
    }
    subscription.updatedAt = new Date().toISOString()
    subscription.lastError = lastError ? lastError.slice(0, 500) : undefined
    await this.persist()
  }

  /** Stores one node's measurement so it survives restarts and refreshes. */
  async recordNodeTest(nodeId: string, result: V2rayNodeTestResult): Promise<void> {
    const node = this.nodes.get(nodeId)
    if (!node) return
    node.test = result
    await this.persist()
  }

  /** Full node with decrypted credentials. Main-process only. */
  node(id: string): V2rayNode | undefined {
    const stored = this.nodes.get(id)
    if (!stored) return undefined
    return {
      id: stored.id,
      subscriptionId: stored.subscriptionId,
      name: stored.name,
      protocol: stored.protocol,
      address: stored.address,
      port: stored.port,
      uuid: stored.uuid ? this.secrets.decode(stored.uuid) : undefined,
      password: stored.password ? this.secrets.decode(stored.password) : undefined,
      alterId: stored.alterId,
      cipher: stored.cipher,
      encryption: stored.encryption,
      flow: stored.flow,
      security: stored.security,
      sni: stored.sni,
      publicKey: stored.publicKey,
      shortId: stored.shortId,
      fingerprint: stored.fingerprint,
      alpn: stored.alpn ? [...stored.alpn] : undefined,
      transport: stored.transport,
      host: stored.host,
      path: stored.path,
      parseWarning: stored.parseWarning
    }
  }

  nodeIdsForSubscription(subscriptionId: string): string[] {
    return [...this.nodes.values()]
      .filter((node) => node.subscriptionId === subscriptionId)
      .map((node) => node.id)
  }

  /** Credential-free projection for the renderer. */
  listNodes(subscriptionId?: string): V2rayNodeView[] {
    return [...this.nodes.values()]
      .filter((node) => !subscriptionId || node.subscriptionId === subscriptionId)
      .sort((a, b) => a.subscriptionId.localeCompare(b.subscriptionId) || a.name.localeCompare(b.name))
      .map((node) => {
        const { uuid, password, ...rest } = node
        return { ...rest, hasCredentials: Boolean(uuid || password) }
      })
  }
}

export { EMPTY_STORE }
