import type { VercelRequest, VercelResponse } from '@vercel/node'
import { applySecurityHeaders, isAuthenticated, unauthorized } from './_lib/auth.js'
import { readIndex, readPage } from './_lib/github.js'

/**
 * GET /api/export —— 导出全部笔记内容（不含图片二进制）。
 *
 * 图片以 /api/asset?id=xxx 的形式出现在正文里，前端拿到 manifest 后
 * 逐个拉取图片转 base64，最终由浏览器组装完整 JSON 并下载。
 * 这样服务端永远不需要返回大响应，避开 Vercel 4.5MB 响应体上限。
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  applySecurityHeaders(res)
  if (!isAuthenticated(req)) return unauthorized(res)
  if (req.method !== 'GET') return res.status(405).json({ error: '方法不支持' })

  try {
    const index = await readIndex()
    const pages = []

    for (const meta of index.pages) {
      const page = await readPage(meta.id)
      if (!page) continue
      pages.push({
        id: meta.id,
        title: meta.title,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
        content: page.content,
      })
    }

    return res.status(200).json({
      version: 1,
      exportedAt: new Date().toISOString(),
      pages,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: message })
  }
}
