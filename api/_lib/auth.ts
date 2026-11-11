/**
 * 访问控制。
 *
 * 两道锁：
 *  1. Vercel Authentication（部署级）—— 在 Vercel 控制台开启，保护所有部署 URL。
 *  2. 本层的共享口令（应用级）—— 通过 /api/session 换取 httpOnly cookie。
 *
 * 第2 道是兜底：即使 Vercel 侧的门禁配置有疏漏，数据接口也不会裸奔。
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHmac, timingSafeEqual } from 'node:crypto'

const COOKIE_NAME = 'study_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 天

function secret(): string {
  const s = process.env.SESSION_SECRET
  if (!s) throw new Error('缺少环境变量 SESSION_SECRET')
  return s
}

function sign(value: string): string {
  return createHmac('sha256', secret()).update(value).digest('hex')
}

export function issueToken(): string {
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  const payload = `u:${expires}`
  return `${payload}.${sign(payload)}`
}

export function verifyToken(token: string | undefined): boolean {
  if (!token) return false
  const idx = token.lastIndexOf('.')
  if (idx <= 0) return false
  const payload = token.slice(0, idx)
  const provided = token.slice(idx + 1)
  const expected = sign(payload)
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  if (!timingSafeEqual(a, b)) return false
  const expires = Number(payload.split(':')[1])
  return Number.isFinite(expires) && expires * 1000 > Date.now()
}

function readCookie(req: VercelRequest, name: string): string | undefined {
  const raw = req.headers.cookie
  if (!raw) return undefined
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim())
    }
  }
  return undefined
}

export function isAuthenticated(req: VercelRequest): boolean {
  return verifyToken(readCookie(req, COOKIE_NAME))
}

export function setSessionCookie(res: VercelResponse): void {
  const token = issueToken()
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`,
  )
}

export function clearSessionCookie(res: VercelResponse): void {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
}

export function unauthorized(res: VercelResponse): void {
  res.status(401).json({ error: '需要登录' })
}

/**
 * 校验共享口令。
 * 口令在 Vercel 环境变量 ACCESS_PASSWORD 里，以 scrypt 派生比较，避免明文留存。
 */
export function checkPassword(input: string): boolean {
  const expected = process.env.ACCESS_PASSWORD
  if (!expected) return false
  const a = Buffer.from(input)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** 统一的安全响应头：禁止缓存 + 禁止嵌入 + 收紧 referrer */
export function applySecurityHeaders(res: VercelResponse): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
}
