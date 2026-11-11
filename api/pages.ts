import type { VercelRequest, VercelResponse } from '@vercel/node'
import { applySecurityHeaders, isAuthenticated, unauthorized } from './_lib/auth.js'
import {
  createPageRecord,
  deletePageRecord,
  newId,
  readIndex,
  slugify,
  writePage,
} from './_lib/github.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applySecurityHeaders(res)
  if (!isAuthenticated(req)) return unauthorized(res)

  try {
    if (req.method === 'GET') {
      const index = await readIndex()
      const pages = index.pages
        .slice()
        .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt))
      return res.status(200).json({ pages })
    }

    if (req.method === 'POST') {
      const rawTitle = typeof req.body?.title === 'string' ? req.body.title.trim() : ''
      const title = rawTitle || '未命名'
      const content = typeof req.body?.content === 'string' ? req.body.content : ''

      const index = await readIndex()
      let id = slugify(title)
      if (index.pages.some((p) => p.id === id)) {
        id = `${id}-${newId().slice(-4)}`
      }

      const page = await createPageRecord(id, title, content)
      return res.status(201).json({ page })
    }

    if (req.method === 'PUT') {
      const id = typeof req.body?.id === 'string' ? req.body.id : ''
      const title = typeof req.body?.title === 'string' ? req.body.title.trim() : ''
      const content = typeof req.body?.content === 'string' ? req.body.content : ''
      if (!id) return res.status(400).json({ error: '缺少 id' })

      const index = await readIndex()
      const meta = index.pages.find((p) => p.id === id)
      if (!meta) return res.status(404).json({ error: '页面不存在' })

      await writePage(id, title || meta.title, content, `更新：${title || meta.title}`)

      return res.status(200).json({
        page: { ...meta, title: title || meta.title, updatedAt: new Date().toISOString() },
      })
    }

    if (req.method === 'DELETE') {
      const id = typeof req.body?.id === 'string' ? req.body.id : ''
      if (!id) return res.status(400).json({ error: '缺少 id' })

      const index = await readIndex()
      if (!index.pages.some((p) => p.id === id)) {
        return res.status(404).json({ error: '页面不存在' })
      }

      await deletePageRecord(id)
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: '方法不支持' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: message })
  }
}
