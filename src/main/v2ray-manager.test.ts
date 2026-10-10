import { describe, expect, it } from 'vitest'
import type { V2rayNode } from '../shared/types'
import { V2rayManager, NODE_TEST_TIMEOUT_MS } from './v2ray-manager'
import type { V2rayCore } from './v2ray-core'
import type { V2rayStore } from './v2ray-store'

const NODE_ID = '11111111-2222-4333-8444-555555555555'

function node(): V2rayNode {
  return {
    id: NODE_ID,
    subscriptionId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    name: 'node',
    protocol: 'vmess',
    address: 'a.example.com',
    port: 443,
    uuid: 'b831381d-6324-4d53-ad4f-8cda48b30811',
    security: 'tls',
    transport: 'ws'
  }
}

/** Only the two members testNode touches. */
function storeStub(record: (result: unknown) => void): V2rayStore {
  return {
    node: (id: string) => (id === NODE_ID ? node() : undefined),
    recordNodeTest: async (_id: string, result: unknown) => { record(result) }
  } as unknown as V2rayStore
}

describe('V2rayManager.testNode timeout ceiling', () => {
  it('returns a timeout result when the relay never comes up', async () => {
    // locate() never settles, which is what a wedged core lookup looks like.
    // Without the hard deadline the caller would hang here indefinitely.
    const core = { locate: () => new Promise<string>(() => undefined) } as unknown as V2rayCore
    let recorded: unknown
    const manager = new V2rayManager({
      store: storeStub((result) => { recorded = result }),
      core,
      vaultPath: '/tmp/prism-v2ray-test-vault',
      nodeTestTimeoutMs: 150
    })

    const startedAt = Date.now()
    const result = await manager.testNode(NODE_ID)
    const elapsed = Date.now() - startedAt

    expect(result.ok).toBe(false)
    expect(result.failureKind).toBe('timeout')
    expect(result.error).toContain('测速超过')
    // Well under the ceiling would mean the probe failed for another reason;
    // far over would mean the deadline did not actually cut it off.
    expect(elapsed).toBeGreaterThanOrEqual(140)
    expect(elapsed).toBeLessThan(1_000)
    expect(recorded).toMatchObject({ ok: false, failureKind: 'timeout' })
  })

  it('reports a missing node without waiting for the deadline', async () => {
    const core = { locate: () => new Promise<string>(() => undefined) } as unknown as V2rayCore
    const manager = new V2rayManager({
      store: storeStub(() => undefined),
      core,
      vaultPath: '/tmp/prism-v2ray-test-vault',
      nodeTestTimeoutMs: 5_000
    })

    const startedAt = Date.now()
    await expect(manager.testNode('99999999-9999-4999-8999-999999999999')).rejects.toThrow('节点不存在')
    expect(Date.now() - startedAt).toBeLessThan(500)
  })

  it('defaults the ceiling to ten seconds', () => {
    expect(NODE_TEST_TIMEOUT_MS).toBe(10_000)
  })
})
