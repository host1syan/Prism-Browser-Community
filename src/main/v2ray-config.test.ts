import { describe, expect, it } from 'vitest'
import type { V2rayNode } from '../shared/types'
import { buildOutbound, buildStreamSettings, buildXrayConfig } from './v2ray-config'

function node(overrides: Partial<V2rayNode> = {}): V2rayNode {
  return {
    id: '11111111-2222-4333-8444-555555555555',
    subscriptionId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    name: 'node',
    protocol: 'vmess',
    address: 'a.example.com',
    port: 443,
    uuid: 'b831381d-6324-4d53-ad4f-8cda48b30811',
    security: 'tls',
    transport: 'ws',
    path: '/ray',
    host: 'cdn.example.com',
    ...overrides
  }
}

describe('buildStreamSettings', () => {
  it('maps a websocket transport with a Host header', () => {
    const stream = buildStreamSettings(node({ sni: 'cdn.example.com' }))
    expect(stream).toMatchObject({
      network: 'ws',
      security: 'tls',
      wsSettings: { path: '/ray', headers: { Host: 'cdn.example.com' } },
      tlsSettings: { serverName: 'cdn.example.com', allowInsecure: false }
    })
  })

  it('emits reality settings only when the public key is present', () => {
    const withKey = buildStreamSettings(node({ security: 'reality', publicKey: 'PBK', shortId: 'ab', fingerprint: 'chrome' }))
    expect(withKey.realitySettings).toMatchObject({ publicKey: 'PBK', shortId: 'ab', fingerprint: 'chrome' })

    const withoutKey = buildStreamSettings(node({ security: 'reality', publicKey: undefined }))
    expect(withoutKey.realitySettings).toBeUndefined()
  })

  it('maps grpc service names and http hosts', () => {
    expect(buildStreamSettings(node({ transport: 'grpc', path: 'svc' })).grpcSettings).toEqual({ serviceName: 'svc' })
    expect(buildStreamSettings(node({ transport: 'http', host: 'h.example.com', path: '/p' })).httpSettings)
      .toEqual({ host: ['h.example.com'], path: '/p' })
  })

  it('leaves an empty tls block for a plain tcp node', () => {
    const stream = buildStreamSettings(node({ transport: 'tcp', security: 'none' }))
    expect(stream.tlsSettings).toBeUndefined()
    expect(stream.network).toBe('tcp')
    expect(stream.security).toBe('none')
  })
})

describe('buildOutbound', () => {
  it('builds a vmess vnext user with alterId and cipher', () => {
    expect(buildOutbound(node({ alterId: 0, cipher: 'auto' }))).toMatchObject({
      protocol: 'vmess',
      settings: { vnext: [{ address: 'a.example.com', port: 443, users: [{ id: node().uuid, alterId: 0, security: 'auto' }] }] }
    })
  })

  it('builds a vless user with flow and encryption', () => {
    const outbound = buildOutbound(node({ protocol: 'vless', flow: 'xtls-rprx-vision', encryption: 'none' }))
    expect(outbound).toMatchObject({
      protocol: 'vless',
      settings: { vnext: [{ users: [{ id: node().uuid, flow: 'xtls-rprx-vision', encryption: 'none' }] }] }
    })
  })

  it('builds trojan and shadowsocks servers', () => {
    expect(buildOutbound(node({ protocol: 'trojan', uuid: undefined, password: 'pw' }))).toMatchObject({
      protocol: 'trojan',
      settings: { servers: [{ address: 'a.example.com', port: 443, password: 'pw' }] }
    })
    expect(buildOutbound(node({ protocol: 'shadowsocks', uuid: undefined, password: 'pw', cipher: 'aes-256-gcm' }))).toMatchObject({
      protocol: 'shadowsocks',
      settings: { servers: [{ address: 'a.example.com', port: 443, method: 'aes-256-gcm', password: 'pw' }] }
    })
  })
})

describe('buildXrayConfig', () => {
  it('exposes one loopback socks inbound and routes private ranges direct', () => {
    const config = buildXrayConfig(node(), 10808, '/tmp/xray.log')
    expect(config.inbounds).toEqual([{
      tag: 'prism-socks',
      listen: '127.0.0.1',
      port: 10808,
      protocol: 'socks',
      settings: { auth: 'noauth', udp: false, address: '127.0.0.1' },
      sniffing: { enabled: false }
    }])
    const outbounds = config.outbounds as Array<Record<string, unknown>>
    expect(outbounds.map((outbound) => outbound.tag)).toEqual(['proxy', 'direct', 'block'])
    const rules = (config.routing as { rules: Array<{ outboundTag: string; ip: string[] }> }).rules
    expect(rules[0].outboundTag).toBe('direct')
    expect(rules[0].ip).toContain('127.0.0.0/8')
    expect(rules[0].ip).toContain('192.168.0.0/16')
  })

  it('disables udp on the inbound so no traffic escapes the relay', () => {
    const config = buildXrayConfig(node(), 10808)
    const inbound = (config.inbounds as Array<{ settings: { udp: boolean } }>)[0]
    expect(inbound.settings.udp).toBe(false)
  })
})
