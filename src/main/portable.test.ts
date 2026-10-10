import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadPortableSecretCodec } from './portable'

const temporaryPaths: string[] = []

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

async function root(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'prism-portable-'))
  temporaryPaths.push(path)
  return path
}

describe('portable secret key', () => {
  it('creates a key file on first run and reuses it afterwards', async () => {
    const directory = await root()
    const first = loadPortableSecretCodec(directory)
    const encoded = first.encode('hunter2')
    expect(encoded.startsWith('portable:v1:')).toBe(true)

    // A second run must read the same key, or the stored password is lost.
    const second = loadPortableSecretCodec(directory)
    expect(second.decode(encoded)).toBe('hunter2')
    expect((await readFile(join(directory, 'secret.key'))).length).toBe(32)
  })

  it('round-trips through the vault-relative codec', async () => {
    const directory = await root()
    const codec = loadPortableSecretCodec(directory)
    for (const value of ['', 'p@ss word', '中文密码', 'a'.repeat(4096)]) {
      expect(codec.decode(codec.encode(value))).toBe(value)
    }
  })

  it('does not write the plaintext into the encoded value', async () => {
    const directory = await root()
    const codec = loadPortableSecretCodec(directory)
    const encoded = codec.encode('super-secret-password')
    expect(encoded).not.toContain('super-secret-password')
    expect(Buffer.from(encoded.slice('portable:v1:'.length), 'base64').toString('utf8'))
      .not.toContain('super-secret-password')
  })

  it('refuses a corrupted key file instead of silently regenerating it', async () => {
    const directory = await root()
    await writeFile(join(directory, 'secret.key'), Buffer.alloc(7))
    expect(() => loadPortableSecretCodec(directory)).toThrow('便携密钥文件已损坏')
  })

  it('cannot decrypt with a different disk key', async () => {
    const first = loadPortableSecretCodec(await root())
    const second = loadPortableSecretCodec(await root())
    const encoded = first.encode('hunter2')
    expect(() => second.decode(encoded)).toThrow()
  })

  it('explains why a keyring-encrypted secret cannot be read portably', async () => {
    const codec = loadPortableSecretCodec(await root())
    expect(() => codec.decode('encrypted:v1:AAAA')).toThrow('请重新输入代理密码')
  })

  it('still reads values written before a key existed', async () => {
    const codec = loadPortableSecretCodec(await root())
    const legacy = `fallback:v1:${Buffer.from('old-password', 'utf8').toString('base64')}`
    expect(codec.decode(legacy)).toBe('old-password')
  })
})
