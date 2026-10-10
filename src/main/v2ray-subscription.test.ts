import { describe, expect, it } from 'vitest'
import {
  MAX_SUBSCRIPTION_NODES,
  parseShareLink,
  parseSubscriptionContent,
  sanitizeSubscriptionUrl,
  validateSubscriptionUrl
} from './v2ray-subscription'

const SUBSCRIPTION_ID = '11111111-2222-4333-8444-555555555555'

function vmessLink(payload: Record<string, unknown>): string {
  return `vmess://${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')}`
}

describe('parseShareLink', () => {
  it('maps a vmess link including transport and TLS fields', () => {
    const node = parseShareLink(vmessLink({
      v: '2',
      ps: '香港 01',
      add: 'hk1.example.com',
      port: '443',
      id: 'b831381d-6324-4d53-ad4f-8cda48b30811',
      aid: '0',
      scy: 'auto',
      net: 'ws',
      host: 'cdn.example.com',
      path: '/ray',
      tls: 'tls',
      sni: 'cdn.example.com',
      alpn: 'h2,http/1.1'
    }), SUBSCRIPTION_ID)

    expect(node).toMatchObject({
      protocol: 'vmess',
      name: '香港 01',
      address: 'hk1.example.com',
      port: 443,
      uuid: 'b831381d-6324-4d53-ad4f-8cda48b30811',
      alterId: 0,
      transport: 'ws',
      host: 'cdn.example.com',
      path: '/ray',
      security: 'tls',
      sni: 'cdn.example.com',
      alpn: ['h2', 'http/1.1'],
      subscriptionId: SUBSCRIPTION_ID
    })
  })

  it('derives a stable id so a refresh keeps profile bindings intact', () => {
    const payload = { ps: 'tokyo', add: 'jp.example.com', port: 8443, id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }
    const first = parseShareLink(vmessLink(payload), SUBSCRIPTION_ID)
    const second = parseShareLink(vmessLink({ ...payload, scy: 'chacha20-poly1305' }), SUBSCRIPTION_ID)
    expect(first.id).toBe(second.id)
    expect(first.id).toMatch(/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/)
  })

  it('separates ids across subscriptions', () => {
    const payload = { ps: 'tokyo', add: 'jp.example.com', port: 8443, id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }
    const other = '99999999-8888-4777-8666-555555555555'
    expect(parseShareLink(vmessLink(payload), SUBSCRIPTION_ID).id)
      .not.toBe(parseShareLink(vmessLink(payload), other).id)
  })

  it('parses a vless reality link', () => {
    const node = parseShareLink(
      'vless://aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee@1.2.3.4:443?encryption=none&security=reality&sni=www.example.com&pbk=PUBKEY&sid=ab12&fp=chrome&type=grpc&serviceName=grpcsvc#reality-node',
      SUBSCRIPTION_ID
    )
    expect(node).toMatchObject({
      protocol: 'vless',
      name: 'reality-node',
      address: '1.2.3.4',
      port: 443,
      uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      security: 'reality',
      sni: 'www.example.com',
      publicKey: 'PUBKEY',
      shortId: 'ab12',
      fingerprint: 'chrome',
      transport: 'grpc',
      path: 'grpcsvc'
    })
  })

  it('parses a trojan link and uses the password as the credential', () => {
    const node = parseShareLink('trojan://secret@tj.example.com:8443?security=tls&sni=tj.example.com#trojan-1', SUBSCRIPTION_ID)
    expect(node).toMatchObject({
      protocol: 'trojan',
      password: 'secret',
      address: 'tj.example.com',
      port: 8443,
      security: 'tls',
      transport: 'tcp'
    })
  })

  it('parses SIP002 shadowsocks and legacy shadowsocks links', () => {
    // base64url output may contain '-' and '_'; a SIP002 userinfo is standard
    // base64, so re-encode to the alphabet the format actually uses.
    const userinfo = Buffer.from('aes-256-gcm:pass123', 'utf8').toString('base64').replace(/=+$/, '')
    const sip002 = parseShareLink(
      `ss://${userinfo}@ss.example.com:8388#ss-node`,
      SUBSCRIPTION_ID
    )
    expect(sip002).toMatchObject({
      protocol: 'shadowsocks',
      name: 'ss-node',
      address: 'ss.example.com',
      port: 8388,
      cipher: 'aes-256-gcm',
      password: 'pass123'
    })

    const legacy = parseShareLink(
      `ss://${Buffer.from('aes-128-gcm:pw@legacy.example.com:8389', 'utf8').toString('base64')}`,
      SUBSCRIPTION_ID
    )
    expect(legacy).toMatchObject({
      protocol: 'shadowsocks',
      address: 'legacy.example.com',
      port: 8389,
      cipher: 'aes-128-gcm',
      password: 'pw'
    })
  })

  it('flags SIP003 plugin nodes instead of silently dropping the plugin', () => {
    const userinfo = Buffer.from('aes-256-gcm:pass', 'utf8').toString('base64').replace(/=+$/, '')
    const node = parseShareLink(
      `ss://${userinfo}@ss.example.com:8388?plugin=obfs-local%3Bobfs%3Dhttp#plugin-node`,
      SUBSCRIPTION_ID
    )
    expect(node.parseWarning).toContain('SIP003')
  })

  it('rejects malformed links with a user-facing message', () => {
    expect(() => parseShareLink('http://example.com', SUBSCRIPTION_ID)).toThrow(/不支持的节点协议/)
    expect(() => parseShareLink(vmessLink({ add: 'a.com', port: 443 }), SUBSCRIPTION_ID)).toThrow(/缺少用户 ID/)
    expect(() => parseShareLink(vmessLink({ id: 'x', port: 443 }), SUBSCRIPTION_ID)).toThrow(/缺少服务器地址/)
    expect(() => parseShareLink('trojan://@a.com:443', SUBSCRIPTION_ID)).toThrow(/缺少凭据/)
    // An out-of-range port makes the URL itself unparsable, so the message is
    // the generic format error rather than the port one.
    expect(() => parseShareLink('vless://uuid@a.com:99999', SUBSCRIPTION_ID)).toThrow(/链接格式无效/)
    expect(() => parseShareLink('vless://uuid@a.com', SUBSCRIPTION_ID)).toThrow(/端口无效/)
  })
})

describe('parseSubscriptionContent', () => {
  it('decodes a base64 subscription body and skips duplicates', () => {
    const link = vmessLink({ ps: 'node', add: 'a.com', port: 443, id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' })
    const body = Buffer.from(`${link}\n${link}\n`, 'utf8').toString('base64')
    const { nodes, errors } = parseSubscriptionContent(body, SUBSCRIPTION_ID)
    expect(nodes).toHaveLength(1)
    expect(errors).toHaveLength(0)
  })

  it('reports per-line failures but keeps the nodes that parsed', () => {
    const good = vmessLink({ ps: 'ok', add: 'a.com', port: 443, id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' })
    const { nodes, errors } = parseSubscriptionContent(`${good}\nvmess://not-base64!!\n`, SUBSCRIPTION_ID)
    expect(nodes).toHaveLength(1)
    expect(errors).toHaveLength(1)
  })

  it('throws when nothing usable was found', () => {
    expect(() => parseSubscriptionContent('vmess://@@@', SUBSCRIPTION_ID)).toThrow(/没有可用节点/)
    expect(() => parseSubscriptionContent('hello world', SUBSCRIPTION_ID)).toThrow(/没有找到节点链接/)
  })

  it('accepts plain link lists without base64 wrapping', () => {
    const link = 'trojan://pw@a.com:443#n1'
    const { nodes } = parseSubscriptionContent(link, SUBSCRIPTION_ID)
    expect(nodes[0].protocol).toBe('trojan')
  })

  it('caps the node count', () => {
    const links = Array.from({ length: MAX_SUBSCRIPTION_NODES + 10 }, (_, index) =>
      `trojan://pw@a${index}.com:443#n${index}`).join('\n')
    const { nodes, errors } = parseSubscriptionContent(links, SUBSCRIPTION_ID)
    expect(nodes).toHaveLength(MAX_SUBSCRIPTION_NODES)
    expect(errors.some((error) => error.includes('上限'))).toBe(true)
  })

  it('rejects oversized payloads', () => {
    expect(() => parseSubscriptionContent('x'.repeat(5 * 1024 * 1024), SUBSCRIPTION_ID)).toThrow(/4 MB/)
  })
})

describe('subscription URL handling', () => {
  it('keeps the access token out of the display string', () => {
    const display = sanitizeSubscriptionUrl('https://sub.example.com/api/v1/client/subscribe?token=SECRET123')
    expect(display).toBe('https://sub.example.com/…')
    expect(display).not.toContain('SECRET123')
  })

  it('accepts only http and https URLs', () => {
    expect(validateSubscriptionUrl('https://sub.example.com/x?token=1')).toBe('https://sub.example.com/x?token=1')
    expect(() => validateSubscriptionUrl('file:///etc/passwd')).toThrow(/只支持 HTTP 或 HTTPS/)
    expect(() => validateSubscriptionUrl('not a url')).toThrow(/不是有效的 URL/)
    expect(() => validateSubscriptionUrl('')).toThrow(/不能为空/)
  })
})
