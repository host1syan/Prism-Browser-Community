import { t, translateMessage as mt } from '../../shared/i18n'
import { CopyOutlined, LockOutlined, RobotOutlined, SafetyCertificateOutlined, StopOutlined } from '@ant-design/icons'
import { Alert, Button, Input, Modal, Popconfirm, Space, Switch, Tag, Typography } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import type { BrowserProfileView, McpConnection, McpProfilePermission, McpStatus } from '../../shared/types'

interface McpModalProps {
  open: boolean
  status: McpStatus | null
  permissions: McpProfilePermission[]
  profiles: BrowserProfileView[]
  onStatusChanged: (status: McpStatus) => void
  onPermissionsChanged: (permissions: McpProfilePermission[]) => void
  onClose: () => void
}

function connectionJson(connection: McpConnection): string {
  return JSON.stringify({
    mcpServers: {
      prism: { command: connection.command, args: connection.args, env: connection.env }
    }
  }, null, 2)
}

export function McpModal({ open, status, permissions, profiles, onStatusChanged, onPermissionsChanged, onClose }: McpModalProps) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [configuration, setConfiguration] = useState('')
  const [copied, setCopied] = useState(false)
  const enabled = useMemo(() => new Set(permissions.filter((item) => item.enabled).map((item) => item.profileId)), [permissions])

  useEffect(() => {
    if (!open) { setConfiguration(''); setError(''); setCopied(false); setBusy('') }
  }, [open])

  function humanError(cause: unknown): string {
    return (cause instanceof Error ? cause.message : String(cause))
  }

  async function setPermission(profileId: string, allow: boolean): Promise<void> {
    setBusy(profileId); setError('')
    try { onPermissionsChanged(await window.browserApi.mcp.setPermission(profileId, allow)) }
    catch (cause) { setError(humanError(cause)) }
    finally { setBusy('') }
  }

  async function start(): Promise<void> {
    setBusy('start'); setError(''); setCopied(false)
    try {
      const connection = await window.browserApi.mcp.start()
      onStatusChanged(connection)
      setConfiguration(connectionJson(connection))
    } catch (cause) { setError(humanError(cause)) }
    finally { setBusy('') }
  }

  async function stop(emergency: boolean): Promise<void> {
    setBusy(emergency ? 'emergency' : 'stop'); setError('')
    try {
      const next = emergency ? await window.browserApi.mcp.emergencyStop() : await window.browserApi.mcp.stop()
      onStatusChanged(next); setConfiguration(''); setCopied(false)
    } catch (cause) { setError(humanError(cause)) }
    finally { setBusy('') }
  }

  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(configuration)
    setCopied(true)
  }

  const stateLabel = status?.state === 'running' ? t("AI 已连接") : status?.state === 'ready' ? t("等待连接") : status?.state === 'error' ? t("异常") : t("已停止")
  const active = status?.state === 'running' || status?.state === 'ready'

  return (
    <Modal open={open} width={820} title={<Space><RobotOutlined />{t("本地 AI · MCP")}</Space>} footer={null} onCancel={onClose} className="mcp-modal">
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <Alert
          type={active ? 'success' : 'info'} showIcon icon={<SafetyCertificateOutlined />}
          title={mt(status?.message ?? t("MCP 尚未启动"))}
          description={t("AI 只能操作下方授权的环境，可以访问网页、读取内容、点击并填写表单，包括你提供的密码。")}
        />
        <div className="mcp-status-row">
          <Space><Typography.Text type="secondary">{t("状态")}</Typography.Text><Tag color={status?.state === 'running' ? 'green' : status?.state === 'ready' ? 'blue' : 'default'}>{stateLabel}</Tag></Space>
          <Space>
            {!active ? <Button type="primary" icon={<RobotOutlined />} loading={busy === 'start'} disabled={!enabled.size} onClick={() => void start()}>{t("生成 MCP 配置")}</Button>
              : <Button loading={busy === 'stop'} onClick={() => void stop(false)}>{t("停止 MCP")}</Button>}
            <Popconfirm title={t("紧急停止 AI 控制？")} description={t("将断开 MCP，并关闭本次由 MCP 启动的环境。共享的本地自动化 API 也会停止。")} okText={t("紧急停止")} cancelText={t("取消")} okButtonProps={{ danger: true }} onConfirm={() => stop(true)}>
              <Button danger icon={<StopOutlined />} disabled={!active || Boolean(busy)}>{t("紧急停止")}</Button>
            </Popconfirm>
          </Space>
        </div>
        {error && <Alert type="error" showIcon title={mt(error)} closable onClose={() => setError('')} />}

        <section className="mcp-permissions">
          <div className="mcp-section-heading"><div><strong>{t("允许 AI 控制的环境")}</strong><span>{t("默认全部关闭，逐个授权")}</span></div><Tag>{t("已授权 {0} 个环境", enabled.size)}</Tag></div>
          <div className="mcp-profile-list">
            {profiles.map((profile) => {
              const allowed = enabled.has(profile.id)
              return (
                <div className="mcp-profile" key={profile.id}>
                  <span className="profile-color" style={{ background: profile.color }} />
                  <div><strong>#{profile.serialNumber} · {profile.name}</strong><small>{profile.group || t("未分组")} · {profile.status === 'running' ? t("运行中") : t("已关闭")}</small></div>
                  <Switch checked={allowed} loading={busy === profile.id} disabled={busy === profile.id} onChange={(value) => void setPermission(profile.id, value)} />
                </div>
              )
            })}
          </div>
        </section>

        {configuration && (
          <section className="mcp-configuration">
            <div className="mcp-section-heading"><div><strong><LockOutlined /> {t("一次性客户端配置")}</strong><span>{t("粘贴到本地 AI 客户端的 MCP 配置中")}</span></div><Button icon={<CopyOutlined />} onClick={() => void copy()}>{copied ? t("已复制") : t("复制配置")}</Button></div>
            <Input.TextArea value={configuration} readOnly autoSize={{ minRows: 7, maxRows: 12 }} spellCheck={false} />
            <Alert type="warning" showIcon title={t("请勿分享连接配置")} description={t("关闭 MCP 或退出 Yk 指纹浏览器 后，此配置会失效；使用期间请保持 Yk 指纹浏览器 运行。")} />
          </section>
        )}
      </Space>
    </Modal>
  )
}
