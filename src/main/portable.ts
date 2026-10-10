import { app } from 'electron'
import { randomBytes } from 'node:crypto'
import { accessSync, chmodSync, constants, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { PortableSecretCodec } from './secret-codec'
import type { SecretCodec } from './secret-codec'

/**
 * Where a portable install keeps everything: next to the executable.
 *
 * The app is otherwise a normal installed application and stores its data under
 * `%APPDATA%`. This module only redirects it when the executable's own folder is
 * writable, which is what makes a zip or U-disk copy self-contained.
 */
export interface PortableLayout {
  portable: boolean
  /** Directory holding vault, logs and preferences when portable. */
  root?: string
  /** Why portable mode was declined, for the startup log. */
  reason?: string
}

/** A directory the app may write into, or a reason it may not. */
function probeWritable(directory: string): string | undefined {
  const probe = join(directory, `.prism-write-probe-${process.pid}`)
  try {
    writeFileSync(probe, '')
    rmSync(probe, { force: true })
    return undefined
  } catch (error) {
    rmSync(probe, { force: true })
    return (error as NodeJS.ErrnoException).code ?? 'unknown'
  }
}

/**
 * Decides whether this run is portable and, if so, moves userData next to the
 * executable.
 *
 * Must be called before `app.whenReady()`: Electron resolves `userData` during
 * startup, so a later `setPath` would leave Chromium's own state behind in the
 * old location.
 */
export function configurePortableLayout(): PortableLayout {
  // In development the executable is the Electron binary inside node_modules,
  // so a "writable folder next to it" means nothing.
  if (!app.isPackaged) return { portable: false, reason: 'not-packaged' }

  // An explicit override wins, so a portable copy can be pinned somewhere else
  // or an installed copy can be told to behave portably for testing.
  const override = process.env.PRISM_PORTABLE_DIR
  const executableDirectory = override || dirname(app.getPath('exe'))

  try {
    accessSync(executableDirectory, constants.W_OK)
  } catch {
    return { portable: false, reason: 'read-only' }
  }

  const denied = probeWritable(executableDirectory)
  if (denied) return { portable: false, reason: denied }

  const root = join(executableDirectory, 'data')
  try {
    mkdirSync(root, { recursive: true })
  } catch (error) {
    return { portable: false, reason: (error as NodeJS.ErrnoException).code ?? 'unknown' }
  }

  app.setPath('userData', root)
  // Chromium writes these next to the user data directory by default; without
  // this they would land in the system temp folder and follow the machine
  // rather than the disk.
  app.setPath('sessionData', root)
  return { portable: true, root }
}

const KEY_FILE = 'secret.key'
const KEY_BYTES = 32

/**
 * Loads the secret key that travels with a portable install, creating it on
 * first run.
 *
 * The file sits beside the vault rather than inside it, so a vault copied out
 * on its own (the usual way proxy passwords leak — posted for support, picked
 * up by a sync client) cannot be decrypted.
 */
export function loadPortableSecretCodec(root: string): SecretCodec {
  const path = join(root, KEY_FILE)
  let key: Buffer
  try {
    key = readFileSync(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    key = randomBytes(KEY_BYTES)
    writeFileSync(path, key, { mode: 0o600 })
    chmodSync(path, 0o600)
    return new PortableSecretCodec(key)
  }
  if (key.length !== KEY_BYTES) {
    // Regenerating would silently make every stored password unreadable.
    throw new Error(`便携密钥文件已损坏（${path}），请删除它后重新输入代理密码`)
  }
  return new PortableSecretCodec(key)
}
