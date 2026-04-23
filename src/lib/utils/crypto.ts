import crypto from 'crypto'
import bcrypt from 'bcryptjs'

const ALGO = 'aes-256-gcm'
const KEY  = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex') // 32 bytes = 64 hex chars

// ─── Cifrado ──────────────────────────────────────────────────────────────────

export function encrypt(text: string): string {
  const iv   = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, KEY, iv)
  const enc  = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag  = cipher.getAuthTag()
  return [iv, tag, enc].map(b => b.toString('base64')).join(':')
}

export function decrypt(ciphertext: string): string {
  const [ivB64, tagB64, encB64] = ciphertext.split(':')
  const iv  = Buffer.from(ivB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const enc = Buffer.from(encB64, 'base64')
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}

// ─── Contraseñas ──────────────────────────────────────────────────────────────

export const hashPassword   = (pwd: string) => bcrypt.hash(pwd, 12)
export const verifyPassword = (pwd: string, hash: string) => bcrypt.compare(pwd, hash)
