import { t, getLocale, translateMessage as mt } from '../../shared/i18n'
import { Alert, Button, Modal, Space, Tag, Typography, message } from 'antd'
import { useEffect, useState } from 'react'
import type { AnnouncementStatus, AppUpdateStatus } from '../../shared/types'

interface UpdateModalProps {
  open: boolean
  appStatus: AppUpdateStatus | null
  announcementStatus: AnnouncementStatus | null
  onClose: () => void
  onAnnouncementChanged: (status: AnnouncementStatus) => void
}

function errorText(error: unknown): string {
  return mt(error instanceof Error ? error.message : String(error))
}

export function UpdateModal({
  open,
  appStatus,
  announcementStatus,
  onClose,
  onAnnouncementChanged
}: UpdateModalProps) {
  const [busy, setBusy] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  async function check(): Promise<void> {
    setBusy(true)
    try {
      onAnnouncementChanged(await window.browserApi.announcements.check())
    } catch (error) {
      messageApi.error(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  async function openDownload(): Promise<void> {
    setBusy(true)
    try {
      await window.browserApi.announcements.openAction()
    } catch (error) {
      messageApi.error(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (open) void check()
    // Every modal opening deliberately performs a fresh server check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const announcement = announcementStatus?.announcement
  const isAvailable = announcementStatus?.state === 'available'
  const isCurrent = announcementStatus?.state === 'current'
  const alertType = announcementStatus?.state === 'error'
    ? 'error'
    : isAvailable ? 'info' : isCurrent ? 'success' : 'warning'
  const statusDescription = announcementStatus?.state === 'none'
    ? t("暂无适用于当前系统的更新。")
    : announcementStatus?.state === 'disabled'
      ? t("暂时无法检查更新。")
      : announcement?.body

  return (
    <Modal open={open} title={t("应用更新")} footer={null} onCancel={onClose} destroyOnHidden>
      {contextHolder}
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Yk 指纹浏览器 {appStatus?.currentVersion ?? ''}
          </Typography.Title>
          <Space wrap>
            <Tag>{t("当前版本 {0}", appStatus?.currentVersion ?? t("未知"))}</Tag>
            {announcement?.latestVersion && <Tag color={isAvailable ? 'blue' : 'green'}>{t("最新版本 {0}", announcement.latestVersion)}</Tag>}
          </Space>
        </div>
        <Alert
          showIcon
          type={alertType}
          title={busy && !announcementStatus ? t("正在获取最新版本公告…") : mt(announcementStatus?.message ?? t("正在读取更新状态…"))}
          description={statusDescription}
        />
        {announcement && (
          <div>
            <Typography.Title level={5} style={{ marginBottom: 4 }}>{announcement.title}</Typography.Title>
            <Typography.Text type="secondary">{t("发布时间：{0}", new Date(announcement.publishedAt).toLocaleString(getLocale(), { hour12: false }))}</Typography.Text>
          </div>
        )}
        <Space wrap>
          <Button loading={busy} onClick={() => void check()}>{t("重新检查")}</Button>
          {isAvailable && announcement?.action && (
            <Button type="primary" loading={busy} onClick={() => void openDownload()}>
              {announcement.action.label}
            </Button>
          )}
        </Space>
      </Space>
    </Modal>
  )
}
