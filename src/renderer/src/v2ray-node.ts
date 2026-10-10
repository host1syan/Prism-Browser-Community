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
