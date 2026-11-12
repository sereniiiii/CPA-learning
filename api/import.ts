import type { VercelRequest, VercelResponse } from '@vercel/node'
import { applySecurityHeaders, isAuthenticated, unauthorized } from './_lib/auth.js'
import {
  createPageRecord,
  deletePageRecord,
  listAssets,
  readIndex,
  writeAsset,
  writePage,
} from './_lib/github.js'

interface ImportedPage {
  id: string
  title: string
  content: string
  createdAt?: string
  updatedAt?: string
}

interface ImportPayload {
  pages?: ImportedPage[]
  assets?: Record<string, string> // id -> base64
  mode?: 'merge' | 'replace'
}

/**
 * POST /api/import —— 从导出文件恢复内容。
 *
 * mode = merge   （默认）新增或覆盖同 id 页面，保留其他页面
 * mode = replace 清空后完全还原
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  applySecurityHeaders(res)
  if (!isAuthenticated(req)) return unauthorized(res)
  if (req.method !== 'POST') return res.status(405).json({ error: '方法不支持' })

  try {
    const payload = req.body as ImportPayload
    const pages = Array.isArray(payload?.pages) ? payload.pages : []
    const assets = payload?.assets && typeof payload.assets === 'object' ? payload.assets : {}
    const mode = payload?.mode === 'replace' ? 'replace' : 'merge'

    if (pages.length === 0) {
      return res.status(400).json({ error: '文件中没有可导入的笔记' })
    }

    const result = { pages: 0, assets: 0, removed: 0 }

    // 1. 先写图片（图片引用在正文里，必须先存在）
    const existingAssets = await listAssets()
    const existingAssetPaths = new Set(existingAssets.map((a) => a.path))
    for (const [id, base64] of Object.entries(assets)) {
      if (!/^[a-zA-Z0-9._-]+$/.test(id)) continue
      const path = `data/assets/${id}`
      if (existingAssetPaths.has(path)) continue
      try {
        await writeAsset(id, Buffer.from(base64, 'base64'))
        result.assets += 1
      } catch {
        // 单张图片失败不阻断整体导入
      }
    }

    // 2. 写入页面
    const index = await readIndex()
    for (const page of pages) {
      if (!page?.id || typeof page.content !== 'string') continue
      const exists = index.pages.some((p) => p.id === page.id)
      if (exists) {
        await writePage(page.id, page.title || page.id, page.content, `导入：${page.title || page.id}`)
      } else {
        await createPageRecord(page.id, page.title || page.id, page.content)
      }
      result.pages += 1
    }

    // 3. replace 模式：删掉不在导入文件里的页面
    if (mode === 'replace') {
      const keepIds = new Set(pages.map((p) => p.id))
      const toRemove = index.pages.filter((p) => !keepIds.has(p.id))
      for (const p of toRemove) {
        await deletePageRecord(p.id)
        result.removed += 1
      }
    }

    return res.status(200).json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: message })
  }
}
