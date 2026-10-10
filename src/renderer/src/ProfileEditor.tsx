import { t, translateMessage as mt } from '../../shared/i18n'
import { ReloadOutlined } from '@ant-design/icons'
import {
  Alert,
  AutoComplete,
  Button,
  Checkbox,
  Col,
  ColorPicker,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Tag,
  Tabs,
  Typography
} from 'antd'
import { useEffect, useState } from 'react'
import { defaultPlatform, defaultProfileDraft, randomSeed } from '../../shared/defaults'
import { fingerprintVersionWarning } from '../../shared/fingerprint-consistency'
import {
  applyHardwareProfile,
  effectiveGpuIdentity,
  HARDWARE_PROFILES,
  hardwareProfile,
  hardwareProfileSummary,
  refreshSeededGpuIdentity
} from '../../shared/hardware-profiles'
import { effectiveNetworkIdentity } from '../../shared/network-identity'
import type { BrowserExtension, BrowserProfileView, EngineStatus, HardwareProfileId, KernelRelease, ProfileDraft, ProxyTestResult, V2rayNodeTestResult, V2rayNodeView } from '../../shared/types'
import { nodeLabel } from './v2ray-node'

interface EditorValues extends Omit<ProfileDraft, 'startUrls' | 'color'> {
  startUrlsText: string
  color: string | { toHexString: () => string }
}

/**
 * The freshest measurement for a node: the result of the in-editor probe wins,
 * otherwise the one persisted from the subscription manager. The in-editor
 * result is only attributed to the node it was actually measured against.
 */
function v2rayTestResult(
  node: V2rayNodeView | undefined,
  live: V2rayNodeTestResult | null,
  liveNodeId: string | undefined
): V2rayNodeTestResult | undefined {
  if (!node) return undefined
  if (live && node.id === liveNodeId) return live
  return node.test
}

interface ProfileEditorProps {
  open: boolean
  profile?: BrowserProfileView
  suggestedIndex: number
  saving: boolean
  extensions: BrowserExtension[]
  engine: EngineStatus | null
  kernels: KernelRelease[]
  groups: string[]
  onCancel: () => void
  onSave: (draft: ProfileDraft) => Promise<void>
  /** Opens the subscription manager; the editor stays open behind it. */
  onManageV2ray: () => void
}

function editorValues(profile: BrowserProfileView | undefined, index: number): EditorValues {
  const draft = profile ?? defaultProfileDraft(index)
  const fingerprint = { ...draft.fingerprint }
  return {
    name: draft.name,
    note: draft.note,
    group: draft.group,
    tags: [...draft.tags],
    extensionIds: [...draft.extensionIds],
    color: draft.color,
    startUrlsText: draft.startUrls.join('\n'),
    kernelVersion: draft.kernelVersion,
    window: { ...draft.window },
    proxy: { ...draft.proxy },
    fingerprint: {
      ...fingerprint,
      disabledSpoofing: [...draft.fingerprint.disabledSpoofing]
    }
  }
}


export function ProfileEditor({ open, profile, suggestedIndex, saving, extensions, engine, kernels, groups, onCancel, onSave, onManageV2ray }: ProfileEditorProps) {
  const riskLabels: Record<NonNullable<ProxyTestResult['networkRisk']>, string> = {
    tor: t("Tor 出口"),
    vpn: t("VPN 网络"),
    proxy: t("代理网络"),
    hosting: t("机房网络")
  }

  const [form] = Form.useForm<EditorValues>()
  const proxyProtocol = Form.useWatch(['proxy', 'protocol'], form)
  const proxyPassword = Form.useWatch(['proxy', 'password'], form) ?? ''
  const proxyPasswordStored = Form.useWatch(['proxy', 'passwordStored'], form) === true
  const selectedV2rayNodeId = Form.useWatch(['proxy', 'v2rayNodeId'], form) as string | undefined
  const webrtcPolicy = Form.useWatch(['fingerprint', 'webrtcPolicy'], form) ?? 'proxy_only'
  const fingerprintTimezone = Form.useWatch(['fingerprint', 'timezone'], form)
  const fingerprintLanguage = Form.useWatch(['fingerprint', 'language'], form) ?? 'zh-CN'
  const fingerprintAcceptLanguages = Form.useWatch(['fingerprint', 'acceptLanguages'], form) ?? 'zh-CN,zh,en-US,en'
  const networkIdentityMode = Form.useWatch(['fingerprint', 'networkIdentityMode'], form) ?? 'manual'
  const brandVersion = Form.useWatch(['fingerprint', 'brandVersion'], form) ?? ''
  const hardwareProfileId = Form.useWatch(['fingerprint', 'hardwareProfileId'], form) ?? 'legacy-custom'
  const fingerprintSeed = Form.useWatch(['fingerprint', 'seed'], form) ?? 0
  const fingerprintGpuBucket = Form.useWatch(['fingerprint', 'gpuBucket'], form)
  const kernelVersion = Form.useWatch('kernelVersion', form) ?? ''
  const windowMode = Form.useWatch(['window', 'mode'], form) ?? 'auto'
  const [testingProxy, setTestingProxy] = useState(false)
  const [proxyResult, setProxyResult] = useState<ProxyTestResult | null>(null)
  const [v2rayNodes, setV2rayNodes] = useState<V2rayNodeView[]>([])
  const [loadingV2rayNodes, setLoadingV2rayNodes] = useState(false)
  const [v2rayTest, setV2rayTest] = useState<V2rayNodeTestResult | null>(null)
  const selectedV2rayNode = v2rayNodes.find((node) => node.id === selectedV2rayNodeId)
  const pinnedKernel = kernels.find((kernel) => kernel.version === kernelVersion)
  const selectedEngine: EngineStatus | null = kernelVersion
    ? {
        executable: pinnedKernel?.executable ?? null,
        source: pinnedKernel ? 'profile' : 'missing',
        fingerprintKernel: true,
        label: pinnedKernel ? t("Fingerprint Chromium（环境固定）") : t("固定内核未安装"),
        version: kernelVersion
      }
    : engine
  const versionWarning = fingerprintVersionWarning(brandVersion, selectedEngine)
  const selectedHardware = hardwareProfile(hardwareProfileId)
  const selectedGpuIdentity = effectiveGpuIdentity({
    hardwareProfileId,
    seed: fingerprintSeed,
    gpuBucket: fingerprintGpuBucket
  })
  const hostPlatform = defaultPlatform()
  const timezoneMismatch = Boolean(proxyResult?.timezone && fingerprintTimezone && proxyResult.timezone !== fingerprintTimezone)
  const networkIdentity = effectiveNetworkIdentity({
    ...form.getFieldValue('fingerprint'),
    language: fingerprintLanguage,
    acceptLanguages: fingerprintAcceptLanguages,
    timezone: fingerprintTimezone,
    networkIdentityMode
  }, proxyResult?.ok ? proxyResult : profile?.proxyCheck)

  useEffect(() => {
    if (open) {
      form.setFieldsValue(editorValues(profile, suggestedIndex))
      setProxyResult(null)
      setV2rayTest(null)
    }
  }, [form, open, profile, suggestedIndex])

  async function reloadV2rayNodes(): Promise<void> {
    setLoadingV2rayNodes(true)
    try {
      setV2rayNodes(await window.browserApi.v2ray.nodes())
    } catch {
      setV2rayNodes([])
    } finally {
      setLoadingV2rayNodes(false)
    }
  }

  useEffect(() => {
    if (open && proxyProtocol === 'v2ray') void reloadV2rayNodes()
  }, [open, proxyProtocol])

  async function testCurrentProxy(): Promise<void> {
    try {
      if (proxyProtocol === 'v2ray') {
        if (!selectedV2rayNodeId) return
        setTestingProxy(true)
        setV2rayTest(null)
        setV2rayTest(await window.browserApi.v2ray.testNode(selectedV2rayNodeId))
        return
      }
      if (proxyProtocol !== 'direct') await form.validateFields([['proxy', 'host'], ['proxy', 'port']])
      setTestingProxy(true)
      setProxyResult(null)
      setProxyResult(await window.browserApi.proxy.test(form.getFieldValue('proxy'), profile?.id))
    } catch (error) {
      if (!(error && typeof error === 'object' && 'errorFields' in error)) {
        const result = {
          ok: false,
          latencyMs: 0,
          testedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error)
        }
        if (proxyProtocol === 'v2ray') setV2rayTest(result)
        else setProxyResult(result)
      }
    } finally {
      setTestingProxy(false)
    }
  }

  async function submit(): Promise<void> {
    await form.validateFields()
    const values = form.getFieldsValue(true) as EditorValues
    const color = typeof values.color === 'string' ? values.color : values.color.toHexString()
    await onSave({
      name: values.name,
      note: values.note,
      group: values.group,
      tags: values.tags,
      color,
      startUrls: values.startUrlsText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
      kernelVersion: values.kernelVersion,
      window: values.window,
      proxy: values.proxy,
      extensionIds: values.extensionIds,
      fingerprint: values.fingerprint
    })
  }

  const general = (
    <div className="editor-section">
      <Form.Item name="name" label={t("环境名称")} rules={[{ required: true, message: t("请输入环境名称") }]}>
        <Input placeholder={t("例如：美国店铺 01")} maxLength={60} />
      </Form.Item>
      <Form.Item name="color" label={t("标记颜色")}>
        <ColorPicker showText />
      </Form.Item>
      <Form.Item
        name="kernelVersion"
        label={t("浏览器内核")}
        extra={t("长期使用的账号建议固定版本；自动模式会跟随应用当前选择的内核。")}
      >
        <Select
          options={[
            { value: '', label: t("自动跟随当前内核{0}", engine?.version ? ` · ${engine.version}` : '') },
            ...kernels.map((kernel) => ({
              value: kernel.version,
              label: `${kernel.version}${kernel.origin === 'local-build' ? ' · ' + t('本地构建') : ''}`
            })),
            ...(kernelVersion && !pinnedKernel ? [{ value: kernelVersion, label: t("{0} · 当前未安装", kernelVersion) }] : [])
          ]}
        />
      </Form.Item>
      {kernelVersion && !pinnedKernel && (
        <Alert type="error" showIcon message={t("固定内核 {0} 当前不可用", kernelVersion)} description={t("安装该版本后才能启动此环境，或者改回自动跟随。")} />
      )}
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item name="group" label={t("环境分组")}>
            <AutoComplete
              allowClear
              options={groups.map((value) => ({ value }))}
              placeholder={t("选择已有分组或输入新分组")}
              maxLength={40}
              filterOption={(input, option) => String(option?.value ?? '').toLocaleLowerCase().includes(input.toLocaleLowerCase())}
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="tags" label={t("标签")}>
            <Select mode="tags" maxCount={20} tokenSeparators={[',']} placeholder={t("输入后回车")} />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item name="startUrlsText" label={t("启动页面")} extra={t("每行一个网址；不填写协议时自动使用 HTTPS")}>
        <Input.TextArea rows={4} placeholder={'https://example.com\nhttps://browserleaks.com/'} />
      </Form.Item>
      <Form.Item name="extensionIds" label={t("启动扩展")} extra={t("从扩展管理中导入后，可为每个环境选择不同的扩展组合")}>
        <Select
          mode="multiple"
          allowClear
          placeholder={extensions.length ? t("选择该环境启动时加载的扩展") : t("尚未导入扩展")}
          options={extensions.map((extension) => ({
            value: extension.id,
            label: `${extension.name} · ${extension.version}`
          }))}
        />
      </Form.Item>
      <Divider />
      <Form.Item name={['window', 'mode']} label={t("浏览器窗口")} extra={t("自动模式沿用指纹屏幕尺寸；自定义模式可固定窗口尺寸和桌面坐标。")}>
        <Select options={[{ value: 'auto', label: t("自动尺寸与位置") }, { value: 'custom', label: t("固定尺寸与位置") }]} />
      </Form.Item>
      {windowMode === 'custom' && (
        <>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label={t("窗口尺寸")}>
                <Space.Compact block>
                  <Form.Item name={['window', 'width']} noStyle><InputNumber min={480} max={7680} precision={0} className="resolution-input" /></Form.Item>
                  <Input className="resolution-times" value="×" disabled />
                  <Form.Item name={['window', 'height']} noStyle><InputNumber min={360} max={4320} precision={0} className="resolution-input" /></Form.Item>
                </Space.Compact>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={t("桌面坐标")}>
                <Space.Compact block>
                  <Form.Item name={['window', 'x']} noStyle><InputNumber min={-20000} max={20000} precision={0} prefix="X" className="resolution-input" /></Form.Item>
                  <Input className="resolution-times" value="," disabled />
                  <Form.Item name={['window', 'y']} noStyle><InputNumber min={-20000} max={20000} precision={0} prefix="Y" className="resolution-input" /></Form.Item>
                </Space.Compact>
              </Form.Item>
            </Col>
          </Row>
          <Alert type="info" showIcon message={t("多显示器允许负坐标；显示器布局变化后，过期坐标可能让窗口出现在屏幕之外。")} />
        </>
      )}
      <Form.Item name="note" label={t("备注")}>
        <Input.TextArea rows={3} maxLength={500} showCount placeholder={t("仅保存在本机")} />
      </Form.Item>
    </div>
  )

  const proxy = (
    <div className="editor-section">
      <Form.Item name={['proxy', 'protocol']} label={t("代理方式")}>
        <Select
          options={[
            { value: 'direct', label: t("不使用代理（本地网络）") },
            { value: 'http', label: 'HTTP' },
            { value: 'https', label: 'HTTPS' },
            { value: 'socks5', label: 'SOCKS5' },
            { value: 'v2ray', label: t("V2Ray 订阅节点") }
          ]}
        />
      </Form.Item>
      {proxyProtocol === 'v2ray' && (
        <>
          <Form.Item
            name={['proxy', 'v2rayNodeId']}
            label={t("节点")}
            rules={[{ required: true, message: t("请选择 v2ray 节点") }]}
            extra={t("节点在「V2Ray 订阅」中管理。每个环境独立连接，出口 IP 互不影响。")}
          >
            <Select
              showSearch
              optionFilterProp="label"
              loading={loadingV2rayNodes}
              placeholder={v2rayNodes.length ? t("选择节点") : t("尚未添加订阅")}
              options={v2rayNodes.map((node) => ({
                value: node.id,
                label: nodeLabel(node)
              }))}
              optionRender={(option) => {
                const node = v2rayNodes.find((item) => item.id === option.value)
                const result = v2rayTestResult(node, v2rayTest, selectedV2rayNodeId)
                return (
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <span>{option.label}</span>
                    {result && (
                      <Typography.Text type="success">
                        {result.ok
                          ? `${result.latencyMs} ms${result.country ? ` · ${result.country}` : ''}`
                          : t("测速失败")}
                      </Typography.Text>
                    )}
                  </Space>
                )
              }}
              notFoundContent={<Button type="link" onClick={onManageV2ray}>{t("添加订阅")}</Button>}
            />
          </Form.Item>
          <Space>
            <Button onClick={onManageV2ray}>{t("管理订阅")}</Button>
            <Button onClick={() => void reloadV2rayNodes()}>{t("刷新节点列表")}</Button>
          </Space>
          {selectedV2rayNode && (() => {
            const result = v2rayTestResult(selectedV2rayNode, v2rayTest, selectedV2rayNodeId)
            if (!result) return null
            return (
              <Typography.Text type={result.ok ? 'success' : 'danger'}>
                {result.ok
                  ? t("测速：{0} ms", result.latencyMs) + (result.country ? ` · ${result.country}` : '')
                  : t("测速失败：{0}", result.error)}
              </Typography.Text>
            )
          })()}
          {selectedV2rayNode?.parseWarning && (
            <Alert type="warning" showIcon message={mt(selectedV2rayNode.parseWarning)} />
          )}
        </>
      )}
      {proxyProtocol !== 'direct' && proxyProtocol !== 'v2ray' && (
        <>
          <Row gutter={12}>
            <Col span={16}>
              <Form.Item name={['proxy', 'host']} label={t("主机")} rules={[{ required: true, message: t("请输入代理主机") }]}>
                <Input placeholder="proxy.example.com" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name={['proxy', 'port']} label={t("端口")} rules={[{ required: true, message: t("请输入端口") }]}>
                <InputNumber min={1} max={65535} className="full-width" placeholder="8080" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name={['proxy', 'username']} label={t("用户名")}>
                <Input autoComplete="off" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label={t("密码")}
                extra={proxyPasswordStored
                  ? t("已保存；代理地址和用户名未修改时，留空可保持原密码。")
                  : t("密码将安全保存在当前设备。")}
              >
                <Space.Compact block>
                  <Form.Item name={['proxy', 'password']} noStyle>
                    <Input.Password
                      autoComplete="new-password"
                      placeholder={proxyPasswordStored ? t("已保存，留空保持不变") : undefined}
                    />
                  </Form.Item>
                  {proxyPasswordStored && !proxyPassword && (
                    <Button onClick={() => form.setFieldValue(['proxy', 'passwordStored'], false)}>{t("清除已保存")}</Button>
                  )}
                </Space.Compact>
              </Form.Item>
            </Col>
          </Row>
        </>
      )}
      {proxyProtocol !== 'v2ray' && (
        <Space className="proxy-test-row">
          <Button loading={testingProxy} onClick={() => void testCurrentProxy()}>{t("检测连接")}</Button>
          {proxyResult && !proxyResult.ok && <Typography.Text type="danger">{t("连接失败：{0}", proxyResult.error)}</Typography.Text>}
        </Space>
      )}
      {proxyProtocol === 'v2ray' && (
        <Space className="proxy-test-row">
          <Button
            loading={testingProxy}
            disabled={!selectedV2rayNodeId}
            onClick={() => void testCurrentProxy()}
          >
            {t("检测节点")}
          </Button>
          {v2rayTest && !v2rayTest.ok && <Typography.Text type="danger">{t("连接失败：{0}", v2rayTest.error)}</Typography.Text>}
          {v2rayTest?.ok && (
            <Typography.Text type="success">
              {t("出口 IP：{0}", v2rayTest.ip)} · {v2rayTest.latencyMs} ms
              {v2rayTest.country ? ` · ${v2rayTest.country}` : ''}
            </Typography.Text>
          )}
        </Space>
      )}
      {proxyResult?.ok && (
        <div className="proxy-test-result">
          <div className="proxy-result-line">
            <Typography.Text strong>{t("出口 IP：{0}", proxyResult.ip)}</Typography.Text>
            <Typography.Text type="secondary">{proxyResult.latencyMs} ms</Typography.Text>
            {proxyResult.networkRisk && <Tag color="warning">{riskLabels[proxyResult.networkRisk]}</Tag>}
          </div>
          {(proxyResult.country || proxyResult.city) && (
            <Typography.Text type="secondary">
              {[proxyResult.country, proxyResult.region, proxyResult.city].filter(Boolean).join(' · ')}
            </Typography.Text>
          )}
          {(proxyResult.asn || proxyResult.organization || proxyResult.isp) && (
            <Typography.Text type="secondary">
              {[proxyResult.asn ? `AS${proxyResult.asn}` : '', proxyResult.organization, proxyResult.isp]
                .filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join(' · ')}
            </Typography.Text>
          )}
          {proxyResult.timezone && (
            <div className="proxy-timezone-row">
              <Typography.Text type={proxyResult.geoConfidence === 'conflict' || timezoneMismatch ? 'warning' : 'success'}>
                {t("代理时区：{0}", proxyResult.timezone)} · {proxyResult.geoConfidence === 'conflict'
                  ? t("GeoIP 数据源存在冲突")
                  : timezoneMismatch ? t("与指纹时区 {0} 不一致", fingerprintTimezone) : t("与指纹时区一致")}
              </Typography.Text>
              {timezoneMismatch && proxyResult.geoConfidence !== 'conflict' && (
                <Button size="small" onClick={() => form.setFieldValue(['fingerprint', 'timezone'], proxyResult.timezone)}>{t("应用代理时区")}</Button>
              )}
            </div>
          )}
          {proxyResult.latitude !== undefined && proxyResult.longitude !== undefined && (
            <Typography.Text type="secondary">
              {t("城市级坐标：{0}, {1}", proxyResult.latitude.toFixed(3), proxyResult.longitude.toFixed(3))} · {t("精度约 {0} km", Math.round((proxyResult.accuracyMeters ?? 25000) / 1000))}
            </Typography.Text>
          )}
          {networkIdentityMode === 'proxy' && (
            <Alert
              type={proxyResult.geoConfidence === 'conflict' ? 'warning' : 'success'}
              showIcon
              message={proxyResult.geoConfidence === 'conflict' ? t("代理地理信息存在冲突") : t("代理网络身份已生成")}
              description={proxyResult.geoConfidence === 'conflict'
                ? t("{0}。继续使用可能影响指纹一致性；启动时会再次检测，并由用户确认是否继续。", mt(proxyResult.geoConflict))
                : `${networkIdentity.language} · ${networkIdentity.acceptLanguages} · ${networkIdentity.timezone}`}
            />
          )}
          {proxyResult.degraded && <Typography.Text type="warning">{mt(proxyResult.warning)}</Typography.Text>}
        </div>
      )}
      <Divider />
      <Form.Item
        name={['fingerprint', 'webrtcPolicy']}
        label={t("WebRTC IP 策略")}
        extra={t("视频通话兼容性与网络隐私之间的取舍；普通多环境使用建议保持默认。")}
      >
        <Select
          options={[
            { value: 'proxy_only', label: t("防泄漏（推荐）— 禁止非代理 UDP") },
            { value: 'public_only', label: t("仅公网接口 — 不暴露本地地址") },
            { value: 'default', label: t("系统默认 — 使用所有网络接口") }
          ]}
        />
      </Form.Item>
      {webrtcPolicy === 'proxy_only' && (
        <Alert
          type="success"
          showIcon
          message={t("WebRTC 防泄漏已开启")}
          description={proxyProtocol === 'direct'
            ? t("不会枚举本地接口；未配置 UDP 代理时 WebRTC 将使用 TCP，部分实时音视频性能可能下降。")
            : t("WebRTC 仅使用代理支持的 UDP 或 TCP，不允许通过本地网络绕过代理。")}
        />
      )}
      {webrtcPolicy === 'public_only' && (
        <Alert
          type="warning"
          showIcon
          message={t("可能暴露真实公网 IP")}
          description={t("该模式隐藏本地网卡地址，但 WebRTC 可以使用系统默认公网接口；使用代理环境时不建议选择。")}
        />
      )}
      {webrtcPolicy === 'default' && (
        <Alert
          type="error"
          showIcon
          message={t("高风险：WebRTC 使用所有接口")}
          description={t("网页可能获取本地网卡或绕过代理的公网地址，仅用于兼容性排障。")}
        />
      )}
    </div>
  )

  const fingerprint = (
    <div className="editor-section">
      <Form.Item
        name={['fingerprint', 'hardwareProfileId']}
        label={t("硬件模板")}
        extra={t("请选择完整硬件组合，避免出现不合理的设备信息。")}
      >
        <Select
          options={[
            ...HARDWARE_PROFILES.map((item) => ({
              value: item.id,
              label: mt(item.label),
              disabled: item.hostMatched && item.platform !== hostPlatform
            })),
            ...(hardwareProfileId === 'legacy-custom' ? [{ value: 'legacy-custom', label: t("旧版自定义配置（保持原指纹）") }] : [])
          ]}
          onChange={(id: HardwareProfileId) => {
            const current = form.getFieldValue('fingerprint')
            form.setFieldValue('fingerprint', applyHardwareProfile(current, id, { refreshSeededGpu: true }))
          }}
        />
      </Form.Item>
      {selectedHardware?.hostMatched && (
        <Alert
          type="success"
          showIcon
          message={t("使用当前设备的硬件信息")}
          description={t("不同环境可能显示相同的硬件信息。")}
        />
      )}
      {selectedHardware && !selectedHardware.hostMatched && (
        <Alert
          type="info"
          showIcon
          message={mt(hardwareProfileSummary(selectedHardware.id))}
          description={t("同一环境的硬件信息保持稳定；重新生成后会获得新的身份。")}
        />
      )}
      {selectedHardware?.renderIdentityMode === 'seeded-curated' && !selectedGpuIdentity && (
        <Alert
          type="warning"
          showIcon
          message={t("旧环境保持原有硬件信息")}
          description={t("如需更换，请点击下方“重新生成”。")}
        />
      )}
      {hardwareProfileId === 'legacy-custom' && (
        <Alert
          type="warning"
          showIcon
          message={t("这是升级前创建的自定义硬件组合")}
          description={t("为避免已使用环境的指纹突变，当前值不会自动修改。新账号建议新建环境并选择成套硬件模板。")}
        />
      )}
      <Divider />
      <Row gutter={12}>
        <Col span={16}>
          <Form.Item name={['fingerprint', 'seed']} label={t("指纹种子")} rules={[{ required: true }]}>
            <InputNumber min={0} max={0xffffffff} precision={0} className="full-width" />
          </Form.Item>
        </Col>
        <Col span={8} className="seed-action">
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              const current = form.getFieldValue('fingerprint')
              form.setFieldValue('fingerprint', refreshSeededGpuIdentity({
                ...current,
                seed: randomSeed()
              }))
            }}
          >{t("重新生成")}</Button>
        </Col>
      </Row>
      <div className="form-hint prominent">
        {selectedHardware?.hostMatched
          ? t("不同环境可能共享当前设备的硬件信息。")
          : t("指纹种子决定环境身份。使用中的环境请勿随意修改；复制或重新生成会获得新身份。")}
      </div>
      <Divider />
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item name={['fingerprint', 'platform']} label={t("模拟系统")}>
            <Select disabled={hardwareProfileId !== 'legacy-custom'} options={[{ value: 'windows', label: 'Windows' }, { value: 'macos', label: 'macOS' }]} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name={['fingerprint', 'platformVersion']} label={t("系统版本")}>
            <Input
              disabled={hardwareProfileId !== 'legacy-custom'}
              placeholder="10.0.0"
              addonAfter={selectedHardware?.hostMatched ? t("启动时读取本机") : undefined}
            />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item
            name={['fingerprint', 'networkIdentityMode']}
            label={t("网络身份")}
            extra={t("自动模式会在启动前检测代理并匹配语言、时区和位置。")}
          >
            <Select options={[
              { value: 'proxy', label: t("跟随代理出口（推荐）") },
              { value: 'manual', label: t("手动固定") }
            ]} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name={['fingerprint', 'proxyExitPolicy']} label={t("出口变化")}>
            <Select options={[
              { value: 'block', label: t("阻止启动并确认（推荐）") },
              { value: 'warn', label: t("仅告警，继续启动") }
            ]} />
          </Form.Item>
        </Col>
      </Row>
      {networkIdentityMode === 'proxy' && (
        <Alert
          type={proxyProtocol === 'direct' ? 'warning' : 'info'}
          showIcon
          message={proxyProtocol === 'direct' ? t("当前没有配置代理") : t("语言、时区和地理位置将在启动时跟随代理")}
          description={proxyProtocol === 'direct'
            ? t("直连环境继续使用下方手动值；配置代理后自动联动。")
            : `${networkIdentity.language} · ${networkIdentity.acceptLanguages} · ${networkIdentity.timezone}`}
        />
      )}
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item name={['fingerprint', 'brand']} label={t("浏览器品牌")}>
            <Select options={[{ value: 'Chrome', label: 'Chrome' }, { value: 'Edge', label: 'Edge' }]} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name={['fingerprint', 'brandVersion']}
            label={t("品牌版本")}
            extra={selectedEngine?.version ? t("留空时自动匹配内核 {0}", selectedEngine.version) : t("留空时与内核版本一致")}
            rules={[{ pattern: /^\d+(?:\.\d+){0,3}$/, message: t("请输入 1–4 段数字版本，或留空自动匹配"), validateTrigger: 'onBlur' }]}
          >
            <Input placeholder={t("自动")} />
          </Form.Item>
        </Col>
      </Row>
      {versionWarning && <Alert type="warning" showIcon message={mt(versionWarning)} description={t("建议留空并自动匹配当前内核。")} />}
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item name={['fingerprint', 'hardwareConcurrency']} label={t("CPU 核心数")}>
            <Select disabled={hardwareProfileId !== 'legacy-custom'} options={[2, 4, 6, 8, 10, 12, 14, 16, 20, 24].map((value) => ({ value, label: t("{0} 核", value) }))} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label={t("屏幕分辨率")}>
            <Space.Compact block>
              <Form.Item name={['fingerprint', 'screenWidth']} noStyle>
                <InputNumber disabled={hardwareProfileId !== 'legacy-custom'} min={800} max={7680} precision={0} className="resolution-input" />
              </Form.Item>
              <Input className="resolution-times" value="×" disabled />
              <Form.Item name={['fingerprint', 'screenHeight']} noStyle>
                <InputNumber disabled={hardwareProfileId !== 'legacy-custom'} min={600} max={4320} precision={0} className="resolution-input" />
              </Form.Item>
            </Space.Compact>
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item name={['fingerprint', 'language']} label={t("界面语言")}>
            <Input disabled={networkIdentityMode === 'proxy' && proxyProtocol !== 'direct'} placeholder="zh-CN" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name={['fingerprint', 'timezone']} label={t("时区")}>
            <Input disabled={networkIdentityMode === 'proxy' && proxyProtocol !== 'direct'} placeholder="Asia/Shanghai" />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item name={['fingerprint', 'acceptLanguages']} label="Accept-Language">
        <Input disabled={networkIdentityMode === 'proxy' && proxyProtocol !== 'direct'} placeholder="zh-CN,zh,en-US,en" />
      </Form.Item>
      <Form.Item name={['fingerprint', 'disabledSpoofing']} label={t("关闭部分伪装")} extra={t("仅用于排障，正常情况下保持全不选。")}>
        <Checkbox.Group
          options={[
            { value: 'font', label: t("字体") },
            { value: 'audio', label: 'Audio' },
            { value: 'canvas', label: 'Canvas' },
            { value: 'clientrects', label: 'ClientRects' },
            { value: 'gpu', label: 'GPU' }
          ]}
        />
      </Form.Item>
    </div>
  )

  return (
    <Modal
      open={open}
      title={profile ? t("编辑浏览器环境") : t("新建浏览器环境")}
      width={720}
      destroyOnHidden
      confirmLoading={saving}
      okText={profile ? t("保存修改") : t("创建环境")}
      cancelText={t("取消")}
      onCancel={onCancel}
      onOk={() => void submit()}
    >
      <Typography.Paragraph type="secondary" className="editor-intro">{t("每个环境的数据、指纹和网络设置彼此独立。")}</Typography.Paragraph>
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        onValuesChange={(changed) => { if ('proxy' in changed) setProxyResult(null) }}
      >
        <Tabs
          defaultActiveKey="general"
          items={[
            { key: 'general', label: t("基础设置"), children: general, forceRender: true },
            { key: 'proxy', label: t("代理设置"), children: proxy, forceRender: true },
            { key: 'fingerprint', label: t("指纹设置"), children: fingerprint, forceRender: true }
          ]}
        />
      </Form>
    </Modal>
  )
}
