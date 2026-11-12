import type { VercelRequest, VercelResponse } from '@vercel/node'
import { applySecurityHeaders, isAuthenticated, unauthorized } from './_lib/auth.js'
import { readBinary, readFile } from './_lib/github.js'

/**
 * 教材内容读取。
 *
 * 内容存在 GitHub 的 data 分支：
 *   data/index.json          章节目录（导航用，含难度与热点信号）
 *   data/chapters/<id>.json  单章详情（考点正文 + 例题）
 *   data/subjectives.json    主观题集训
 *   data/shots/<vol>-<page>.jpg  原文截图（OCR 不可信处的保底）
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  applySecurityHeaders(res)
  if (!isAuthenticated(req)) return unauthorized(res)

  try {
    if (req.method === 'GET') {
      const kind = typeof req.query.kind === 'string' ? req.query.kind : 'index'

      // 科目：内容库按科目分目录存放
      const subject = typeof req.query.subject === 'string' ? req.query.subject : 'cwc'
      if (!/^[a-z]{2,4}$/.test(subject)) {
        return res.status(400).json({ error: '非法的科目 ID' })
      }

      if (kind === 'subjects') {
        // 科目清单
        const text = await readFile('data/subjects.json')
        if (!text) return res.status(404).json({ error: '科目清单未就绪' })
        res.setHeader('Cache-Control', 'private, max-age=600')
        return res.status(200).send(text)
      }

      if (kind === 'index') {
        const text = await readFile(`data/subjects/${subject}/index.json`)
        if (!text) return res.status(404).json({ error: '内容库未就绪' })
        res.setHeader('Cache-Control', 'private, max-age=600')
        return res.status(200).send(text)
      }

      if (kind === 'chapter') {
        const id = typeof req.query.id === 'string' ? req.query.id : ''
        if (!/^ch\d{2}$/.test(id)) return res.status(400).json({ error: '非法的章节 ID' })
        const text = await readFile(`data/subjects/${subject}/chapters/${id}.json`)
        if (!text) return res.status(404).json({ error: '章节不存在' })
        res.setHeader('Cache-Control', 'private, max-age=600')
        return res.status(200).send(text)
      }

      if (kind === 'subjectives') {
        const text = await readFile('data/subjectives.json')
        if (!text) return res.status(404).json({ error: '主观题集训未就绪' })
        res.setHeader('Cache-Control', 'private, max-age=600')
        return res.status(200).send(text)
      }

      if (kind === 'subjectiveIndex') {
        const text = await readFile(`data/subjects/${subject}/subjectives/index.json`)
        if (!text) return res.status(404).json({ error: '主观题集训未就绪' })
        res.setHeader('Cache-Control', 'private, max-age=600')
        return res.status(200).send(text)
      }

      if (kind === 'subjectiveTopic') {
        const id = typeof req.query.id === 'string' ? req.query.id : ''
        if (!/^topic\d{2}$/.test(id)) return res.status(400).json({ error: '非法的专题 ID' })
        const text = await readFile(`data/subjects/${subject}/subjectives/${id}.json`)
        if (!text) return res.status(404).json({ error: '专题不存在' })
        res.setHeader('Cache-Control', 'private, max-age=600')
        return res.status(200).send(text)
      }

      if (kind === 'blockIndex') {
        const text = await readFile(`data/subjects/${subject}/blocks.json`)
        if (!text) return res.status(404).json({ error: '知识块索引未就绪' })
        res.setHeader('Cache-Control', 'private, max-age=600')
        return res.status(200).send(text)
      }

      if (kind === 'shot') {
        const name = typeof req.query.name === 'string' ? req.query.name : ''
        // .png 与 .jpg 都支持 —— 教材块图统一转成 JPEG q90（体积省 76%）
        if (!/^[a-z0-9_\-\u4e00-\u9fff]{1,80}\.(png|jpg)$/.test(name)) {
          return res.status(400).json({ error: '非法的图片名' })
        }
        const data = await readBinary(`data/subjects/${subject}/blocks/${name}`)
        if (!data) return res.status(404).json({ error: '截图不存在' })
        res.setHeader('Content-Type', name.endsWith('.jpg') ? 'image/jpeg' : 'image/png')
        res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
        return res.status(200).send(data)
      }

      return res.status(400).json({ error: '未知的 kind' })
    }

    return res.status(405).json({ error: '方法不支持' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: message })
  }
}
