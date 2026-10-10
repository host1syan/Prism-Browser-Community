import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { V2rayNode } from '../shared/types'
import { V2rayStore } from './v2ray-store'

const temporaryPaths: string[] = []

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

async function vault(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'prism-v2ray-'))
  temporaryPaths.push(path)
  return path
}

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
    ...overrides
  }
}

const reencodingCodec = {
  encode: (value: string) => (value ? `x:${Buffer.from(value, 'utf8').toString('base64')}` : ''),
  decode: (value: string) => (value.startsWith('x:') ? Buffer.from(value.slice(2), 'base64').toString('utf8') : value)
}

describe('V2rayStore', () => {
  it('persists subscriptions and nodes across reopen', async () => {
    const path = await vault()
    const store = new V2rayStore(path, reencodingCodec)
    await store.initialize()
    await store.addSubscription({ id: node().subscriptionId, name: '机场', source: 'url', url: 'https://sub.example.com/x?token=SECRET' })
    await store.replaceNodes(node().subscriptionId, [node()])

    const reopened = new V2rayStore(path, reencodingCodec)
    await reopened.initialize()
    const subscriptions = reopened.listSubscriptions()
    expect(subscriptions).toHaveLength(1)
    expect(subscriptions[0]).toMatchObject({ name: '机场', nodeCount: 1 })
    expect(reopened.node(node().id)?.uuid).toBe(node().uuid)
  })

  it('encrypts the subscription URL and keeps the token out of the file', async () => {
    const path = await vault()
    const store = new V2rayStore(path, reencodingCodec)
    await store.initialize()
    await store.addSubscription({ id: node().subscriptionId, name: '机场', source: 'url', url: 'https://sub.example.com/x?token=SECRET' })

    const raw = await readFile(join(path, 'v2ray.json'), 'utf8')
    expect(raw).not.toContain('SECRET')
    expect(store.subscriptionUrl(node().subscriptionId)).toBe('https://sub.example.com/x?token=SECRET')
    expect(store.listSubscriptions()[0].displayUrl).toBe('https://sub.example.com/…')
  })

  it('never exposes node credentials to the renderer projection', async () => {
    const path = await vault()
    const store = new V2rayStore(path, reencodingCodec)
    await store.initialize()
    await store.addSubscription({ id: node().subscriptionId, name: '机场', source: 'manual' })
    await store.replaceNodes(node().subscriptionId, [node(), node({ id: '99999999-8888-4777-8666-555555555555', protocol: 'trojan', uuid: undefined, password: 'pw' })])

    const views = store.listNodes()
    expect(views).toHaveLength(2)
    for (const view of views) {
      expect(view).not.toHaveProperty('uuid')
      expect(view).not.toHaveProperty('password')
      expect(view.hasCredentials).toBe(true)
    }
  })

  it('replaces nodes on refresh instead of accumulating them', async () => {
    const path = await vault()
    const store = new V2rayStore(path, reencodingCodec)
    await store.initialize()
    await store.addSubscription({ id: node().subscriptionId, name: '机场', source: 'manual' })
    await store.replaceNodes(node().subscriptionId, [node()])
    await store.replaceNodes(node().subscriptionId, [node({ name: 'renamed' })])

    const nodes = store.listNodes()
    expect(nodes).toHaveLength(1)
    expect(nodes[0].name).toBe('renamed')
    expect(store.listSubscriptions()[0].nodeCount).toBe(1)
  })

  it('drops nodes when their subscription is removed', async () => {
    const path = await vault()
    const store = new V2rayStore(path, reencodingCodec)
    await store.initialize()
    await store.addSubscription({ id: node().subscriptionId, name: '机场', source: 'manual' })
    await store.replaceNodes(node().subscriptionId, [node()])
    await store.removeSubscription(node().subscriptionId)
    expect(store.listSubscriptions()).toHaveLength(0)
    expect(store.listNodes()).toHaveLength(0)
  })

  it('starts empty when the file is missing and rejects a corrupt one', async () => {
    const path = await vault()
    const fresh = new V2rayStore(path, reencodingCodec)
    await fresh.initialize()
    expect(fresh.listSubscriptions()).toHaveLength(0)

    await writeFile(join(path, 'v2ray.json'), '{ not json')
    const broken = new V2rayStore(path, reencodingCodec)
    await expect(broken.initialize()).rejects.toThrow(/不是有效 JSON/)
  })

  it('discards orphaned nodes that reference a missing subscription', async () => {
    const path = await vault()
    await writeFile(join(path, 'v2ray.json'), JSON.stringify({
      schemaVersion: 1,
      subscriptions: [],
      nodes: [{
        id: node().id,
        subscriptionId: node().subscriptionId,
        name: 'orphan',
        protocol: 'vmess',
        address: 'a.example.com',
        port: 443,
        uuid: '',
        password: '',
        security: 'none',
        transport: 'tcp'
      }]
    }))
    const store = new V2rayStore(path, reencodingCodec)
    await store.initialize()
    expect(store.listNodes()).toHaveLength(0)
  })
})
