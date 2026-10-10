import { t, translateMessage as mt } from '../../shared/i18n'
import { ApiOutlined, CopyOutlined, LockOutlined, SafetyCertificateOutlined, StopOutlined } from '@ant-design/icons'
import { Alert, Button, Input, Modal, Popconfirm, Space, Tag, Typography } from 'antd'
import { useEffect, useState } from 'react'
import type { AutomationStartResult, AutomationStatus } from '../../shared/types'

interface AutomationModalProps {
  open: boolean
  status: AutomationStatus | null
  onChanged: (status: AutomationStatus) => void
  onClose: () => void
}

export function AutomationModal({ open, status, onChanged, onClose }: AutomationModalProps) {
  const [busy, setBusy] = useState(false)
  const [token, setToken] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) { setToken(''); setError('') }
  }, [open])

  async function run(operation: () => Promise<AutomationStatus | AutomationStartResult>, keepToken = false): Promise<void> {
    setBusy(true)
    setError('')
    try {
      const result = await operation()
      onChanged(result)
      setToken(keepToken && 'accessToken' in result ? result.accessToken : '')
    } catch (cause) {
      setError((cause instanceof Error ? cause.message : String(cause)))
    } finally { setBusy(false) }
  }

  const running = status?.state === 'running'
  const stateLabel = status?.state === 'running' ? t("运行中")
    : status?.state === 'starting' ? t("启动中")
      : status?.state === 'error' ? t("异常")
        : status?.state === 'unavailable' ? t("不可用") : t("已停止")

  return (
    <Modal open={open} width={650} title={<Space><ApiOutlined />{t("本地自动化 API")}</Space>} footer={null} onCancel={onClose} className="automation-modal">
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          type={running ? 'success' : 'info'}
          showIcon
          icon={<SafetyCertificateOutlined />}
          title={running ? t("API 已启动，仅当前设备可访问") : t("默认关闭，按需启动")}
          description={t("API 可以查询、启动和关闭浏览器环境，不能读取浏览器数据。")}
        />

        <div className="automation-status-row">
          <div>
            <Typography.Text type="secondary">{t("状态")}</Typography.Text>
            <div><Tag color={running ? 'green' : status?.state === 'error' ? 'red' : 'default'}>{status ? stateLabel : t("正在检查")}</Tag>{mt(status?.message)}</div>
          </div>
        </div>

        {running && status?.endpoint && (
          <div className="automation-credential-box">
            <Typography.Text strong>{t("API 地址")}</Typography.Text>
            <Input value={status.endpoint} readOnly />
            <Typography.Text strong><LockOutlined /> {t("本次访问令牌")}</Typography.Text>
            {token ? (
              <Input.Password
                value={token}
                readOnly
                addonAfter={<Button type="text" size="small" icon={<CopyOutlined />} onClick={() => void navigator.clipboard.writeText(token)}>{t("复制")}</Button>}
              />
            ) : (
              <Typography.Text type="secondary">{t("令牌只在启动成功时显示一次。需要新令牌时请停止并重新启动 API。")}</Typography.Text>
            )}
          </div>
        )}

        {status?.controlledProfileIds.length ? (
          <Typography.Text type="secondary">{t("当前由 API 启动的环境：{0} 个", status.controlledProfileIds.length)}</Typography.Text>
        ) : null}
        {error && <Alert type="error" showIcon title={mt(error)} />}

        <div className="automation-actions">
          {!running ? (
            <Button type="primary" icon={<ApiOutlined />} loading={busy} disabled={status?.state === 'starting'} onClick={() => void run(() => window.browserApi.automation.start(), true)}>{t("启动本地 API")}</Button>
          ) : (
            <Button loading={busy} onClick={() => void run(() => window.browserApi.automation.stop())}>{t("停止 API")}</Button>
          )}
          <Popconfirm
            title={t("紧急停止自动化？")}
            description={t("这会停止 API，并关闭本次由 API 启动的浏览器环境。")}
            okText={t("紧急停止")}
            cancelText={t("取消")}
            okButtonProps={{ danger: true }}
            onConfirm={() => run(() => window.browserApi.automation.emergencyStop())}
          >
            <Button danger icon={<StopOutlined />} disabled={!running || busy}>{t("紧急停止")}</Button>
          </Popconfirm>
        </div>
      </Space>
    </Modal>
  )
}
