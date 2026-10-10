import { createHash, randomUUID } from 'node:crypto'
import type { V2rayNode, V2rayNodeProtocol, V2raySecurity, V2rayTransport } from '../shared/types'

/** Upper bound on a single subscription payload; guards against a hostile or
 * misconfigured endpoint streaming an unbounded body. */
export const MAX_SUBSCRIPTION_BYTES = 4 * 1024 * 1024
export const MAX_SUBSCRIPTION_NODES = 2000

const TRANSPORTS: V2rayTransport[] = ['tcp', 'ws', 'grpc', 'http', 'kcp', 'quic']

function normalizeTransport(value: string | undefined): V2rayTransport {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'h2' || normalized === 'h2c') return 'http'
  if (normalized === 'mkcp' || normalized === 'm-kcp') return 'kcp'
  return TRANSPORTS.find((item) => item === normalized) ?? 'tcp'
}

function normalizeSecurity(value: string | undefined): V2raySecurity {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'tls' || normalized === 'xtls') return 'tls'
  if (normalized === 'reality') return 'reality'
  return 'none'
}

function boundedPort(value: unknown): number | undefined {
  const port = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : undefined
}

function cleanText(value: unknown, limit = 200): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return trimmed ? trimmed.slice(0, limit) : undefined
}

function decodeBase64(value: string): string | undefined {
  const compact = value.replace(/[\s-]/g, '').replace(/_/g, '/').replace(/-/g, '+')
  if (!compact || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) return undefined
  const padded = compact.padEnd(Math.ceil(compact.length / 4) * 4, '=')
  try {
    const decoded = Buffer.from(padded, 'base64').toString('utf8')
    // Reject binary noise: a decoded share-link list is printable text.
    return /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(decoded) ? undefined : decoded
  } catch {
    return undefined
  }
}

/**
 * Node identity that survives a subscription refresh: two parses of the same
 * server/port/protocol/name must yield the same id, otherwise every profile
 * pinned to a node would break the next time the subscription is pulled.
 */
function nodeIdFor(subscriptionId: string, seed: string): string {
  const digest = createHash('sha256').update(`${subscriptionId}\u0000${seed}`).digest('hex')
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`
}

function identitySeed(protocol: V2rayNodeProtocol, address: string, port: number, name: string, credential: string): string {
  const credentialHash = createHash('sha256').update(credential).digest('hex').slice(0, 16)
  return `${protocol}|${address.toLowerCase()}|${port}|${name}|${credentialHash}`
}

function parseAlpn(value: string | null | undefined): string[] | undefined {
  if (!value) return undefined
  const parts = value.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 4)
  return parts.length ? parts : undefined
}

interface VmessPayload {
  v?: string
  ps?: string
  add?: string
  port?: string | number
  id?: string
  aid?: string | number
  scy?: string
  net?: string
  type?: string
  host?: string
  path?: string
  tls?: string
  sni?: string
  alpn?: string
  fp?: string
}

function parseVmess(link: string, subscriptionId: string): V2rayNode {
  const payload = decodeBase64(link.slice('vmess://'.length))
  if (!payload) throw new Error('vmess 链接不是有效的 Base64')
  let parsed: VmessPayload
  try {
    parsed = JSON.parse(payload) as VmessPayload
  } catch {
    throw new Error('vmess 链接内容不是有效 JSON')
  }
  const address = cleanText(parsed.add, 255)
  const port = boundedPort(parsed.port)
  const uuid = cleanText(parsed.id, 64)
  if (!address) throw new Error('vmess 节点缺少服务器地址')
  if (!port) throw new Error('vmess 节点端口无效')
  if (!uuid) throw new Error('vmess 节点缺少用户 ID')
  const name = cleanText(parsed.ps, 60) ?? `${address}:${port}`
  const alterId = Number.parseInt(String(parsed.aid ?? '0'), 10)
  return {
    id: nodeIdFor(subscriptionId, identitySeed('vmess', address, port, name, uuid)),
    subscriptionId,
    name,
    protocol: 'vmess',
    address,
    port,
    uuid,
    alterId: Number.isInteger(alterId) && alterId >= 0 && alterId <= 65535 ? alterId : 0,
    cipher: cleanText(parsed.scy, 40) ?? 'auto',
    security: normalizeSecurity(parsed.tls),
    sni: cleanText(parsed.sni, 255),
    fingerprint: cleanText(parsed.fp, 40),
    alpn: parseAlpn(parsed.alpn),
    transport: normalizeTransport(parsed.net),
    host: cleanText(parsed.host, 255),
    path: cleanText(parsed.path, 512)
  }
}

function parseUrlStyleLink(
  link: string,
  protocol: Extract<V2rayNodeProtocol, 'vless' | 'trojan'>,
  subscriptionId: string
): V2rayNode {
  let url: URL
  try {
    url = new URL(link)
  } catch {
    throw new Error(`${protocol} 链接格式无效`)
  }
  const address = cleanText(url.hostname, 255)
  const port = boundedPort(url.port)
  const credential = protocol === 'vless' ? decodeURIComponent(url.username) : decodeURIComponent(url.username || url.password)
  if (!address) throw new Error(`${protocol} 节点缺少服务器地址`)
  if (!port) throw new Error(`${protocol} 节点端口无效`)
  if (!credential) throw new Error(`${protocol} 节点缺少凭据`)
  const name = cleanText(decodeURIComponent(url.hash.slice(1)), 60) ?? `${address}:${port}`
  const params = url.searchParams
  const security = normalizeSecurity(params.get('security') ?? undefined)
  const transport = normalizeTransport(params.get('type') ?? undefined)
  const serviceName = cleanText(params.get('serviceName'), 512)
  return {
    id: nodeIdFor(subscriptionId, identitySeed(protocol, address, port, name, credential)),
    subscriptionId,
    name,
    protocol,
    address,
    port,
    ...(protocol === 'vless' ? { uuid: credential } : { password: credential }),
    security,
    sni: cleanText(params.get('sni') ?? params.get('peer') ?? undefined, 255),
    publicKey: cleanText(params.get('pbk'), 200),
    shortId: cleanText(params.get('sid'), 40),
    fingerprint: cleanText(params.get('fp'), 40),
    alpn: parseAlpn(params.get('alpn')),
    flow: cleanText(params.get('flow'), 40),
    encryption: protocol === 'vless' ? cleanText(params.get('encryption'), 40) ?? 'none' : undefined,
    transport,
    host: cleanText(params.get('host'), 255),
    path: transport === 'grpc' ? serviceName : cleanText(params.get('path'), 512)
  }
}

function parseShadowsocks(link: string, subscriptionId: string): V2rayNode {
  const body = link.slice('ss://'.length)
  const hashIndex = body.indexOf('#')
  const fragment = hashIndex >= 0 ? body.slice(hashIndex + 1) : ''
  const withoutFragment = hashIndex >= 0 ? body.slice(0, hashIndex) : body
  const queryIndex = withoutFragment.indexOf('?')
  const query = queryIndex >= 0 ? withoutFragment.slice(queryIndex + 1) : ''
  const core = queryIndex >= 0 ? withoutFragment.slice(0, queryIndex) : withoutFragment

  let method: string | undefined
  let password: string | undefined
  let address: string | undefined
  let port: number | undefined

  const atIndex = core.lastIndexOf('@')
  if (atIndex >= 0) {
    // SIP002: ss://base64(method:password)@host:port
    const decoded = decodeBase64(core.slice(0, atIndex)) ?? core.slice(0, atIndex)
    const separator = decoded.indexOf(':')
    if (separator > 0) {
      method = decoded.slice(0, separator)
      password = decoded.slice(separator + 1)
    }
    const hostPort = core.slice(atIndex + 1)
    const closing = hostPort.lastIndexOf(']')
    const colonIndex = closing >= 0 ? hostPort.indexOf(':', closing) : hostPort.lastIndexOf(':')
    if (colonIndex > 0) {
      address = hostPort.slice(0, colonIndex)
      port = boundedPort(hostPort.slice(colonIndex + 1))
    }
  } else {
    // Legacy: ss://base64(method:password@host:port)
    const decoded = decodeBase64(core)
    if (decoded) {
      const at = decoded.lastIndexOf('@')
      const separator = decoded.indexOf(':')
      if (at > 0 && separator > 0 && separator < at) {
        method = decoded.slice(0, separator)
        password = decoded.slice(separator + 1, at)
        const hostPort = decoded.slice(at + 1)
        const colonIndex = hostPort.lastIndexOf(':')
        if (colonIndex > 0) {
          address = hostPort.slice(0, colonIndex)
          port = boundedPort(hostPort.slice(colonIndex + 1))
        }
      }
    }
  }

  const cleanAddress = cleanText(address, 255)?.replace(/^\[|\]$/g, '')
  if (!cleanAddress) throw new Error('shadowsocks 节点缺少服务器地址')
  if (!port) throw new Error('shadowsocks 节点端口无效')
  if (!method || !password) throw new Error('shadowsocks 节点缺少加密方式或密码')
  const name = cleanText(decodeURIComponent(fragment), 60) ?? `${cleanAddress}:${port}`
  const plugin = new URLSearchParams(query).get('plugin')
  return {
    id: nodeIdFor(subscriptionId, identitySeed('shadowsocks', cleanAddress, port, name, `${method}:${password}`)),
    subscriptionId,
    name,
    protocol: 'shadowsocks',
    address: cleanAddress,
    port,
    password,
    cipher: cleanText(method, 40),
    security: 'none',
    transport: 'tcp',
    ...(plugin ? { parseWarning: '该节点使用了 SIP003 插件，暂不支持插件参数' } : {})
  }
}

/** Share-link schemes differ from protocol names: shadowsocks links use `ss`. */
const SCHEME_TO_PROTOCOL: Record<string, V2rayNodeProtocol> = {
  vmess: 'vmess',
  vless: 'vless',
  trojan: 'trojan',
  ss: 'shadowsocks'
}

/** Parses one share link. Throws with a user-facing message when unsupported. */
export function parseShareLink(link: string, subscriptionId: string): V2rayNode {
  const trimmed = link.trim()
  const scheme = trimmed.slice(0, trimmed.indexOf('://')).toLowerCase()
  const protocol = SCHEME_TO_PROTOCOL[scheme]
  if (!protocol) throw new Error(`不支持的节点协议：${scheme || '未知'}`)
  if (protocol === 'vmess') return parseVmess(trimmed, subscriptionId)
  if (protocol === 'shadowsocks') return parseShadowsocks(trimmed, subscriptionId)
  return parseUrlStyleLink(trimmed, protocol, subscriptionId)
}

/**
 * Accepts either a plain list of share links or a Base64-wrapped one, which is
 * what most subscription endpoints return. Returns nodes plus the per-line
 * errors so the UI can report partial success instead of failing outright.
 */
export function parseSubscriptionContent(
  content: string,
  subscriptionId: string
): { nodes: V2rayNode[]; errors: string[] } {
  if (Buffer.byteLength(content, 'utf8') > MAX_SUBSCRIPTION_BYTES) {
    throw new Error('订阅内容超过 4 MB 上限')
  }
  const text = content.includes('://') ? content : decodeBase64(content) ?? content
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const nodes: V2rayNode[] = []
  const errors: string[] = []
  const seen = new Set<string>()
  for (const line of lines) {
    if (nodes.length >= MAX_SUBSCRIPTION_NODES) {
      errors.push(`节点数超过 ${MAX_SUBSCRIPTION_NODES} 上限，其余已忽略`)
      break
    }
    if (!line.includes('://')) continue
    try {
      const node = parseShareLink(line, subscriptionId)
      if (seen.has(node.id)) continue
      seen.add(node.id)
      nodes.push(node)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  if (!nodes.length) {
    throw new Error(errors.length ? `订阅中没有可用节点：${errors.slice(0, 3).join('；')}` : '订阅中没有找到节点链接')
  }
  return { nodes, errors }
}

/** Subscription URLs carry an access token, so only the origin may be shown. */
export function sanitizeSubscriptionUrl(value: string): string {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '无效的订阅地址'
    return `${url.protocol}//${url.host}/…`
  } catch {
    return '无效的订阅地址'
  }
}

export function validateSubscriptionUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('订阅地址不能为空')
  if (trimmed.length > 2048) throw new Error('订阅地址不能超过 2048 个字符')
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error('订阅地址不是有效的 URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('订阅地址只支持 HTTP 或 HTTPS')
  return url.toString()
}

export function newNodeId(): string {
  return randomUUID()
}
