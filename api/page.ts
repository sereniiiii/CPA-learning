import type { VercelRequest, VercelResponse } from '@vercel/node'
import { applySecurityHeaders, isAuthenticated, unauthorized } from './_lib/auth.js'
import { readPage } from './_lib/github.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applySecurityHeaders(res)
  if (!isAuthenticated(req)) return unauthorized(res)

  if (req.method !== 'GET') {
    return res.status(405).json({ error: '方法不支持' })
  }

  const id = typeof req.query.id === 'string' ? req.query.id : ''
  if (!id) return res.status(400).json({ error: '缺少 id' })

  try {
    const page = await readPage(id)
    if (!page) return res.status(404).json({ error: '页面不存在' })
    return res.status(200).json({ page })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: message })
  }
}
