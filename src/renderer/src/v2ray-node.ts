import type { V2rayNodeTestResult, V2rayNodeView } from '../../shared/types'

/**
 * Sorts nodes fastest-first: measured-and-ok, then failed, then untested.
 * Within the ok group the lower latency wins. Ties keep their incoming order,
 * which matters while a batch is still running — an unmeasured node must not
 * jump around just because its neighbour was probed first.
 */
export function sortNodesBySpeed(nodes: V2rayNodeView[]): V2rayNodeView[] {
  const rank = (node: V2rayNodeView): number => {
    const test = node.test
    if (!test) return 2
    return test.ok ? 0 : 1
  }
  // Array.prototype.sort is stable, so equal elements stay in input order.
  return [...nodes].sort((first, second) => {
    const delta = rank(first) - rank(second)
    if (delta !== 0) return delta
    const left = first.test?.latencyMs ?? Number.MAX_SAFE_INTEGER
    const right = second.test?.latencyMs ?? Number.MAX_SAFE_INTEGER
    return left - right
  })
}

/** The green trailing text: latency plus country, or nothing when unmeasured. */
export function nodeTestText(test: V2rayNodeTestResult | undefined): string | undefined {
  if (!test?.ok) return undefined
  return `${test.latencyMs} ms${test.country ? ` · ${test.country}` : ''}`
}

/** Label used everywhere a node is listed, so search stays consistent. */
export function nodeLabel(node: V2rayNodeView): string {
  return `${node.name} · ${node.protocol.toUpperCase()} · ${node.address}:${node.port}`
}

export interface ProbePoolOptions {
  /** Polled before each item is handed out; true stops the pool taking more. */
  isCancelled: () => boolean
  onProgress?: (done: number, total: number) => void
}

/**
 * Runs `probe` over every item with a fixed number of workers.
 *
 * A worker takes the next item the moment it finishes its own, so one slow item
 * never parks the others. Chunking with `Promise.allSettled` looks equivalent
 * but is not: a single item that takes the full timeout holds up every worker
 * in its chunk, and the ones already finished sit idle instead of moving on.
 *
 * `cursor` is read and advanced without an intervening await, so no two workers
 * can claim the same item.
 */
export async function probePool<T>(
  items: T[],
  concurrency: number,
  probe: (item: T) => Promise<void>,
  options: ProbePoolOptions
): Promise<number> {
  const total = items.length
  let cursor = 0
  let done = 0
  const workers = Math.max(1, Math.min(concurrency, total))
  await Promise.all(Array.from({ length: workers }, async () => {
    while (!options.isCancelled()) {
      const index = cursor
      cursor += 1
      if (index >= total) return
      try {
        await probe(items[index])
      } catch {
        // A probe reports its own failure on its row; it must not kill the pool.
      }
      done += 1
      options.onProgress?.(done, total)
    }
  }))
  return done
}
