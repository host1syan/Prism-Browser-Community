import { safeStorage } from 'electron'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export interface SecretCodec {
  encode(value: string): string
  decode(value: string): string
}

export const identitySecretCodec: SecretCodec = {
  encode: (value) => value,
  decode: (value) => value
}

export class ElectronSecretCodec implements SecretCodec {
  encode(value: string): string {
    if (!value) return ''
    if (safeStorage.isEncryptionAvailable()) {
      return `encrypted:v1:${safeStorage.encryptString(value).toString('base64')}`
    }
    return `fallback:v1:${Buffer.from(value, 'utf8').toString('base64')}`
  }

  decode(value: string): string {
    if (!value) return ''
    if (value.startsWith('encrypted:v1:')) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('系统凭据存储当前不可用，无法读取代理密码')
      return safeStorage.decryptString(Buffer.from(value.slice('encrypted:v1:'.length), 'base64'))
    }
    if (value.startsWith('fallback:v1:')) {
      return Buffer.from(value.slice('fallback:v1:'.length), 'base64').toString('utf8')
    }
    return value
  }
}

const PORTABLE_PREFIX = 'portable:v1:'
const KEY_BYTES = 32
const IV_BYTES = 12
const TAG_BYTES = 16

/**
 * Secret storage for a portable install.
 *
 * `safeStorage` cannot be used here: it is backed by the OS keyring (DPAPI on
 * Windows), whose key is derived from the machine and user account, so a disk
 * carried to another computer could not read back anything written on the
 * first. Instead the key travels with the disk, in a file the vault does not
 * contain — a vault copied somewhere on its own cannot be decrypted, which is
 * the case this protects. Someone holding the whole disk has both halves.
 */
export class PortableSecretCodec implements SecretCodec {
  constructor(private readonly key: Buffer) {
    if (key.length !== KEY_BYTES) throw new Error('便携密钥长度无效')
  }

  encode(value: string): string {
    if (!value) return ''
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    return PORTABLE_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64')
  }

  decode(value: string): string {
    if (!value) return ''
    if (value.startsWith('encrypted:v1:')) {
      throw new Error('该密码由系统凭据加密，便携模式下无法读取，请重新输入代理密码')
    }
    if (value.startsWith('fallback:v1:')) {
      // Written by an earlier run that had no keyring available.
      return Buffer.from(value.slice('fallback:v1:'.length), 'base64').toString('utf8')
    }
    if (!value.startsWith(PORTABLE_PREFIX)) return value
    const raw = Buffer.from(value.slice(PORTABLE_PREFIX.length), 'base64')
    if (raw.length <= IV_BYTES + TAG_BYTES) throw new Error('便携密码数据已损坏')
    const decipher = createDecipheriv('aes-256-gcm', this.key, raw.subarray(0, IV_BYTES))
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES))
    return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8')
  }
}
