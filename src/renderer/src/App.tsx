import { LanguageSelector } from './LanguageSelector'
import { t, getLocale, subscribeLocale, translateMessage as mt } from '../../shared/i18n'
import {
  ApiOutlined,
  AppstoreOutlined,
  AppstoreAddOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  CopyOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FolderOutlined,
  GlobalOutlined,
  MoreOutlined,
  PlusOutlined,
  PoweroffOutlined,
  RestOutlined,
  ReloadOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  SettingOutlined,
  StarFilled,
  StarOutlined,
  TagsOutlined,
  UploadOutlined,
  WarningFilled
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Checkbox,
  Dropdown,
  Empty,
  Input,
  Layout,
  message,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
  type MenuProps,
  type TableColumnsType
} from 'antd'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { AnnouncementStatus, AppRecoveryStatus, AppUpdateStatus, AutomationStatus, BrowserCrashRecord, BrowserExtension, BrowserProfileView, EngineStatus, KernelRelease, LaunchDiagnosticReport, McpProfilePermission, McpStatus, ProfileDraft, ProfileStoreHealth, ScheduledTask, StorageOverview } from '../../shared/types'
import { ProfileEditor } from './ProfileEditor'
import { KernelManagerModal } from './KernelManagerModal'
import { ProfileDataModal } from './ProfileDataModal'
import { RecycleBinModal } from './RecycleBinModal'
import { ExtensionManagerModal } from './ExtensionManagerModal'
import { LaunchDiagnosticsModal } from './LaunchDiagnosticsModal'
import { CrashHistoryModal } from './CrashHistoryModal'
import { BatchResultModal, type BatchOperationResult } from './BatchResultModal'
import { UpdateModal } from './UpdateModal'
import { WorkspaceMigrationModal } from './WorkspaceMigrationModal'
import { AutomationModal } from './AutomationModal'
import { SchedulerModal } from './SchedulerModal'
import { McpModal } from './McpModal'
import { V2rayModal } from './V2rayModal'
import { V2rayNodePickerModal } from './V2rayNodePickerModal'
import { effectiveNetworkIdentity, geoConflictConfirmationMessage } from '../../shared/network-identity'
import { orderBatchLaunchProfiles, waitForBatchLaunchGap } from './batch-launch-order'
import { profileTableSorters } from './profile-table-sort'

const { Sider, Content } = Layout

function humanError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return mt(raw)
}

function statusTag(profile: BrowserProfileView) {
  const map = {
    closed: { color: 'default', text: t("已关闭") },
    starting: { color: 'processing', text: t("启动中") },
    running: { color: 'success', text: t("运行中") },
    stopping: { color: 'warning', text: t("关闭中") },
    orphaned: { color: 'volcano', text: t("进程遗留") },
    error: { color: 'error', text: t("异常") }
  } as const
  const item = map[profile.status]
  return <Tooltip title={mt(profile.lastError)}><Tag color={item.color}>{item.text}</Tag></Tooltip>
}

function proxyCheckTag(profile: BrowserProfileView) {
  const check = profile.proxyCheck
  if (!check) return <Typography.Text type="secondary" className="proxy-check-line">{t("未检测")}</Typography.Text>
  const stale = Date.now() - Date.parse(check.checkedAt) > 24 * 60 * 60 * 1000
  const detail = check.ok
    ? [check.ip, check.country, check.city, `${check.latencyMs} ms`, new Date(check.checkedAt).toLocaleString(getLocale())].filter(Boolean).join(' · ')
    : `${mt(check.error ?? t("连接失败"))} · ${new Date(check.checkedAt).toLocaleString(getLocale())}`
  return (
    <Tooltip title={detail}>
      <Tag color={check.exitChanged ? 'volcano' : check.ok ? stale ? 'warning' : 'success' : 'error'} className="proxy-check-tag">
        {check.ok ? `${check.ip ?? t("可用")} · ${check.latencyMs} ms${check.exitChanged ? ' · ' + t('出口变化') : stale ? ' · ' + t('已过期') : ''}` : t("检测失败")}
      </Tag>
    </Tooltip>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(0, bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export default function App() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale)
  const [profiles, setProfiles] = useState<BrowserProfileView[]>([])
  const [engine, setEngine] = useState<EngineStatus | null>(null)
  const [bundledEngine, setBundledEngine] = useState<EngineStatus | null>(null)
  const [kernels, setKernels] = useState<KernelRelease[]>([])
  const [loading, setLoading] = useState(true)
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<BrowserProfileView | undefined>()
  const [editorOpen, setEditorOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [kernelManagerOpen, setKernelManagerOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState('__all__')
  const [selectedStatus, setSelectedStatus] = useState('__all__')
  const [sortMode, setSortMode] = useState<'updated' | 'recent' | 'name' | 'created'>('updated')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [batchBusy, setBatchBusy] = useState(false)
  const [batchResult, setBatchResult] = useState<BatchOperationResult>()
  const [dataProfile, setDataProfile] = useState<BrowserProfileView | undefined>()
  const [recycleBinOpen, setRecycleBinOpen] = useState(false)
  const [extensions, setExtensions] = useState<BrowserExtension[]>([])
  const [extensionManagerOpen, setExtensionManagerOpen] = useState(false)
  const [profileStorageHealth, setProfileStorageHealth] = useState<ProfileStoreHealth | null>(null)
  const [appRecoveryStatus, setAppRecoveryStatus] = useState<AppRecoveryStatus | null>(null)
  const [diagnosticProfile, setDiagnosticProfile] = useState<BrowserProfileView>()
  const [diagnosticReport, setDiagnosticReport] = useState<LaunchDiagnosticReport>()
  const [crashProfile, setCrashProfile] = useState<BrowserProfileView>()
  const [crashRecords, setCrashRecords] = useState<BrowserCrashRecord[]>([])
  const [crashHistoryLoading, setCrashHistoryLoading] = useState(false)
  const [batchClassificationOpen, setBatchClassificationOpen] = useState(false)
  const [batchGroupEnabled, setBatchGroupEnabled] = useState(false)
  const [batchGroup, setBatchGroup] = useState('')
  const [batchTags, setBatchTags] = useState('')
  const [storage, setStorage] = useState<StorageOverview>()
  const [storageLoading, setStorageLoading] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus | null>(null)
  const [updateModalOpen, setUpdateModalOpen] = useState(false)
  const [announcementStatus, setAnnouncementStatus] = useState<AnnouncementStatus | null>(null)
  const [migrationMode, setMigrationMode] = useState<'export' | 'import' | null>(null)
  const [migrationBusy, setMigrationBusy] = useState(false)
  const [automationOpen, setAutomationOpen] = useState(false)
  const [automationStatus, setAutomationStatus] = useState<AutomationStatus | null>(null)
  const [schedulerOpen, setSchedulerOpen] = useState(false)
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([])
  const [mcpOpen, setMcpOpen] = useState(false)
  const [mcpStatus, setMcpStatus] = useState<McpStatus | null>(null)
  const [mcpPermissions, setMcpPermissions] = useState<McpProfilePermission[]>([])
  const [v2rayOpen, setV2rayOpen] = useState(false)
  const [nodePickerProfile, setNodePickerProfile] = useState<BrowserProfileView | null>(null)
  const [messageApi, contextHolder] = message.useMessage()

  useEffect(() => {
    void Promise.all([
      window.browserApi.profiles.list(),
      window.browserApi.engine.status(),
      window.browserApi.extensions.list(),
      window.browserApi.profiles.storageHealth(),
      window.browserApi.engine.installed(),
      window.browserApi.engine.bundled(),
      window.browserApi.diagnostics.sessionHealth(),
      window.browserApi.updates.status(),
      window.browserApi.automation.status(),
      window.browserApi.scheduler.list(),
      window.browserApi.mcp.status(),
      window.browserApi.mcp.permissions()
    ])
      .then(([items, engineStatus, extensionItems, storageHealth, installedKernels, bundled, recoveryStatus, applicationUpdate, localAutomation, tasks, localMcp, permissions]) => {
        setProfiles(items)
        setEngine(engineStatus)
        setExtensions(extensionItems)
        setProfileStorageHealth(storageHealth)
        setKernels(installedKernels)
        setBundledEngine(bundled)
        setAppRecoveryStatus(recoveryStatus)
        setUpdateStatus(applicationUpdate)
        setAutomationStatus(localAutomation)
        setScheduledTasks(tasks)
        setMcpStatus(localMcp)
        setMcpPermissions(permissions)
      })
      .catch((error) => messageApi.error(humanError(error)))
      .finally(() => setLoading(false))

    void refreshStorageOverview()
    void window.browserApi.announcements.check().then(setAnnouncementStatus).catch(() => undefined)

    const removeProfileListener = window.browserApi.profiles.onChanged((changed) => {
      setProfiles((current) => current.map((profile) => profile.id === changed.id ? changed : profile))
    })
    const removeUpdateListener = window.browserApi.updates.onChanged(setUpdateStatus)
    const removeAutomationListener = window.browserApi.automation.onChanged(setAutomationStatus)
    const removeSchedulerListener = window.browserApi.scheduler.onChanged(setScheduledTasks)
    const removeMcpListener = window.browserApi.mcp.onChanged(setMcpStatus)
    return () => {
      removeProfileListener()
      removeUpdateListener()
      removeAutomationListener()
      removeSchedulerListener()
      removeMcpListener()
    }
  }, [messageApi])

  const visibleProfiles = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const filtered = profiles.filter((profile) => {
      if (selectedGroup !== '__all__' && profile.group !== selectedGroup) return false
      if (favoritesOnly && !profile.favorite) return false
      if (selectedStatus === 'closed' && profile.status !== 'closed') return false
      if (selectedStatus === 'running' && !['starting', 'running', 'stopping'].includes(profile.status)) return false
      if (selectedStatus === 'attention' && !['orphaned', 'error'].includes(profile.status)) return false
      if (!normalized) return true
      return [String(profile.serialNumber), profile.name, profile.note, profile.group, ...profile.tags, profile.proxy.host, profile.fingerprint.timezone]
        .some((value) => value.toLowerCase().includes(normalized))
    })
    return [...filtered].sort((first, second) => {
      if (first.favorite !== second.favorite) return first.favorite ? -1 : 1
      if (sortMode === 'name') return first.name.localeCompare(second.name, locale, { numeric: true })
      if (sortMode === 'recent') return (second.lastOpenedAt ?? '').localeCompare(first.lastOpenedAt ?? '') || second.updatedAt.localeCompare(first.updatedAt)
      if (sortMode === 'created') return second.createdAt.localeCompare(first.createdAt)
      return second.updatedAt.localeCompare(first.updatedAt)
    })
  }, [profiles, query, selectedGroup, selectedStatus, sortMode, favoritesOnly, locale])

  const groupOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const profile of profiles) counts.set(profile.group, (counts.get(profile.group) ?? 0) + 1)
    return [
      { value: '__all__', label: t("全部分组 ({0})", profiles.length) },
      ...[...counts.entries()]
        .sort(([a], [b]) => a.localeCompare(b, locale))
        .map(([group, count]) => ({ value: group, label: `${group || t("未分组")} (${count})` }))
    ]
  }, [profiles, locale])
  const editableGroups = useMemo(() => [...new Set(profiles
    .map((profile) => profile.group.trim())
    .filter(Boolean))].sort((first, second) => first.localeCompare(second, locale)), [profiles, locale])

  function upsert(profile: BrowserProfileView): void {
    setProfiles((current) => {
      const exists = current.some((item) => item.id === profile.id)
      return exists ? current.map((item) => item.id === profile.id ? profile : item) : [profile, ...current]
    })
  }

  function canLaunchProfile(profile: BrowserProfileView): boolean {
    if (!profile.kernelVersion) return Boolean(engine?.executable)
    return selectableKernels.some((kernel) => kernel.version === profile.kernelVersion && kernel.executable)
  }

  const selectableKernels = useMemo(() => {
    if (!bundledEngine?.version || !bundledEngine.executable || kernels.some((kernel) => kernel.version === bundledEngine.version)) {
      return kernels
    }
    return [{
      version: bundledEngine.version,
      publishedAt: '',
      assetName: 'bundled-with-prism',
      downloadUrl: '',
      size: 0,
      sha256: '',
      installed: true,
      remoteAvailable: false,
      origin: 'bundled' as const,
      executable: bundledEngine.executable
    }, ...kernels]
  }, [bundledEngine, kernels])

  async function refreshStorageOverview(): Promise<void> {
    setStorageLoading(true)
    try {
      setStorage(await window.browserApi.profiles.storageOverview())
    } catch (error) {
      messageApi.error(humanError(error))
    } finally {
      setStorageLoading(false)
    }
  }

  async function toggleFavorite(profile: BrowserProfileView): Promise<void> {
    try {
      upsert(await window.browserApi.profiles.setFavorite(profile.id, !profile.favorite))
    } catch (error) {
      messageApi.error(humanError(error))
    }
  }

  async function withBusy(id: string, action: () => Promise<unknown>): Promise<void> {
    setBusyIds((current) => new Set(current).add(id))
    try {
      await action()
    } catch (error) {
      messageApi.error(humanError(error))
    } finally {
      setBusyIds((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }
  }

  function confirmGeoConflictLaunch(profile: BrowserProfileView, warning: string): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false
      const settle = (value: boolean): void => {
        if (settled) return
        settled = true
        resolve(value)
      }
      Modal.confirm({
        title: t("#{0} {1} 的代理地区存在冲突", profile.serialNumber, profile.name),
        content: mt(warning),
        okText: t("了解风险，继续打开"),
        cancelText: t("取消"),
        okButtonProps: { danger: true },
        onOk: () => settle(true),
        onCancel: () => settle(false),
        afterClose: () => settle(false)
      })
    })
  }

  async function launchWithGeoConflictConfirmation(profile: BrowserProfileView): Promise<BrowserProfileView | undefined> {
    try {
      return await window.browserApi.profiles.launch(profile.id)
    } catch (error) {
      const warning = geoConflictConfirmationMessage(humanError(error))
      if (!warning) throw error
      if (!await confirmGeoConflictLaunch(profile, warning)) return undefined
      return window.browserApi.profiles.launch(profile.id, { allowGeoConflict: true })
    }
  }

  async function saveProfile(draft: ProfileDraft): Promise<void> {
    setSaving(true)
    try {
      const saved = editing
        ? await window.browserApi.profiles.update(editing.id, draft)
        : await window.browserApi.profiles.create(draft)
      upsert(saved)
      setEditorOpen(false)
      setEditing(undefined)
      messageApi.success(editing ? t("环境已更新") : t("环境已创建"))
    } catch (error) {
      messageApi.error(humanError(error))
    } finally {
      setSaving(false)
    }
  }

  function openEditor(profile?: BrowserProfileView): void {
    setEditing(profile)
    setEditorOpen(true)
  }

  /**
   * Repoints a profile at another v2ray node.
   *
   * The exit IP changes, so a running browser cannot keep its current network
   * identity: it is closed first and reopened afterwards. The node is written
   * through the dedicated store method so only `v2rayNodeId` moves and the
   * stored exit check — which belongs to the old node — is dropped.
   */
  async function switchV2rayNode(profile: BrowserProfileView, nodeId: string): Promise<void> {
    const wasRunning = profile.status !== 'closed' && profile.status !== 'error'
    await withBusy(profile.id, async () => {
      let saved: BrowserProfileView
      try {
        if (wasRunning) upsert(await window.browserApi.profiles.close(profile.id))
        saved = await window.browserApi.profiles.setV2rayNode(profile.id, nodeId)
        upsert(saved)
      } catch (error) {
        messageApi.error(humanError(error))
        return
      }
      setNodePickerProfile(null)
      if (wasRunning) {
        const relaunched = await launchWithGeoConflictConfirmation(saved).catch((error) => {
          messageApi.error(humanError(error))
          return undefined
        })
        if (relaunched) upsert(relaunched)
      }
      messageApi.success(t('节点已切换'))
    })
  }

  async function importProfile(): Promise<void> {
    setImporting(true)
    try {
      const imported = await window.browserApi.profiles.importConfig()
      if (!imported) return
      upsert(imported)
      messageApi.success(t("环境配置已导入；出于安全考虑，代理密码需要重新填写"))
    } catch (error) {
      messageApi.error(humanError(error))
    } finally {
      setImporting(false)
    }
  }

  async function importProfileBackup(): Promise<void> {
    setImporting(true)
    try {
      const imported = await window.browserApi.profiles.importBackup()
      if (!imported) return
      upsert(imported.profile)
      messageApi.success(t("完整数据已导入为新环境，共 {0} 个文件；请重新填写代理密码", imported.result.fileCount))
    } catch (error) {
      messageApi.error(humanError(error), 6)
    } finally {
      setImporting(false)
    }
  }

  function confirmProfileBackupImport(): void {
    Modal.confirm({
      title: t("导入完整环境数据备份"),
      content: t("备份会导入为新的独立环境，不覆盖现有数据。代理密码和扩展不会迁移；跨系统导入后部分网站可能需要重新登录。"),
      okText: t("选择备份目录"),
      cancelText: t("取消"),
      onOk: importProfileBackup
    })
  }

  async function runWorkspaceMigration(password: string, conflictPolicy: 'rename' | 'skip'): Promise<void> {
    if (!migrationMode) return
    setMigrationBusy(true)
    try {
      const result = migrationMode === 'export'
        ? await window.browserApi.profiles.exportWorkspace(password)
        : await window.browserApi.profiles.importWorkspace(password, conflictPolicy)
      if (!result) return
      if (migrationMode === 'export') {
        messageApi.success(t("已加密导出 {0} 个环境、{1}", result.profileCount, formatBytes(result.totalBytes)))
      } else {
        const [items, extensionItems] = await Promise.all([window.browserApi.profiles.list(), window.browserApi.extensions.list()])
        setProfiles(items)
        setExtensions(extensionItems)
        void refreshStorageOverview()
        messageApi.success(result.renamedCount
          ? result.skippedCount
            ? t("已导入 {0} 个环境，自动改名 {1} 个，跳过 {2} 个", result.importedCount, result.renamedCount, result.skippedCount)
            : t("已导入 {0} 个环境，自动改名 {1} 个", result.importedCount, result.renamedCount)
          : result.skippedCount
            ? t("已导入 {0} 个环境，跳过 {1} 个", result.importedCount, result.skippedCount)
            : t("已导入 {0} 个环境", result.importedCount))
      }
      setMigrationMode(null)
    } catch (error) {
      messageApi.error(humanError(error), 8)
    } finally {
      setMigrationBusy(false)
    }
  }

  async function importBatchCsv(): Promise<void> {
    setImporting(true)
    try {
      const imported = await window.browserApi.profiles.importBatchCsv()
      if (!imported) return
      for (const profile of imported) upsert(profile)
      messageApi.success(t("已批量创建 {0} 个独立环境", imported.length))
    } catch (error) {
      messageApi.error(humanError(error), 6)
    } finally {
      setImporting(false)
    }
  }

  function confirmBatchImport(): void {
    Modal.confirm({
      title: t("批量导入 CSV 环境"),
      content: t("应用会先校验全部数据，任意一行错误都不会创建环境。CSV 中的代理密码是明文，请只使用可信文件，并在导入后妥善删除。"),
      okText: t("选择 CSV"),
      cancelText: t("取消"),
      onOk: importBatchCsv
    })
  }

  async function exportBatchTemplate(): Promise<void> {
    try {
      const path = await window.browserApi.profiles.exportBatchTemplate()
      if (path) messageApi.success(t("CSV 批量导入模板已保存"))
    } catch (error) {
      messageApi.error(humanError(error))
    }
  }

  async function runBatch(mode: 'launch' | 'close'): Promise<void> {
    const eligible = profiles.filter((profile) => selectedIds.includes(profile.id)).filter((profile) =>
      mode === 'launch'
        ? profile.status === 'closed' || profile.status === 'error'
        : profile.status !== 'closed' && profile.status !== 'error'
    )
    const candidates = mode === 'launch' ? orderBatchLaunchProfiles(eligible) : eligible
    if (!candidates.length) {
      messageApi.info(mode === 'launch' ? t("所选环境中没有可启动项") : t("所选环境中没有运行项"))
      return
    }
    setBatchBusy(true)
    setBusyIds((current) => new Set([...current, ...candidates.map((profile) => profile.id)]))
    const errors: string[] = []
    try {
      if (mode === 'launch') {
        for (let index = 0; index < candidates.length; index++) {
          const profile = candidates[index]
          try {
            const next = await launchWithGeoConflictConfirmation(profile)
            if (next) upsert(next)
            else errors.push(t("{0}：用户取消了 GeoIP 冲突风险确认", profile.name))
          } catch (error) {
            errors.push(`${profile.name}：${humanError(error)}`)
          }
          if (index < candidates.length - 1) await waitForBatchLaunchGap()
        }
      } else {
        for (let index = 0; index < candidates.length; index += 3) {
          await Promise.all(candidates.slice(index, index + 3).map(async (profile) => {
            try {
              upsert(await window.browserApi.profiles.close(profile.id))
            } catch (error) {
              errors.push(`${profile.name}：${humanError(error)}`)
            }
          }))
        }
      }
      if (errors.length) {
        setBatchResult({
          operation: mode === 'launch' ? '启动' : '关闭',
          total: candidates.length,
          succeeded: candidates.length - errors.length,
          errors
        })
        messageApi.warning(t("完成 {0} 个，失败 {1} 个", candidates.length - errors.length, errors.length))
      } else {
        messageApi.success(mode === 'launch' ? t("已启动 {0} 个环境", candidates.length) : t("已关闭 {0} 个环境", candidates.length))
      }
      setSelectedIds([])
    } finally {
      const ids = new Set(candidates.map((profile) => profile.id))
      setBusyIds((current) => new Set([...current].filter((id) => !ids.has(id))))
      setBatchBusy(false)
    }
  }

  async function runProxyChecks(ids: string[]): Promise<void> {
    const candidates = profiles.filter((profile) => ids.includes(profile.id))
    if (!candidates.length) return
    if (candidates.length > 100) {
      messageApi.warning(t("单次最多批量检测 100 个环境"))
      return
    }
    setBatchBusy(true)
    setBusyIds((current) => new Set([...current, ...candidates.map((profile) => profile.id)]))
    let available = 0
    let failed = 0
    const invocationErrors: string[] = []
    try {
      for (let index = 0; index < candidates.length; index += 5) {
        await Promise.all(candidates.slice(index, index + 5).map(async (profile) => {
          try {
            const next = await window.browserApi.profiles.testProxy(profile.id)
            upsert(next)
            if (next.proxyCheck?.ok) available += 1
            else failed += 1
          } catch (error) {
            invocationErrors.push(`${profile.name}：${humanError(error)}`)
          }
        }))
      }
      if (invocationErrors.length) messageApi.warning(t("检测完成：可用 {0}，失败 {1}，未保存 {2}", available, failed, invocationErrors.length))
      else messageApi.success(t("检测完成：可用 {0}，失败 {1}", available, failed))
    } finally {
      const checkedIds = new Set(candidates.map((profile) => profile.id))
      setBusyIds((current) => new Set([...current].filter((id) => !checkedIds.has(id))))
      setBatchBusy(false)
    }
  }

  async function runDiagnostics(profile: BrowserProfileView): Promise<void> {
    await withBusy(profile.id, async () => {
      const report = await window.browserApi.profiles.diagnose(profile.id)
      setDiagnosticProfile(profile)
      setDiagnosticReport(report)
    })
  }

  async function openCrashHistory(profile: BrowserProfileView): Promise<void> {
    setCrashProfile(profile)
    setCrashRecords([])
    setCrashHistoryLoading(true)
    try {
      setCrashRecords(await window.browserApi.profiles.crashHistory(profile.id))
    } catch (error) {
      messageApi.error(humanError(error))
    } finally {
      setCrashHistoryLoading(false)
    }
  }

  async function recoverCrashProfile(): Promise<void> {
    if (!crashProfile) return
    await withBusy(crashProfile.id, async () => {
      const next = crashProfile.status === 'orphaned'
        ? await window.browserApi.profiles.close(crashProfile.id)
        : await launchWithGeoConflictConfirmation(crashProfile)
      if (next) {
        upsert(next)
        setCrashProfile(next)
      }
    })
  }

  async function saveBatchClassification(): Promise<void> {
    const group = batchGroup.trim()
    const addTags = [...new Set(batchTags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean))]
    if (!batchGroupEnabled && !addTags.length) {
      messageApi.warning(t("请填写目标分组或要追加的标签"))
      return
    }
    setBatchBusy(true)
    try {
      const changed = await window.browserApi.profiles.classifyMany(selectedIds, {
        group: batchGroupEnabled ? group : undefined,
        addTags
      })
      for (const profile of changed) upsert(profile)
      setBatchClassificationOpen(false)
      setBatchGroupEnabled(false)
      setBatchGroup('')
      setBatchTags('')
      setSelectedIds([])
      messageApi.success(t("已更新 {0} 个环境", changed.length))
    } catch (error) {
      messageApi.error(humanError(error))
    } finally {
      setBatchBusy(false)
    }
  }

  function confirmBatchRemove(): void {
    const ids = [...selectedIds]
    Modal.confirm({
      title: t("将 {0} 个环境移入回收站？", ids.length),
      content: t("运行中的环境不会被删除。环境配置与独立浏览器数据会一起移入本机回收站，可逐个恢复。"),
      okText: t("移入回收站"),
      okButtonProps: { danger: true },
      cancelText: t("取消"),
      onOk: async () => {
        setBatchBusy(true)
        try {
          await window.browserApi.profiles.removeMany(ids)
          const removed = new Set(ids)
          setProfiles((current) => current.filter((profile) => !removed.has(profile.id)))
          setSelectedIds([])
          messageApi.success(t("已将 {0} 个环境移入回收站", ids.length))
        } catch (error) {
          messageApi.error(humanError(error))
          throw error
        } finally {
          setBatchBusy(false)
        }
      }
    })
  }

  function profileMenu(profile: BrowserProfileView): MenuProps {
    const editable = profile.status === 'closed' || profile.status === 'error'
    return {
      items: [
        { key: 'edit', icon: <EditOutlined />, label: t("编辑"), disabled: !editable },
        {
          key: 'switch-node',
          icon: <GlobalOutlined />,
          label: t("切换节点"),
          disabled: profile.proxy.protocol !== 'v2ray'
        },
        { key: 'data', icon: <DatabaseOutlined />, label: t("环境数据") },
        { key: 'diagnose', icon: <SafetyCertificateOutlined />, label: t("启动诊断") },
        { key: 'crashes', icon: <WarningFilled />, label: t("异常与恢复") },
        { key: 'proxy-check', icon: <ApiOutlined />, label: t("检测代理") },
        { key: 'duplicate', icon: <CopyOutlined />, label: t("复制环境") },
        { key: 'export', icon: <DownloadOutlined />, label: t("导出配置"), disabled: !editable },
        { type: 'divider' },
        { key: 'delete', icon: <DeleteOutlined />, label: t("删除"), danger: true, disabled: !editable }
      ],
      onClick: ({ key }) => {
        if (key === 'edit') openEditor(profile)
        if (key === 'switch-node') setNodePickerProfile(profile)
        if (key === 'data') setDataProfile(profile)
        if (key === 'diagnose') void runDiagnostics(profile)
        if (key === 'crashes') void openCrashHistory(profile)
        if (key === 'proxy-check') void runProxyChecks([profile.id])
        if (key === 'duplicate') {
          void withBusy(profile.id, async () => {
            const copy = await window.browserApi.profiles.duplicate(profile.id)
            upsert(copy)
            messageApi.success(t("已复制为新的独立环境"))
          })
        }
        if (key === 'export') {
          void withBusy(profile.id, async () => {
            const path = await window.browserApi.profiles.exportConfig(profile.id)
            if (path) messageApi.success(t("环境配置已导出（不包含代理密码和浏览数据）"))
          })
        }
        if (key === 'delete') {
          Modal.confirm({
            title: t("删除“{0}”？", profile.name),
            content: t("环境会从列表移除，浏览器数据将移动到本机回收目录，避免误删后无法恢复。"),
            okText: t("删除"),
            okButtonProps: { danger: true },
            cancelText: t("取消"),
            onOk: async () => {
              await window.browserApi.profiles.remove(profile.id)
              setProfiles((current) => current.filter((item) => item.id !== profile.id))
              setSelectedIds((current) => current.filter((id) => id !== profile.id))
            }
          })
        }
      }
    }
  }

  const columns: TableColumnsType<BrowserProfileView> = [
    {
      title: t("环境"),
      dataIndex: 'name',
      width: 250,
      sorter: profileTableSorters.environment,
      render: (_value, profile) => (
        <div className="profile-name-cell">
          <span className="profile-dot" style={{ background: profile.color }} />
          <Button
            type="text"
            size="small"
            className={`favorite-button${profile.favorite ? ' active' : ''}`}
            aria-label={profile.favorite ? t("取消收藏") : t("收藏环境")}
            icon={profile.favorite ? <StarFilled /> : <StarOutlined />}
            onClick={() => void toggleFavorite(profile)}
          />
          <div>
            <Typography.Text strong>#{profile.serialNumber} · {profile.name}</Typography.Text>
            {profile.note && <Typography.Text type="secondary" className="profile-subtitle">{profile.note}</Typography.Text>}
          </div>
        </div>
      )
    },
    {
      title: t("分组 / 标签"),
      key: 'classification',
      width: 190,
      sorter: profileTableSorters.classification,
      render: (_value, profile) => (
        <div className="profile-tags">
          <Tag icon={<FolderOutlined />}>{profile.group || t("未分组")}</Tag>
          {profile.tags.slice(0, 2).map((tag) => <Tag key={tag}>{tag}</Tag>)}
          {profile.tags.length > 2 && <Tooltip title={profile.tags.slice(2).join('、')}><Tag>+{profile.tags.length - 2}</Tag></Tooltip>}
        </div>
      )
    },
    {
      title: t("状态"),
      dataIndex: 'status',
      width: 100,
      sorter: profileTableSorters.status,
      render: (_value, profile) => statusTag(profile)
    },
    {
      title: t("代理"),
      dataIndex: 'proxy',
      width: 220,
      sorter: profileTableSorters.proxy,
      render: (_value, profile) => (
        <div className="proxy-cell">
          <div>{profile.proxy.protocol === 'direct'
            ? <Typography.Text type="secondary">{t("本地网络")}</Typography.Text>
            : <><Tag>{profile.proxy.protocol.toUpperCase()}</Tag>{profile.proxy.host}:{profile.proxy.port}</>}</div>
          {proxyCheckTag(profile)}
        </div>
      )
    },
    {
      title: t("指纹"),
      dataIndex: 'fingerprint',
      width: 230,
      sorter: profileTableSorters.fingerprint,
      render: (_value, profile) => (
        <div className="fingerprint-cell">
          <span>{profile.fingerprint.platform === 'windows' ? 'Windows' : 'macOS'}</span>
          <span>{profile.fingerprint.screenWidth}×{profile.fingerprint.screenHeight}</span>
          <span>{effectiveNetworkIdentity(profile.fingerprint, profile.proxyCheck).timezone}</span>
          <span>{profile.kernelVersion
            ? <>{t("浏览器内核")}{profile.kernelVersion}</>
            : t("内核自动")}</span>
          <span className={`webrtc-badge ${profile.fingerprint.webrtcPolicy}`}>
            {profile.fingerprint.webrtcPolicy === 'proxy_only' ? t("WebRTC 防泄漏") : profile.fingerprint.webrtcPolicy === 'public_only' ? t("WebRTC 公网") : t("WebRTC 默认")}
          </span>
        </div>
      )
    },
    {
      title: t("指纹种子"),
      dataIndex: ['fingerprint', 'seed'],
      width: 125,
      sorter: profileTableSorters.seed,
      render: (seed: number) => <code className="seed-code">{seed}</code>
    },
    {
      title: t("操作"),
      key: 'actions',
      width: 170,
      fixed: 'right',
      render: (_value, profile) => {
        const running = ['starting', 'running', 'stopping', 'orphaned'].includes(profile.status)
        return (
          <Space>
            <Button
              type={running ? 'default' : 'primary'}
              danger={running}
              loading={busyIds.has(profile.id) || profile.status === 'starting' || profile.status === 'stopping'}
              disabled={!running && !canLaunchProfile(profile)}
              icon={running ? <PoweroffOutlined /> : <GlobalOutlined />}
              onClick={() => void withBusy(profile.id, async () => {
                const next = running
                  ? await window.browserApi.profiles.close(profile.id)
                  : await launchWithGeoConflictConfirmation(profile)
                if (next) upsert(next)
              })}
            >
              {profile.status === 'orphaned' ? t("结束遗留") : running ? t("关闭") : t("打开")}
            </Button>
            <Dropdown menu={profileMenu(profile)} trigger={['click']}>
              <Button type="text" icon={<MoreOutlined />} />
            </Dropdown>
          </Space>
        )
      }
    }
  ]

  const runningCount = profiles.filter((profile) => profile.status === 'running' || profile.status === 'orphaned').length

  return (
    <Layout className="app-shell">
      {contextHolder}
      <Sider width={224} className="sidebar">
        <div className="brand">
          <div className="brand-mark">Y</div>
          <div><strong>Yk</strong><span>指纹浏览器</span></div>
        </div>
        <div className="sidebar-section-label">{t("工作空间")}</div>
        <div className="nav-item active"><AppstoreOutlined /><span>{t("浏览器环境")}</span><b>{profiles.length}</b></div>
        <button className="nav-item sidebar-action" onClick={() => setRecycleBinOpen(true)}>
          <RestOutlined /><span>{t("环境回收站")}</span>
        </button>
        <div className="sidebar-section-label secondary">{t("工具与自动化")}</div>
        <button className="nav-item sidebar-action" onClick={() => setExtensionManagerOpen(true)}>
          <AppstoreAddOutlined /><span>{t("浏览器扩展")}</span><b>{extensions.length || ''}</b>
        </button>
        <button className="nav-item sidebar-action" onClick={() => setV2rayOpen(true)}>
          <GlobalOutlined /><span>{t("V2Ray 订阅")}</span>
        </button>
        <button className="nav-item sidebar-action" onClick={() => setUpdateModalOpen(true)}>
          <DownloadOutlined /><span>{t("应用更新")}</span><b>{announcementStatus?.state === 'available' ? '1' : ''}</b>
        </button>
        <button className="nav-item sidebar-action" onClick={() => setAutomationOpen(true)}>
          <ApiOutlined /><span>{t("自动化 API")}</span><b>{automationStatus?.state === 'running' ? 'ON' : ''}</b>
        </button>
        <button className="nav-item sidebar-action" onClick={() => setSchedulerOpen(true)}>
          <ClockCircleOutlined /><span>{t("计划任务")}</span><b>{scheduledTasks.filter((task) => task.enabled).length || ''}</b>
        </button>
        <button className="nav-item sidebar-action" onClick={() => setMcpOpen(true)}>
          <RobotOutlined /><span>{t("本地 AI · MCP")}</span><b>{mcpStatus?.state === 'running' ? 'ON' : ''}</b>
        </button>
        <div className="sidebar-spacer" />
        <button className="engine-card" onClick={() => setKernelManagerOpen(true)}>
          <span className={`engine-indicator ${engine?.fingerprintKernel ? 'ready' : ''}`} />
          <span><strong>{engine?.fingerprintKernel ? t("指纹内核已连接") : t("配置浏览器内核")}</strong><small>{mt(engine?.label ?? t("正在检查…"))}</small></span>
          <SettingOutlined />
        </button>
        <div className="version">Yk 指纹浏览器 · v{updateStatus?.currentVersion ?? '0.2.0-beta.1'}</div>
      </Sider>

      <Layout>
        <Content className="content">
          <header className="page-header">
            <div>
              <span className="page-kicker">{t("工作空间")}</span>
              <Typography.Title level={2}>{t("浏览器环境")}</Typography.Title>
              <Typography.Text type="secondary">{t("每个环境的数据、指纹和网络设置彼此独立。")}</Typography.Text>
            </div>
            <Space wrap className="header-actions">
              <LanguageSelector />
              {runningCount > 0 && (
                <Button icon={<PoweroffOutlined />} onClick={() => void window.browserApi.profiles.closeAll()}>{t("全部关闭")}</Button>
              )}
              <Dropdown
                menu={{
                  items: [
                    { key: 'single', label: t("导入单个 JSON 环境") },
                    { key: 'batch', label: t("批量导入 CSV") },
                    { key: 'backup', label: t("导入完整数据备份") },
                    { key: 'workspace', label: t("导入全部环境迁移包") },
                    { type: 'divider' },
                    { key: 'csv-sample', label: t("保存 CSV 示例文件") }
                  ],
                  onClick: ({ key }) => {
                    if (key === 'single') void importProfile()
                    if (key === 'batch') confirmBatchImport()
                    if (key === 'backup') confirmProfileBackupImport()
                    if (key === 'workspace') setMigrationMode('import')
                    if (key === 'csv-sample') void exportBatchTemplate()
                  }
                }}
                trigger={['click']}
              >
                <Button icon={<UploadOutlined />} loading={importing}>{t("导入环境")}</Button>
              </Dropdown>
              <Button icon={<DownloadOutlined />} onClick={() => setMigrationMode('export')}>{t("迁移全部环境")}</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>{t("新建环境")}</Button>
            </Space>
          </header>

          {announcementStatus?.state === 'available' && announcementStatus.announcement && (
            <Alert
              className="engine-alert"
              type={announcementStatus.announcement.severity === 'critical' ? 'error' : announcementStatus.announcement.severity}
              showIcon
              closable
              title={announcementStatus.announcement.title}
              description={announcementStatus.announcement.body}
              action={announcementStatus.announcement.action
                ? <Button onClick={() => void window.browserApi.announcements.openAction()}>{announcementStatus.announcement.action.label}</Button>
                : undefined}
            />
          )}

          {engine && !engine.fingerprintKernel && (
            <Alert
              className="engine-alert"
              type={engine.executable ? 'warning' : 'error'}
              showIcon
              icon={engine.executable ? <WarningFilled /> : undefined}
              title={engine.executable ? t("当前运行在兼容模式") : t("尚未配置浏览器内核")}
              description={engine.executable
                ? t("当前内核不支持指纹配置，请在使用前切换到指纹内核。")
                : t("请先选择或导入浏览器内核。")}
              action={<Button onClick={() => setKernelManagerOpen(true)}>{t("管理内核")}</Button>}
            />
          )}

          {profileStorageHealth?.recoveredFromBackup && (
            <Alert
              className="engine-alert"
              type="warning"
              showIcon
              title={t("环境配置已从备份自动恢复")}
              description={t("环境数据已恢复，可以继续使用。")}
            />
          )}

          {appRecoveryStatus?.previousUnclean && (
            <Alert
              className="engine-alert"
              type="warning"
              showIcon
              title={t("检测到上次应用未正常退出")}
              description={appRecoveryStatus.markerCorrupt
                ? t("环境数据未受影响。")
                : t("已自动检查可能遗留的浏览器进程，环境数据未受影响。")}
            />
          )}

          {profileStorageHealth && !profileStorageHealth.backupHealthy && (
            <Alert
              className="engine-alert"
              type="error"
              showIcon
              title={t("环境配置备份失败")}
              description={t("当前数据仍可使用，请检查磁盘空间和目录权限。")}
            />
          )}

          <section className="summary-row">
            <div className="summary-card"><span>{t("全部环境")}</span><strong>{profiles.length}</strong></div>
            <div className="summary-card"><span>{t("运行中")}</span><strong className="running-number">{runningCount}</strong></div>
            <div className="summary-card engine-summary">
              <span>{t("浏览器内核")}</span>
              <strong>{mt(engine?.label ?? t("正在检查"))}</strong>
              {engine?.fingerprintKernel && <CheckCircleFilled />}
            </div>
            <Tooltip title={storage ? t("环境 {0} · 缓存 {1} · 回收站 {2} · 内核 {3} · 扩展 {4}", formatBytes(storage.profilesBytes), formatBytes(storage.cacheBytes), formatBytes(storage.recycleBytes), formatBytes(storage.kernelsBytes), formatBytes(storage.extensionsBytes)) : t("统计本地存储")}>
              <button className="summary-card storage-summary" onClick={() => void refreshStorageOverview()}>
                <span>{t("本地数据")}</span>
                <strong>{storage ? formatBytes(storage.totalBytes) : t("统计中")}</strong>
                <ReloadOutlined spin={storageLoading} />
              </button>
            </Tooltip>
          </section>

          <section className="profiles-panel">
            <div className="table-toolbar">
              <div className="table-title-actions">
                <Typography.Title level={4}>{t("全部环境")}</Typography.Title>
                {selectedIds.length > 0 && (
                  <Space>
                    <Typography.Text type="secondary">{t("已选择 {0} 项", selectedIds.length)}</Typography.Text>
                    <Button
                      size="small"
                      icon={<GlobalOutlined />}
                      loading={batchBusy}
                      disabled={!selectedIds.some((id) => {
                        const profile = profiles.find((item) => item.id === id)
                        return profile && canLaunchProfile(profile)
                      })}
                      onClick={() => void runBatch('launch')}
                    >{t("批量打开")}</Button>
                    <Button size="small" icon={<PoweroffOutlined />} loading={batchBusy} onClick={() => void runBatch('close')}>{t("批量关闭")}</Button>
                    <Button size="small" icon={<ApiOutlined />} loading={batchBusy} onClick={() => void runProxyChecks(selectedIds)}>{t("检测代理")}</Button>
                    <Button size="small" icon={<TagsOutlined />} disabled={batchBusy} onClick={() => setBatchClassificationOpen(true)}>{t("分组/标签")}</Button>
                    <Button size="small" danger icon={<DeleteOutlined />} disabled={batchBusy} onClick={confirmBatchRemove}>{t("移入回收站")}</Button>
                  </Space>
                )}
              </div>
              <Space>
                <Button type={favoritesOnly ? 'primary' : 'default'} icon={favoritesOnly ? <StarFilled /> : <StarOutlined />} onClick={() => setFavoritesOnly((value) => !value)}>{t("收藏")}</Button>
                <Select
                  value={selectedGroup}
                  options={groupOptions}
                  onChange={setSelectedGroup}
                  className="group-filter"
                />
                <Select
                  value={selectedStatus}
                  onChange={setSelectedStatus}
                  className="status-filter"
                  options={[
                    { value: '__all__', label: t("全部状态") },
                    { value: 'closed', label: t("已关闭") },
                    { value: 'running', label: t("运行中") },
                    { value: 'attention', label: t("需要处理") }
                  ]}
                />
                <Select
                  value={sortMode}
                  onChange={setSortMode}
                  className="sort-filter"
                  options={[
                    { value: 'updated', label: t("最近修改") },
                    { value: 'recent', label: t("最近打开") },
                    { value: 'name', label: t("名称排序") },
                    { value: 'created', label: t("最近创建") }
                  ]}
                />
                <Input
                  allowClear
                  prefix={<SearchOutlined />}
                  placeholder={t("搜索环境、标签或代理…")}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="search-input"
                />
              </Space>
            </div>
            <Spin spinning={loading}>
              <Table
                rowKey="id"
                columns={columns}
                dataSource={visibleProfiles}
                rowSelection={{
                  selectedRowKeys: selectedIds,
                  preserveSelectedRowKeys: true,
                  onChange: (keys) => setSelectedIds(keys.map(String))
                }}
                pagination={profiles.length > 12 ? { pageSize: 12 } : false}
                scroll={{ x: 1240 }}
                locale={{
                  emptyText: (
                    <Empty description={t("还没有浏览器环境")}>
                      <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>{t("创建第一个环境")}</Button>
                    </Empty>
                  )
                }}
              />
            </Spin>
          </section>
        </Content>
      </Layout>
      <UpdateModal
        open={updateModalOpen}
        appStatus={updateStatus}
        announcementStatus={announcementStatus}
        onClose={() => setUpdateModalOpen(false)}
        onAnnouncementChanged={setAnnouncementStatus}
      />
      <WorkspaceMigrationModal
        mode={migrationMode}
        busy={migrationBusy}
        profileCount={profiles.length}
        onSubmit={runWorkspaceMigration}
        onClose={() => { if (!migrationBusy) setMigrationMode(null) }}
      />
      <AutomationModal
        open={automationOpen}
        status={automationStatus}
        onChanged={setAutomationStatus}
        onClose={() => setAutomationOpen(false)}
      />
      <SchedulerModal
        open={schedulerOpen}
        tasks={scheduledTasks}
        profiles={profiles}
        onChanged={setScheduledTasks}
        onClose={() => setSchedulerOpen(false)}
      />
      <McpModal
        open={mcpOpen}
        status={mcpStatus}
        permissions={mcpPermissions}
        profiles={profiles}
        onStatusChanged={setMcpStatus}
        onPermissionsChanged={setMcpPermissions}
        onClose={() => setMcpOpen(false)}
      />

      <ProfileEditor
        open={editorOpen}
        profile={editing}
        suggestedIndex={profiles.length + 1}
        saving={saving}
        extensions={extensions}
        engine={engine}
        kernels={selectableKernels}
        groups={editableGroups}
        onCancel={() => { setEditorOpen(false); setEditing(undefined) }}
        onSave={saveProfile}
        onManageV2ray={() => setV2rayOpen(true)}
      />
      <V2rayModal open={v2rayOpen} onClose={() => setV2rayOpen(false)} />
      <V2rayNodePickerModal
        profile={nodePickerProfile}
        onClose={() => setNodePickerProfile(null)}
        onSelect={(nodeId) => nodePickerProfile
          ? switchV2rayNode(nodePickerProfile, nodeId)
          : Promise.resolve()}
      />
      <KernelManagerModal
        open={kernelManagerOpen}
        engine={engine}
        onClose={() => setKernelManagerOpen(false)}
        onEngineChanged={(nextEngine) => {
          setEngine(nextEngine)
          void window.browserApi.engine.installed().then(setKernels).catch((error) => messageApi.error(humanError(error)))
        }}
      />
      <ProfileDataModal
        open={Boolean(dataProfile)}
        profile={dataProfile}
        onClose={() => setDataProfile(undefined)}
      />
      <RecycleBinModal
        open={recycleBinOpen}
        onClose={() => setRecycleBinOpen(false)}
        onRestored={upsert}
      />
      <ExtensionManagerModal
        open={extensionManagerOpen}
        extensions={extensions}
        onClose={() => setExtensionManagerOpen(false)}
        onChanged={setExtensions}
      />
      <LaunchDiagnosticsModal
        open={Boolean(diagnosticProfile && diagnosticReport)}
        profile={diagnosticProfile}
        report={diagnosticReport}
        onClose={() => { setDiagnosticProfile(undefined); setDiagnosticReport(undefined) }}
      />
      <CrashHistoryModal
        open={Boolean(crashProfile)}
        profile={crashProfile}
        records={crashRecords}
        loading={crashHistoryLoading}
        recovering={Boolean(crashProfile && busyIds.has(crashProfile.id))}
        onClose={() => { setCrashProfile(undefined); setCrashRecords([]) }}
        onRecover={() => void recoverCrashProfile()}
        onDiagnose={() => {
          if (!crashProfile) return
          const profile = crashProfile
          setCrashProfile(undefined)
          void runDiagnostics(profile)
        }}
      />
      <BatchResultModal result={batchResult} onClose={() => setBatchResult(undefined)} />
      <Modal
        open={batchClassificationOpen}
        title={t("批量修改 {0} 个环境", selectedIds.length)}
        okText={t("应用修改")}
        cancelText={t("取消")}
        confirmLoading={batchBusy}
        onOk={() => void saveBatchClassification()}
        onCancel={() => { setBatchClassificationOpen(false); setBatchGroupEnabled(false); setBatchGroup(''); setBatchTags('') }}
      >
        <Typography.Paragraph type="secondary">{t("可选择设置或清空分组；标签会追加并自动去重。")}</Typography.Paragraph>
        <Space direction="vertical" className="batch-classification-fields">
          <Checkbox checked={batchGroupEnabled} onChange={(event) => setBatchGroupEnabled(event.target.checked)}>{t("修改分组（留空即清除分组）")}</Checkbox>
          <Input disabled={!batchGroupEnabled} value={batchGroup} maxLength={40} placeholder={t("目标分组")} onChange={(event) => setBatchGroup(event.target.value)} />
          <Input value={batchTags} placeholder={t("追加标签，使用逗号分隔（可选）")} onChange={(event) => setBatchTags(event.target.value)} />
        </Space>
      </Modal>
    </Layout>
  )
}
