import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  applySecurityHeaders,
  checkPassword,
  clearSessionCookie,
  isAuthenticated,
  setSessionCookie,
  unauthorized,
} from './_lib/auth.js'

export default function handler(req: VercelRequest, res: VercelResponse) {
  applySecurityHeaders(res)

  if (req.method === 'GET') {
    return res.status(200).json({ authenticated: isAuthenticated(req) })
  }

  if (req.method === 'POST') {
    const password = typeof req.body?.password === 'string' ? req.body.password : ''
    if (!password || !checkPassword(password)) {
      return res.status(401).json({ error: '口令不正确' })
    }
    setSessionCookie(res)
    return res.status(200).json({ authenticated: true })
  }

  if (req.method === 'DELETE') {
    clearSessionCookie(res)
    return res.status(200).json({ authenticated: false })
  }

  return unauthorized(res)
}
