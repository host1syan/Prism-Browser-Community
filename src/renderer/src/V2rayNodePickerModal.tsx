import { t } from '../../shared/i18n'
import { Alert, Button, Modal, Select, Space, Table, Tag, Tooltip, Typography } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BrowserProfileView, V2rayNodeTestResult, V2rayNodeView } from '../../shared/types'
import { nodeLabel, nodeTestText, sortNodesBySpeed } from './v2ray-node'

interface V2rayNodePickerModalProps {
  /** The profile whose node is being changed; null closes the modal. */
  profile: BrowserProfileView | null
  onClose: () => void
  /** Called with the new node id; the parent persists it and closes the modal. */
  onSelect: (nodeId: string) => Promise<void>
}

/** How many probes run at once. Each one spawns its own Xray process. */
const PROBE_CONCURRENCY = 4

type ProbeState = 'running' | 'ok' | 'failed'

/**
 * Picks a node for an existing profile.
 *
 * The list is sorted fastest-first using the measurements the subscription
 * manager recorded, so a node that just went bad is visibly at the bottom.
 * Changing the node changes the exit IP, so the caller closes the browser
 * first and reopens it afterwards.
 *
 * Probing is driven from here, one node at a time, so every row fills in as it
 * finishes instead of the user staring at a spinner until the whole batch ends.
 */
export function V2rayNodePickerModal({ profile, onClose, onSelect }: V2rayNodePickerModalProps) {
  const [nodes, setNodes] = useState<V2rayNodeView[]>([])
  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testingAll, setTestingAll] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [probes, setProbes] = useState<Record<string, ProbeState>>({})

  const cancelledRef = useRef(false)
  const profileIdRef = useRef<string | null>(null)
  // Measured results, kept in a ref so the probe loop reads the latest value
  // without being torn down and restarted on every state update.
  const resultsRef = useRef<Record<string, V2rayNodeTestResult>>({})

  useEffect(() => {
    if (!profile) return
    profileIdRef.current = profile.id
    cancelledRef.current = false
    resultsRef.current = {}
    setProbes({})
    setTestingAll(false)
    setProgress({ done: 0, total: 0 })
    setSelected(profile.proxy.v2rayNodeId)
    setLoading(true)
    void window.browserApi.v2ray.nodes()
      .then(setNodes)
      .catch(() => setNodes([]))
      .finally(() => setLoading(false))
    return () => { cancelledRef.current = true }
  }, [profile])

  /** The measurement to show: a fresh probe wins, otherwise the stored one. */
  const resultFor = useCallback(
    (node: V2rayNodeView): V2rayNodeTestResult | undefined => probes[node.id] ? resultsRef.current[node.id] ?? node.test : node.test,
    [probes]
  )

  // Live ranking: probing order stays the stored order, but the view re-sorts on
  // every measurement so the fastest node is already on top when the batch ends.
  const options = useMemo(
    () => sortNodesBySpeed(nodes.map((node) => ({ ...node, test: resultFor(node) }))),
    [nodes, resultFor]
  )

  async function probeOne(nodeId: string): Promise<void> {
    setProbes((current) => ({ ...current, [nodeId]: 'running' }))
    try {
      const result = await window.browserApi.v2ray.testNode(nodeId)
      resultsRef.current = { ...resultsRef.current, [nodeId]: result }
      setProbes((current) => ({ ...current, [nodeId]: result.ok ? 'ok' : 'failed' }))
    } catch {
      setProbes((current) => ({ ...current, [nodeId]: 'failed' }))
    }
  }

  async function testAll(): Promise<void> {
    cancelledRef.current = false
    setTestingAll(true)
    setProbes({})
    setProgress({ done: 0, total: nodes.length })
    let done = 0
    for (let index = 0; index < nodes.length; index += PROBE_CONCURRENCY) {
      if (cancelledRef.current) break
      await Promise.allSettled(nodes.slice(index, index + PROBE_CONCURRENCY).map((node) => probeOne(node.id)))
      done = Math.min(index + PROBE_CONCURRENCY, nodes.length)
      setProgress({ done, total: nodes.length })
    }
    setTestingAll(false)
    if (cancelledRef.current) return
    // Reflect the persisted measurements so the table sorts fastest-first.
    const refreshed = await window.browserApi.v2ray.nodes().catch(() => null)
    if (cancelledRef.current) return
    if (refreshed && profileIdRef.current === profile?.id) {
      setNodes(refreshed)
      setProbes({})
      resultsRef.current = {}
    }
  }

  function stopTesting(): void {
    cancelledRef.current = true
  }

  async function confirm(): Promise<void> {
    if (!selected) return
    setSaving(true)
    try {
      await onSelect(selected)
    } finally {
      setSaving(false)
    }
  }

  const canTest = nodes.length > 0 && !loading

  return (
    <Modal
      open={Boolean(profile)}
      title={t('切换 v2ray 节点')}
      okText={t('切换节点')}
      cancelText={t('取消')}
      okButtonProps={{ disabled: !selected || selected === profile?.proxy.v2rayNodeId }}
      confirmLoading={saving}
      onOk={() => void confirm()}
      onCancel={onClose}
      width={760}
      destroyOnHidden
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Typography.Text type="secondary">
          {t('环境 {0}', profile?.name ?? '')}
        </Typography.Text>
        <Space>
          <Button
            size="small"
            loading={testingAll}
            disabled={!canTest}
            onClick={() => void testAll()}
          >
            {t('测速全部')}
          </Button>
          {testingAll && (
            <Button size="small" danger onClick={stopTesting}>{t('停止测速')}</Button>
          )}
          {testingAll && progress.total > 0 && (
            <Typography.Text type="secondary">
              {t('正在测速：{0}/{1}', progress.done, progress.total)}
            </Typography.Text>
          )}
        </Space>
        <Select
          showSearch
          optionFilterProp="label"
          loading={loading}
          value={selected}
          onChange={setSelected}
          style={{ width: '100%' }}
          placeholder={options.length ? t('请选择节点') : t('尚未添加订阅')}
          options={options.map((node) => ({
            value: node.id,
            label: nodeLabel(node)
          }))}
          optionRender={(option) => {
            const node = options.find((item) => item.id === option.value)
            const text = nodeTestText(node?.test)
            return (
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <span>{option.label}</span>
                {text && <Typography.Text type="success">{text}</Typography.Text>}
              </Space>
            )
          }}
        />
        <Table
          size="small"
          rowKey="id"
          loading={loading}
          dataSource={options}
          pagination={{ pageSize: 8, hideOnSinglePage: true }}
          locale={{ emptyText: t('还没有可用节点') }}
          onRow={(record) => ({ onClick: () => setSelected(record.id), style: { cursor: 'pointer' } })}
          rowClassName={(record) => (record.id === selected ? 'v2ray-node-row-selected' : '')}
          columns={[
            {
              title: t('节点'),
              dataIndex: 'name',
              ellipsis: true,
              render: (value: string, record: V2rayNodeView) => (
                <Space>
                  <span>{value}</span>
                  {record.id === profile?.proxy.v2rayNodeId && <Tag color="blue">{t('当前')}</Tag>}
                </Space>
              )
            },
            {
              title: t('协议'),
              dataIndex: 'protocol',
              width: 100,
              render: (value: string) => <Tag>{value.toUpperCase()}</Tag>
            },
            {
              title: t('地址'),
              width: 200,
              ellipsis: true,
              render: (_value, record: V2rayNodeView) => `${record.address}:${record.port}`
            },
            {
              title: t('延迟'),
              width: 170,
              render: (_value, record: V2rayNodeView) => {
                if (probes[record.id] === 'running') return <Typography.Text type="secondary">{t('测速中')}</Typography.Text>
                const result = resultFor(record)
                const text = nodeTestText(result)
                if (text) return <Typography.Text type="success">{text}</Typography.Text>
                if (result && !result.ok) {
                  return (
                    <Tooltip title={result.error ? t('测速失败：{0}', result.error) : t('测速失败')}>
                      <Typography.Text type="danger">{t('测速失败')}</Typography.Text>
                    </Tooltip>
                  )
                }
                return <Typography.Text type="secondary">—</Typography.Text>
              }
            },
            {
              title: t('操作'),
              width: 90,
              render: (_value, record: V2rayNodeView) => (
                <Button
                  size="small"
                  loading={probes[record.id] === 'running'}
                  disabled={testingAll}
                  onClick={(event) => {
                    event.stopPropagation()
                    void probeOne(record.id)
                  }}
                >
                  {t('测速')}
                </Button>
              )
            }
          ]}
        />
        <Alert
          type="info"
          showIcon
          message={t('切换后自动重新打开')}
          description={t('切换节点会更换出口 IP，因此需要先关闭该环境；如果它正在运行，将先自动关闭再重新打开。')}
        />
      </Space>
    </Modal>
  )
}
