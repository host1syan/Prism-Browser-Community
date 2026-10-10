import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SettingsStore } from './settings-store'

const temporaryPaths: string[] = []

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('SettingsStore', () => {
  it('defaults legacy settings to no automatic recycle cleanup and persists an explicit policy', async () => {
    const vault = await mkdtemp(join(tmpdir(), 'prism-settings-'))
    temporaryPaths.push(vault)
    await writeFile(join(vault, 'settings.json'), JSON.stringify({ browserExecutable: '', fingerprintKernel: false }))
    const settings = new SettingsStore(vault)
    await settings.initialize()
    expect(settings.get().recycleRetentionDays).toBe(0)
    expect(settings.get().enginePreference).toBe('auto')

    await settings.update({ recycleRetentionDays: 30, enginePreference: 'system' })
    const reopened = new SettingsStore(vault)
    await reopened.initialize()
    expect(reopened.get().recycleRetentionDays).toBe(30)
    expect(reopened.get().enginePreference).toBe('system')
  })

  it('stores a kernel inside the vault relative to it', async () => {
    const vault = await mkdtemp(join(tmpdir(), 'prism-settings-'))
    temporaryPaths.push(vault)
    const settings = new SettingsStore(vault)
    await settings.initialize()
    const absolute = join(vault, 'kernels', '150.0.7871.186', 'chrome.exe')
    await settings.update({ browserExecutable: absolute })

    const onDisk = JSON.parse(await readFile(join(vault, 'settings.json'), 'utf8'))
    expect(onDisk.browserExecutable).toBe('vault:kernels/150.0.7871.186/chrome.exe')
    // The in-memory value stays absolute so callers need no change.
    expect(settings.get().browserExecutable).toBe(absolute)

    // The whole vault moving is what makes the disk survive a drive-letter
    // change: the same file, read under a new prefix, points at the new place.
    const movedRoot = join(vault, 'elsewhere')
    await mkdir(movedRoot, { recursive: true })
    await copyFile(join(vault, 'settings.json'), join(movedRoot, 'settings.json'))
    const moved = new SettingsStore(movedRoot)
    await moved.initialize()
    expect(moved.get().browserExecutable).toBe(join(movedRoot, 'kernels', '150.0.7871.186', 'chrome.exe'))
  })

  it('keeps an executable outside the vault absolute', async () => {
    const vault = await mkdtemp(join(tmpdir(), 'prism-settings-'))
    temporaryPaths.push(vault)
    const settings = new SettingsStore(vault)
    await settings.initialize()
    const external = join(tmpdir(), 'somewhere-else', 'chrome.exe')
    await settings.update({ browserExecutable: external })
    const onDisk = JSON.parse(await readFile(join(vault, 'settings.json'), 'utf8'))
    expect(onDisk.browserExecutable).toBe(external)
  })
})
