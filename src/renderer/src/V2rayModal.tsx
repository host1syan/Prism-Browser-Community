import { t, translateMessage as mt } from '../../shared/i18n'
import { DeleteOutlined, ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { Alert, Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Tooltip, Typography, message } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { V2rayCoreStatus, V2rayNodeTestResult, V2rayNodeView, V2raySubscription, V2raySubscriptionDraft } from '../../shared/types'
import { probePool, sortNodesBySpeed } from './v2ray-node'

interface V2rayModalProps {
  open: boolean
  onClose: () => void
}

interface SubscriptionFormValues {
  name: string
  source: 'url' | 'manual'
  content: string
}

/** How many probes run at once. Each one spawns its own Xray process. */
const PROBE_CONCURRENCY = 4

export function V2rayModal({ open, onClose }: V2rayModalProps) {
  const [form] = Form.useForm<SubscriptionFormValues>()
  const source = Form.useWatch('source', form) ?? 'url'
  const [subscriptions, setSubscriptions] = useState<V2raySubscription[]>([])
  const [nodes, setNodes] = useState<V2rayNodeView[]>([])
  const [core, setCore] = useState<V2rayCoreStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [coreBusy, setCoreBusy] = useState(false)
  const [testingAllSubscriptionId, setTestingAllSubscriptionId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, V2rayNodeTestResult>>({})
  const [probes, setProbes] = useState<Record<string, 'running' | 'ok' | 'failed'>>({})
  const [testProgress, setTestProgress] = useState({ done: 0, total: 0 })

  const cancelledRef = useRef(false)
  /** Which subscription the last batch probed, so only it gets re-sorted. */
  const lastTestedSubscriptionRef = useRef<string | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    const [nextSubscriptions, nextNodes, coreStatus] = await Promise.all([
      window.browserApi.v2ray.subscriptions(),
      window.browserApi.v2ray.nodes(),
      window.browserApi.v2ray.coreStatus()
    ])
    setSubscriptions(nextSubscriptions)
    setNodes(nextNodes)
    setCore(coreStatus)
  }, [])

  useEffect(() => {
    if (!open) return
    form.setFieldsValue({ name: '', source: 'url', content: '' })
    setTestResults({})
    lastTestedSubscriptionRef.current = null
    setTestingAllSubscriptionId(null)
    setProbes({})
    setTestProgress({ done: 0, total: 0 })
    cancelledRef.current = false
    void reload().catch(() => undefined)
    return () => { cancelledRef.current = true }
  }, [form, open, reload])

  /** Node's measurement: the in-session one wins, otherwise the persisted one. */
  function resultFor(node: V2rayNodeView): V2rayNodeTestResult | undefined {
    return testResults[node.id] ?? node.test
  }

  /**
   * Speed ranking applies to the probed subscription only. Re-sorting the whole
   * table would move rows the user never asked about.
   *
   * Ordering is live: each measurement lifts its row into place as soon as it
   * lands, so the fastest node is already on top when the batch ends. Rows that
   * have not been measured yet keep their original relative order.
   */
  const displayNodes = useMemo(() => {
    const subscriptionId = lastTestedSubscriptionRef.current
    if (!subscriptionId) return nodes
    const measured = nodes
      .filter((node) => node.subscriptionId === subscriptionId)
      .map((node) => ({ ...node, test: resultFor(node) }))
    const rest = nodes.filter((node) => node.subscriptionId !== subscriptionId)
    return [...sortNodesBySpeed(measured), ...rest]
  }, [nodes, testResults, probes])

  async function run(action: () => Promise<unknown>, successText: string): Promise<void> {
    setBusy(true)
    try {
      await action()
      await reload()
      message.success(successText)
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  async function addSubscription(): Promise<void> {
    const values = await form.validateFields()
    await run(
      () => window.browserApi.v2ray.addSubscription(values as V2raySubscriptionDraft),
      t('订阅已添加')
    )
    form.setFieldsValue({ name: '', content: '' })
  }

  async function testNode(nodeId: string): Promise<void> {
    // Ranking is scoped to the subscription a measurement belongs to, so a
    // single manual probe also lifts its row into place.
    const owner = nodes.find((node) => node.id === nodeId)
    if (owner) lastTestedSubscriptionRef.current = owner.subscriptionId
    setProbes((current) => ({ ...current, [nodeId]: 'running' }))
    try {
      const result = await window.browserApi.v2ray.testNode(nodeId)
      setTestResults((current) => ({ ...current, [nodeId]: result }))
      setProbes((current) => ({ ...current, [nodeId]: result.ok ? 'ok' : 'failed' }))
    } catch (error) {
      setTestResults((current) => ({
        ...current,
        [nodeId]: {
          ok: false,
          latencyMs: 0,
          testedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error)
        }
      }))
      setProbes((current) => ({ ...current, [nodeId]: 'failed' }))
    }
  }

  /**
   * Probes every node of one subscription with a fixed number of workers.
   *
   * The loop lives here rather than behind a single IPC call so each row can
   * show its own state as soon as it finishes — a large subscription would
   * otherwise sit behind a spinner for minutes with no feedback. Results are
   * merged per node, never cleared wholesale, so a manual probe the user just
   * ran on another subscription stays visible.
   *
   * Ranking is live: `displayNodes` re-sorts on every result, so the fastest
   * node is already on top while the batch is still running.
   */
  async function testAllNodes(subscriptionId: string): Promise<void> {
    const ids = nodes.filter((node) => node.subscriptionId === subscriptionId).map((node) => node.id)
    if (!ids.length) return
    cancelledRef.current = false
    lastTestedSubscriptionRef.current = subscriptionId
    setTestingAllSubscriptionId(subscriptionId)
    setTestProgress({ done: 0, total: ids.length })
    try {
      const probed = await probePool(ids, PROBE_CONCURRENCY, testNode, {
        isCancelled: () => cancelledRef.current,
        onProgress: (done, total) => setTestProgress({ done, total })
      })
      if (cancelledRef.current) {
        message.info(t('已停止测速'))
        return
      }
      if (!probed) return
      message.success(t('测速完成，已按速度排序'))
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error))
    } finally {
      setTestingAllSubscriptionId(null)
    }
  }

  async function installCore(importLocal: boolean): Promise<void> {
    setCoreBusy(true)
    try {
      const status = importLocal
        ? await window.browserApi.v2ray.importCore()
        : await window.browserApi.v2ray.installCore()
      if (status) {
        setCore(status)
        message.success(t('Xray 内核已就绪'))
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error))
    } finally {
      setCoreBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={880}
      title={t('V2Ray 订阅')}
      destroyOnHidden
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Alert
          type={core?.installed ? 'success' : 'warning'}
          showIcon
          message={core?.installed ? t('Xray 内核已就绪：{0}', core.version ?? core.message) : t('尚未安装 Xray 内核')}
          description={core?.installed
            ? undefined
            : t('连接 v2ray 节点需要 Xray 内核。可以自动下载，也可以导入本机已有的内核文件。')}
          action={core?.installed
            ? undefined
            : (
              <Space direction="vertical">
                <Button size="small" type="primary" loading={coreBusy} onClick={() => void installCore(false)}>
                  {t('自动下载')}
                </Button>
                <Button size="small" loading={coreBusy} onClick={() => void installCore(true)}>
                  {t('导入本地内核')}
                </Button>
              </Space>
            )}
        />

        <Form form={form} layout="vertical" initialValues={{ source: 'url' }}>
          <Space align="start" style={{ width: '100%' }}>
            <Form.Item name="name" label={t('订阅名称')} rules={[{ required: true, message: t('请输入订阅名称') }]}>
              <Input maxLength={60} placeholder={t('例如：主力机场')} style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="source" label={t('添加方式')}>
              <Select
                style={{ width: 160 }}
                options={[
                  { value: 'url', label: t('订阅地址') },
                  { value: 'manual', label: t('手动粘贴') }
                ]}
              />
            </Form.Item>
            <Form.Item
              name="content"
              label={source === 'url' ? t('订阅地址') : t('节点链接或订阅内容')}
              rules={[{ required: true, message: source === 'url' ? t('请输入订阅地址') : t('请粘贴节点链接或订阅内容') }]}
              style={{ flex: 1, minWidth: 320 }}
            >
              <Input.TextArea
                rows={source === 'url' ? 1 : 3}
                placeholder={source === 'url'
                  ? 'https://sub.example.com/api/v1/client/subscribe?token=…'
                  : t('每行一个 vmess:// vless:// trojan:// ss:// 链接，也可以直接粘贴整段订阅内容')}
              />
            </Form.Item>
            <Form.Item label=" ">
              <Button type="primary" loading={busy} onClick={() => void addSubscription()}>{t('添加')}</Button>
            </Form.Item>
          </Space>
        </Form>

        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={subscriptions}
          locale={{ emptyText: t('尚未添加订阅') }}
          title={() => testingAllSubscriptionId && testProgress.total > 0
            ? (
              <Typography.Text type="secondary">
                {t('正在测速：{0}/{1}', testProgress.done, testProgress.total)}
              </Typography.Text>
            )
            : null}
          columns={[
            { title: t('名称'), dataIndex: 'name' },
            {
              title: t('来源'),
              dataIndex: 'displayUrl',
              ellipsis: true,
              render: (value: string, record: V2raySubscription) =>
                record.source === 'url' ? value : t('手动粘贴')
            },
            { title: t('节点数'), dataIndex: 'nodeCount', width: 90 },
            {
              title: t('状态'),
              width: 200,
              render: (_value, record: V2raySubscription) => record.lastError
                ? <Typography.Text type="warning" ellipsis={{ tooltip: mt(record.lastError) }}>{mt(record.lastError)}</Typography.Text>
                : <Tag color="success">{t('正常')}</Tag>
            },
            {
              title: t('操作'),
              width: 250,
              render: (_value, record: V2raySubscription) => (
                <Space>
                  <Button
                    size="small"
                    icon={<ThunderboltOutlined />}
                    disabled={busy || !record.nodeCount}
                    loading={testingAllSubscriptionId === record.id}
                    onClick={() => void testAllNodes(record.id)}
                  >
                    {t('测速全部')}
                  </Button>
                  {testingAllSubscriptionId === record.id && (
                    <Button size="small" danger onClick={() => { cancelledRef.current = true }}>
                      {t('停止测速')}
                    </Button>
                  )}
                  {record.source === 'url' && (
                    <Button
                      size="small"
                      icon={<ReloadOutlined />}
                      disabled={busy}
                      onClick={() => void run(() => window.browserApi.v2ray.refreshSubscription(record.id), t('订阅已更新'))}
                    >
                      {t('更新')}
                    </Button>
                  )}
                  <Popconfirm
                    title={t('删除该订阅及其全部节点？')}
                    onConfirm={() => void run(() => window.browserApi.v2ray.removeSubscription(record.id), t('订阅已删除'))}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />} disabled={busy} />
                  </Popconfirm>
                </Space>
              )
            }
          ]}
        />

        <Table
          size="small"
          rowKey="id"
          dataSource={displayNodes}
          pagination={{ pageSize: 8, hideOnSinglePage: true }}
          locale={{ emptyText: t('还没有可用节点') }}
          columns={[
            { title: t('节点'), dataIndex: 'name', ellipsis: true },
            {
              title: t('协议'),
              dataIndex: 'protocol',
              width: 110,
              render: (value: string) => <Tag>{value.toUpperCase()}</Tag>
            },
            {
              title: t('地址'),
              width: 240,
              ellipsis: true,
              render: (_value, record: V2rayNodeView) => `${record.address}:${record.port}`
            },
            {
              title: t('传输'),
              width: 120,
              render: (_value, record: V2rayNodeView) =>
                `${record.transport}${record.security === 'none' ? '' : ` · ${record.security}`}`
            },
            {
              title: t('延迟'),
              width: 170,
              render: (_value, record: V2rayNodeView) => {
                if (probes[record.id] === 'running') {
                  return <Typography.Text type="secondary">{t('测速中')}</Typography.Text>
                }
                const result = resultFor(record)
                if (!result) return <Typography.Text type="secondary">—</Typography.Text>
                if (!result.ok) {
                  return (
                    <Tooltip title={result.error ? t('测速失败：{0}', result.error) : t('测速失败')}>
                      <Typography.Text type="danger">{t('测速失败')}</Typography.Text>
                    </Tooltip>
                  )
                }
                return (
                  <Typography.Text type="success">
                    {result.latencyMs} ms{result.country ? ` · ${result.country}` : ''}
                  </Typography.Text>
                )
              }
            },
            {
              title: t('操作'),
              width: 90,
              render: (_value, record: V2rayNodeView) => (
                <Button
                  size="small"
                  loading={probes[record.id] === 'running'}
                  disabled={testingAllSubscriptionId === record.subscriptionId}
                  onClick={() => void testNode(record.id)}
                >
                  {t('测速')}
                </Button>
              )
            }
          ]}
        />

        <Typography.Text type="secondary">
          {t('测速通过节点访问 GeoIP 检测服务，测得的是到该服务的往返延迟；结果按延迟从低到高排列，失败的排在最后。')}
        </Typography.Text>
        <Typography.Text type="secondary">
          {t('节点凭据只保存在本机，不会显示或上传。订阅地址中的令牌会加密存储。')}
        </Typography.Text>
      </Space>
    </Modal>
  )
}
