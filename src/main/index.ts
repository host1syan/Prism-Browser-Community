import { initializeUiLanguage } from './ui-language'
import { app, BrowserWindow, dialog, shell } from 'electron'
import { isAbsolute, join } from 'node:path'
import { BrowserLauncher } from './browser-launcher'
import { registerIpc } from './ipc'
import { ProfileStore } from './profile-store'
import { ElectronSecretCodec } from './secret-codec'
import { SettingsStore } from './settings-store'
import { KernelManager } from './kernel-manager'
import { AppLogger } from './app-logger'
import { ExtensionStore } from './extension-store'
import { CookieManager } from './cookie-manager'
import { publicProfile } from './profile-secrets'
import { ProfileBackupManager } from './profile-backup'
import { AppSessionTracker } from './app-session'
import { UpdateManager } from './update-manager'
import { migrateMacLegacyKernelSelection } from './browser-locator'
import { WorkspaceMigrationManager } from './workspace-migration'
import { AutomationAuditLog } from './automation-audit'
import { LocalAutomationManager } from './automation-server'
import { SchedulerStore } from './scheduler-store'
import { SchedulerAuditLog } from './scheduler-audit'
import { SchedulerManager } from './scheduler-manager'
import { McpPermissionStore } from './mcp-permission-store'
import { McpAuditLog } from './mcp-audit'
import { McpControlManager } from './mcp-control-manager'
import { AnnouncementManager } from './announcement-manager'
import { V2rayStore } from './v2ray-store'
import { V2rayCore } from './v2ray-core'
import { V2rayManager } from './v2ray-manager'
import { configurePortableLayout, loadPortableSecretCodec } from './portable'

let mainWindow: BrowserWindow | null = null
let launcher: BrowserLauncher | null = null
let logger: AppLogger | null = null
let appSession: AppSessionTracker | null = null
let automation: LocalAutomationManager | null = null
let scheduler: SchedulerManager | null = null
let mcp: McpControlManager | null = null

if (process.platform === 'win32') app.setAppUserModelId('com.prismbrowser.desktop')

if (process.env.PRISM_E2E === '1' && process.env.PRISM_E2E_USER_DATA && isAbsolute(process.env.PRISM_E2E_USER_DATA)) {
  app.setPath('userData', process.env.PRISM_E2E_USER_DATA)
}

// Must run before whenReady(): Electron resolves userData during startup, so a
// later setPath would strand Chromium's own state in the old location.
const portable = configurePortableLayout()

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1320,
    height: 820,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    title: 'Yk 指纹浏览器',
    backgroundColor: '#f3f5f9',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.once('ready-to-show', () => window.show())
  window.webContents.on('console-message', (event) => {
    if (event.level === 'error') logger?.error('Renderer console error', event.message)
  })
  window.webContents.on('did-fail-load', (_event, code, description, url) => {
    logger?.error('Renderer load failed', { code, description, url })
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
  return window
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) app.quit()

app.whenReady().then(async () => {
  await initializeUiLanguage()
  const vaultPath = join(app.getPath('userData'), 'vault')
  logger = new AppLogger(vaultPath)
  appSession = new AppSessionTracker(vaultPath)
  // A portable disk cannot use the OS keyring: its key is bound to the machine
  // that wrote the secret, so the next computer could not read it back. The key
  // travels on the disk instead.
  const secretCodec = portable.root
    ? loadPortableSecretCodec(portable.root)
    : new ElectronSecretCodec()
  const profiles = new ProfileStore(vaultPath, secretCodec)
  const settings = new SettingsStore(vaultPath)
  const extensions = new ExtensionStore(vaultPath, logger)
  const automationAudit = new AutomationAuditLog(vaultPath)
  const schedulerAudit = new SchedulerAuditLog(vaultPath)
  const mcpAudit = new McpAuditLog(vaultPath)
  await logger.initialize()
  if (portable.portable) {
    logger.info('便携模式：数据保存在程序目录', { root: portable.root })
  } else {
    logger.info('便携模式未启用', { reason: portable.reason })
  }
  await Promise.all([automationAudit.initialize(), schedulerAudit.initialize(), mcpAudit.initialize()])
  const appSessionSnapshot = await appSession.begin(app.getVersion())
  if (appSessionSnapshot.previousUnclean) {
    logger.error('检测到上次 Yk 指纹浏览器未正常退出', appSessionSnapshot.previousUnclean)
  }
  await Promise.all([profiles.initialize(), settings.initialize(), extensions.initialize()])
  const kernelMigration = await migrateMacLegacyKernelSelection(settings, vaultPath)
  if (kernelMigration.migrated) {
    logger.info('已将 macOS 旧版托管内核切换为应用内置新版内核', {
      previousVersion: kernelMigration.previousVersion,
      bundledVersion: kernelMigration.bundledVersion
    })
  }
  const purgedTrashCount = await profiles.purgeTrashOlderThan(settings.get().recycleRetentionDays)
  if (purgedTrashCount) logger.info('已按保留策略自动清理环境回收站', { count: purgedTrashCount })
  const profileStorageHealth = profiles.storageHealth()
  if (profileStorageHealth.recoveredFromBackup) logger.error('环境元数据已从备份恢复', profileStorageHealth)
  if (!profileStorageHealth.backupHealthy) logger.error('环境元数据备份不可用', profileStorageHealth.backupError)
  logger.info('Yk 指纹浏览器已启动', { version: app.getVersion(), platform: process.platform, arch: process.arch })

  const v2ray = new V2rayManager({
    store: new V2rayStore(vaultPath, secretCodec),
    core: new V2rayCore({ vaultPath, resourcesPath: process.resourcesPath, logger }),
    vaultPath,
    logger
  })
  await v2ray.initialize()
  launcher = new BrowserLauncher(profiles, settings, (profile) => {
    mainWindow?.webContents.send('profiles:changed', publicProfile(profile))
  }, extensions, logger)
  launcher.setV2rayManager(v2ray)
  await launcher.initialize()
  const kernels = new KernelManager(vaultPath, settings, () => undefined, logger, (version) => profiles.kernelUsers(version))
  const cookies = new CookieManager(profiles, settings, logger)
  const backups = new ProfileBackupManager(profiles, app.getVersion(), logger)
  const workspaceMigration = new WorkspaceMigrationManager(profiles, extensions, app.getVersion(), logger)
  const updater = new UpdateManager(vaultPath, app.getVersion(), process.resourcesPath, (status) => {
    mainWindow?.webContents.send('updates:changed', status)
  }, logger)
  const announcements = new AnnouncementManager(process.resourcesPath, app.getVersion(), logger)
  await updater.initialize()
  mcp = new McpControlManager(
    new McpPermissionStore(vaultPath), profiles, launcher, mcpAudit,
    (status) => mainWindow?.webContents.send('mcp:changed', status)
  )
  await mcp.initialize()
  automation = new LocalAutomationManager({
    profiles,
    launcher,
    audit: automationAudit,
    appVersion: app.getVersion(),
    resourcesPath: process.resourcesPath,
    onChanged: (status) => mainWindow?.webContents.send('automation:changed', status),
    logger
  })
  automation.attachMcpBroker(mcp)
  scheduler = new SchedulerManager(
    new SchedulerStore(vaultPath),
    profiles,
    launcher,
    schedulerAudit,
    (tasks) => mainWindow?.webContents.send('scheduler:changed', tasks),
    logger
  )
  await scheduler.initialize()
  registerIpc({
    profiles, settings, launcher, kernels, extensions, cookies, logger, backups, workspaceMigration,
    appSession, updater, automation, scheduler, mcp, announcements, v2ray,
    portableStatus: () => ({ portable: portable.portable, root: portable.root, reason: portable.reason })
  })
  mainWindow = createWindow()
  if (app.isPackaged && process.env.PRISM_E2E !== '1') {
    setTimeout(() => void updater.check().catch(() => undefined), 10_000)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
}).catch(async (error) => {
  logger?.error('Yk 指纹浏览器启动失败', error)
  await logger?.flush()
  dialog.showErrorBox(
    'Yk 指纹浏览器无法启动',
    '应用启动失败，但现有环境数据没有被修改。请重新启动；如仍然失败，请查看日志文件。'
  )
  app.quit()
})

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

app.on('before-quit', (event) => {
  if (!launcher) return
  event.preventDefault()
  const current = launcher
  launcher = null
  void Promise.allSettled([
    scheduler?.shutdown() ?? Promise.resolve(),
    mcp?.shutdown() ?? Promise.resolve(),
    automation?.shutdown() ?? Promise.resolve()
  ]).then(() => Promise.allSettled([current.closeAll()])).then(() => current.stopV2rayRelays()).finally(async () => {
    logger?.info('Yk 指纹浏览器已退出')
    await appSession?.complete().catch((error) => logger?.error('清理应用会话标记失败', error))
    await logger?.flush()
    app.quit()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

process.on('uncaughtExceptionMonitor', (error) => {
  logger?.error('主进程未捕获异常', error)
})

process.on('unhandledRejection', (reason) => {
  logger?.error('主进程未处理 Promise 拒绝', reason)
  console.error(reason)
})
