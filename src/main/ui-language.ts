import { app, ipcMain, Menu, shell } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getLocale, isUiLocale, resolveLocale, setLocale, t } from '../shared/i18n'

function installMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ label: 'Yk 指纹浏览器', submenu: [
      { role: 'about' as const, label: t('关于 Yk 指纹浏览器') }, { type: 'separator' as const },
      { role: 'hide' as const, label: t('隐藏 Yk 指纹浏览器') },
      { role: 'hideOthers' as const, label: t('隐藏其他应用') },
      { role: 'unhide' as const, label: t('全部显示') }, { type: 'separator' as const },
      { role: 'quit' as const, label: t('退出 Yk 指纹浏览器') }
    ] }] : []),
    { label: t('编辑'), submenu: [
      { role: 'undo', label: t('撤销') }, { role: 'redo', label: t('重做') },
      { type: 'separator' }, { role: 'cut', label: t('剪切') },
      { role: 'copy', label: t('复制') }, { role: 'paste', label: t('粘贴') },
      { role: 'selectAll', label: t('全选') }
    ] },
    { label: t('视图'), submenu: [
      { role: 'resetZoom', label: t('实际大小') }, { role: 'zoomIn', label: t('放大') },
      { role: 'zoomOut', label: t('缩小') }, { role: 'togglefullscreen', label: t('全屏') }
    ] },
    { label: t('窗口'), submenu: [
      { role: 'minimize', label: t('最小化') }, { role: 'zoom', label: t('缩放') },
      { role: 'close', label: t('关闭窗口') }
    ] },
    { label: t('帮助'), submenu: [{ label: t('官网'), click: () => { void shell.openExternal('https://prismbrowser.app/') } }] }
  ]))
}

/** UI preferences are separate from vault/profile fingerprint settings. */
export async function initializeUiLanguage(): Promise<void> {
  const directory = app.getPath('userData')
  const path = join(directory, 'ui-language.json')
  // Electron's app locale can differ from the OS display language (notably in
  // packaged macOS apps). Use the user's primary system language, not regional
  // number/date formatting or Chromium's selected locale.
  let selected = resolveLocale('en')
  try {
    selected = resolveLocale(app.getPreferredSystemLanguages()[0] ?? '')
  } catch { /* If the OS language cannot be read, use English. */ }
  try {
    const saved = JSON.parse(await readFile(path, 'utf8'))
    if (isUiLocale(saved.locale)) selected = saved.locale
  } catch { /* Missing or damaged preference falls back to the OS language. */ }
  setLocale(selected)
  installMenu()
  let pendingSave: Promise<unknown> = Promise.resolve()
  ipcMain.handle('ui-language:get', () => getLocale())
  ipcMain.handle('ui-language:set', async (_event, value: unknown) => {
    if (!isUiLocale(value)) throw new Error('Unsupported interface language')
    const save = pendingSave.then(async () => {
      await mkdir(directory, { recursive: true })
      const temporary = `${path}.tmp`
      await writeFile(temporary, JSON.stringify({ locale: value }), { mode: 0o600 })
      await rename(temporary, path)
      setLocale(value)
      installMenu()
      return value
    })
    pendingSave = save.catch(() => undefined)
    return save
  })
}
