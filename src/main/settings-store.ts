import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { AppSettings } from '../shared/types'

/**
 * Marks an executable path stored relative to the vault.
 *
 * A portable install keeps its kernels inside the vault, so the absolute path
 * recorded on one computer is wrong on the next one — a USB disk changes drive
 * letter and a synced folder changes its prefix. Storing the path relative to
 * the vault makes it survive both.
 */
const VAULT_RELATIVE = 'vault:'

export class SettingsStore {
  private settings: AppSettings = { browserExecutable: '', fingerprintKernel: false, enginePreference: 'auto', recycleRetentionDays: 0 }
  private readonly path: string

  constructor(private readonly vaultPath: string) {
    this.path = join(vaultPath, 'settings.json')
  }

  /** Expands a stored executable path into one usable on this machine. */
  private absoluteExecutable(stored: string): string {
    if (!stored.startsWith(VAULT_RELATIVE)) return stored
    return join(this.vaultPath, stored.slice(VAULT_RELATIVE.length))
  }

  /** Collapses an executable path that lives inside the vault. */
  private storedExecutable(absolute: string): string {
    if (!absolute || !isAbsolute(absolute)) return absolute
    const target = resolve(absolute)
    const root = resolve(this.vaultPath)
    if (target !== root && !target.startsWith(`${root}${sep}`)) return absolute
    return VAULT_RELATIVE + relative(root, target).split(sep).join('/')
  }

  async initialize(): Promise<void> {
    try {
      const stored = JSON.parse(await readFile(this.path, 'utf8')) as Partial<AppSettings>
      this.settings = {
        browserExecutable: typeof stored.browserExecutable === 'string'
          ? this.absoluteExecutable(stored.browserExecutable)
          : '',
        fingerprintKernel: stored.fingerprintKernel === true,
        enginePreference: stored.enginePreference === 'bundled' || stored.enginePreference === 'system' ? stored.enginePreference : 'auto',
        recycleRetentionDays: stored.recycleRetentionDays === 7 || stored.recycleRetentionDays === 30 || stored.recycleRetentionDays === 90
          ? stored.recycleRetentionDays
          : 0
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  get(): AppSettings {
    return { ...this.settings }
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    this.settings = { ...this.settings, ...patch }
    await mkdir(dirname(this.path), { recursive: true })
    const temporary = `${this.path}.tmp`
    const onDisk = {
      ...this.settings,
      browserExecutable: this.storedExecutable(this.settings.browserExecutable)
    }
    await writeFile(temporary, JSON.stringify(onDisk, null, 2), { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, this.path)
    return this.get()
  }

  async hasConfiguredExecutable(): Promise<boolean> {
    if (!this.settings.browserExecutable) return false
    try {
      await access(this.settings.browserExecutable, constants.X_OK)
      return true
    } catch {
      return false
    }
  }
}
