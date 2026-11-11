import type { VercelRequest, VercelResponse } from '@vercel/node'
import { applySecurityHeaders, isAuthenticated, unauthorized } from './_lib/auth'
import { listAssets, readBinary, writeAsset } from './_lib/github'
import { createHash } from 'node:crypto'

const ASSET_DIR = 'data/assets'
const MAX_BYTES = 3 * 1024 * 1024 // 3MB，给 base64 编码留余量

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
}

/**
 * GET  /api/asset?id=xxx.png   —— 从 GitHub 读出图片并回传
 * POST /api/asset              —— 接收 dataURL，写入 GitHub
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  applySecurityHeaders(res)
  if (!isAuthenticated(req)) return unauthorized(res)

  try {
    if (req.method === 'GET') {
      const id = typeof req.query.id === 'string' ? req.query.id : ''
      if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
        return res.status(400).json({ error: '非法的资源 ID' })
      }
      const data = await readBinary(`${ASSET_DIR}/${id}`)
      if (!data) return res.status(404).json({ error: '资源不存在' })

      const ext = id.split('.').pop() || ''
      const mime = Object.keys(MIME_EXT).find((m) => MIME_EXT[m] === ext) || 'application/octet-stream'
      res.setHeader('Content-Type', mime)
      res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
      return res.status(200).send(data)
    }

    if (req.method === 'POST') {
      const dataUrl = typeof req.body?.data === 'string' ? req.body.data : ''
      const match = /^data:([a-zA-Z0-9/+.-]+);base64,(.+)$/.exec(dataUrl)
      if (!match) return res.status(400).json({ error: '图片格式不正确' })

      const mime = match[1].toLowerCase()
      const ext = MIME_EXT[mime]
      if (!ext) return res.status(400).json({ error: `不支持的图片类型：${mime}` })

      const buffer = Buffer.from(match[2], 'base64')
      if (buffer.length > MAX_BYTES) {
        return res.status(413).json({ error: '图片过大，请压缩后再试' })
      }

      // 内容哈希做文件名：同一张图重复上传不会产生新文件，天然去重
      const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16)
      const id = `${hash}.${ext}`

      const existing = await listAssets()
      if (!existing.some((f) => f.path === `${ASSET_DIR}/${id}`)) {
        await writeAsset(id, buffer)
      }

      return res.status(200).json({ id, url: `/api/asset?id=${id}` })
    }

    return res.status(405).json({ error: '方法不支持' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: message })
  }
}
