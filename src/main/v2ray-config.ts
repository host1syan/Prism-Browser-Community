import type { V2rayNode } from '../shared/types'

export interface XrayStreamSettings {
  network: string
  security: string
  tlsSettings?: Record<string, unknown>
  realitySettings?: Record<string, unknown>
  wsSettings?: Record<string, unknown>
  grpcSettings?: Record<string, unknown>
  httpSettings?: Record<string, unknown>
  kcpSettings?: Record<string, unknown>
  quicSettings?: Record<string, unknown>
  sockopt?: Record<string, unknown>
}

function tlsSettings(node: V2rayNode): Record<string, unknown> | undefined {
  if (node.security !== 'tls') return undefined
  // allowInsecure stays false: a node that cannot validate its certificate must
  // fail loudly rather than silently downgrade the profile's transport.
  const settings: Record<string, unknown> = { allowInsecure: false }
  if (node.sni) settings.serverName = node.sni
  if (node.fingerprint) settings.fingerprint = node.fingerprint
  if (node.alpn?.length) settings.alpn = [...node.alpn]
  return settings
}

function realitySettings(node: V2rayNode): Record<string, unknown> | undefined {
  if (node.security !== 'reality') return undefined
  if (!node.publicKey) return undefined
  const settings: Record<string, unknown> = {
    serverName: node.sni ?? '',
    publicKey: node.publicKey,
    shortId: node.shortId ?? '',
    fingerprint: node.fingerprint ?? 'chrome'
  }
  if (node.alpn?.length) settings.alpn = [...node.alpn]
  return settings
}

export function buildStreamSettings(node: V2rayNode): XrayStreamSettings {
  const settings: XrayStreamSettings = {
    network: node.transport,
    security: node.security
  }
  const tls = tlsSettings(node)
  if (tls) settings.tlsSettings = tls
  const reality = realitySettings(node)
  if (reality) settings.realitySettings = reality

  if (node.transport === 'ws') {
    const ws: Record<string, unknown> = {}
    if (node.path) ws.path = node.path
    if (node.host) ws.headers = { Host: node.host }
    settings.wsSettings = ws
  } else if (node.transport === 'grpc') {
    settings.grpcSettings = { serviceName: node.path ?? '' }
  } else if (node.transport === 'http') {
    const http: Record<string, unknown> = {}
    if (node.host) http.host = [node.host]
    if (node.path) http.path = node.path
    settings.httpSettings = http
  } else if (node.transport === 'kcp') {
    settings.kcpSettings = { header: { type: 'none' } }
  } else if (node.transport === 'quic') {
    settings.quicSettings = { security: 'none', key: '', header: { type: 'none' } }
  }

  // The fingerprint browser already pins DNS behaviour; keeping the relay on
  // plain TCP avoids a second resolver leaking alongside the proxy.
  settings.sockopt = { domainStrategy: 'AsIs' }
  return settings
}

export function buildOutbound(node: V2rayNode): Record<string, unknown> {
  const streamSettings = buildStreamSettings(node)
  if (node.protocol === 'vmess') {
    return {
      protocol: 'vmess',
      settings: {
        vnext: [{
          address: node.address,
          port: node.port,
          users: [{
            id: node.uuid,
            alterId: node.alterId ?? 0,
            security: node.cipher ?? 'auto',
            level: 0
          }]
        }]
      },
      streamSettings
    }
  }
  if (node.protocol === 'vless') {
    const user: Record<string, unknown> = {
      id: node.uuid,
      encryption: node.encryption ?? 'none',
      level: 0
    }
    if (node.flow) user.flow = node.flow
    return {
      protocol: 'vless',
      settings: { vnext: [{ address: node.address, port: node.port, users: [user] }] },
      streamSettings
    }
  }
  if (node.protocol === 'trojan') {
    return {
      protocol: 'trojan',
      settings: {
        servers: [{ address: node.address, port: node.port, password: node.password, level: 0 }]
      },
      streamSettings
    }
  }
  return {
    protocol: 'shadowsocks',
    settings: {
      servers: [{
        address: node.address,
        port: node.port,
        method: node.cipher,
        password: node.password,
        level: 0
      }]
    },
    streamSettings
  }
}

/**
 * Builds a single-inbound Xray configuration that exposes one SOCKS5 listener
 * on loopback. Routing is deliberately minimal: everything the browser sends
 * must go through the node, with private ranges excluded so the local bridge
 * and the app itself stay reachable.
 */
export function buildXrayConfig(node: V2rayNode, socksPort: number, logPath?: string): Record<string, unknown> {
  return {
    log: {
      loglevel: 'warning',
      ...(logPath ? { error: logPath } : {}),
      access: 'none'
    },
    inbounds: [{
      tag: 'prism-socks',
      listen: '127.0.0.1',
      port: socksPort,
      protocol: 'socks',
      settings: { auth: 'noauth', udp: false, address: '127.0.0.1' },
      sniffing: { enabled: false }
    }],
    outbounds: [
      { tag: 'proxy', ...buildOutbound(node) },
      { tag: 'direct', protocol: 'freedom', settings: {} },
      { tag: 'block', protocol: 'blackhole', settings: {} }
    ],
    routing: {
      domainStrategy: 'AsIs',
      rules: [
        {
          type: 'field',
          outboundTag: 'direct',
          ip: ['127.0.0.0/8', '::1/128', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16', 'fc00::/7', 'fe80::/10']
        }
      ]
    }
  }
}
