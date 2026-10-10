import { describe, expect, it, vi } from 'vitest'
import type { V2rayNodeTestResult, V2rayNodeView } from '../../shared/types'
import { probePool, sortNodesBySpeed } from './v2ray-node'

function node(id: string, overrides: Partial<V2rayNodeView> = {}): V2rayNodeView {
  return {
    id,
    subscriptionId: 'sub-1',
    name: id,
    protocol: 'vless',
    address: `${id}.example.test`,
    port: 443,
    security: 'tls',
    transport: 'tcp',
    hasCredentials: true,
    ...overrides
  }
}

function result(latencyMs: number, ok = true): V2rayNodeTestResult {
  return { ok, latencyMs, testedAt: '2026-10-10T00:00:00.000Z' }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => { resolve = settle })
  return { promise, resolve }
}

describe('probePool', () => {
  it('keeps every worker busy when one item stalls', async () => {
    // The stalled item must not park the other workers: with three workers over
    // five items, the four fast ones all start before the stall clears.
    const stall = deferred<void>()
    const started: string[] = []
    const items = ['stall', 'b', 'c', 'd', 'e']
    const running = probePool(items, 3, async (id) => {
      started.push(id)
      if (id === 'stall') await stall.promise
    }, { isCancelled: () => false })

    await vi.waitFor(() => expect(started).toContain('e'))
    expect(started.slice(0, 3).sort()).toEqual(['b', 'c', 'stall'])
    expect(started).toContain('d')
    expect(started).toContain('e')

    stall.resolve()
    await expect(running).resolves.toBe(5)
  })

  it('never hands the same item to two workers', async () => {
    const seen: string[] = []
    const items = Array.from({ length: 40 }, (_value, index) => `n${index}`)
    await probePool(items, 4, async (id) => {
      seen.push(id)
      await new Promise((resolve) => setTimeout(resolve, 1))
    }, { isCancelled: () => false })
    expect(seen.sort()).toEqual([...items].sort())
  })

  it('stops taking new items once cancelled but lets running ones finish', async () => {
    const started: string[] = []
    let cancelled = false
    const done = await probePool(['a', 'b', 'c', 'd'], 2, async (id) => {
      started.push(id)
      await new Promise((resolve) => setTimeout(resolve, 5))
      if (id === 'a') cancelled = true
    }, { isCancelled: () => cancelled })
    expect(started).toHaveLength(2)
    expect(done).toBe(2)
  })

  it('reports progress as items settle', async () => {
    const progress: Array<[number, number]> = []
    await probePool(['a', 'b', 'c'], 2, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1))
    }, { isCancelled: () => false, onProgress: (done, total) => progress.push([done, total]) })
    expect(progress.at(-1)).toEqual([3, 3])
    expect(progress.map(([done]) => done)).toEqual([1, 2, 3])
  })

  it('survives a probe that throws', async () => {
    const attempted: string[] = []
    const done = await probePool(['a', 'b', 'c'], 2, async (id) => {
      attempted.push(id)
      if (id === 'b') throw new Error('boom')
    }, { isCancelled: () => false })
    expect(attempted.sort()).toEqual(['a', 'b', 'c'])
    expect(done).toBe(3)
  })

  it('runs a single item without spawning idle workers', async () => {
    let concurrent = 0
    let peak = 0
    await probePool(['only'], 4, async () => {
      concurrent += 1
      peak = Math.max(peak, concurrent)
      await new Promise((resolve) => setTimeout(resolve, 1))
      concurrent -= 1
    }, { isCancelled: () => false })
    expect(peak).toBe(1)
  })
})

describe('sortNodesBySpeed', () => {
  it('puts measured nodes first, then failures, then untested', () => {
    const sorted = sortNodesBySpeed([
      node('untested'),
      node('slow', { test: result(300) }),
      node('dead', { test: result(0, false) }),
      node('fast', { test: result(40) })
    ])
    expect(sorted.map((item) => item.id)).toEqual(['fast', 'slow', 'dead', 'untested'])
  })

  it('keeps untested nodes in their incoming order', () => {
    const sorted = sortNodesBySpeed([node('b'), node('a'), node('c')])
    expect(sorted.map((item) => item.id)).toEqual(['b', 'a', 'c'])
  })

  it('lifts a row as soon as its measurement lands', () => {
    // Mid-batch state: only the second node has been measured.
    const nodes = [node('a'), node('b', { test: result(12) }), node('c')]
    expect(sortNodesBySpeed(nodes).map((item) => item.id)).toEqual(['b', 'a', 'c'])
  })
})
