import type { VercelRequest, VercelResponse } from '@vercel/node'
import { applySecurityHeaders, isAuthenticated, unauthorized } from './_lib/auth.js'
import { readFile, writeFile } from './_lib/github.js'

/**
 * 用户数据同步。
 *
 * 存在 GitHub data 分支的 data/userdata.json：
 *   - learning：掌握度、错题本、间隔重排
 *   - overlays：用户对教材内容的修改与补充（覆盖层，不改教材原文）
 *   - questions：用户自加的题目
 *   - subjectiveNotes：主观题训练记录
 *
 * 与教材内容分开放：教材可重新解析，用户数据不会被覆盖。
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  applySecurityHeaders(res)
  if (!isAuthenticated(req)) return unauthorized(res)

  try {
    if (req.method === 'GET') {
      const text = await readFile('data/userdata.json')
      if (!text) {
        return res.status(200).json({
          learning: { reviews: {}, wrongBook: {}, subjective: {}, updatedAt: '' },
          userData: {
            overlays: {},
            questions: [],
            subjectiveNotes: {},
            subjectiveTopics: [],
            updatedAt: '',
          },
        })
      }
      res.setHeader('Cache-Control', 'private, no-store')
      return res.status(200).send(text)
    }

    if (req.method === 'PUT') {
      const body = req.body as {
        learning?: unknown
        userData?: unknown
      }
      if (!body || (body.learning === undefined && body.userData === undefined)) {
        return res.status(400).json({ error: '请求体为空' })
      }

      // 保留磁盘上已有的其它字段，避免前端只传一半导致覆盖丢失
      const existing = await readFile('data/userdata.json')
      let prev: Record<string, unknown> = {}
      if (existing) {
        try {
          prev = JSON.parse(existing) as Record<string, unknown>
        } catch {
          prev = {}
        }
      }

      const merged = {
        ...prev,
        ...(body.learning !== undefined ? { learning: body.learning } : {}),
        ...(body.userData !== undefined ? { userData: body.userData } : {}),
      }

      await writeFile(
        'data/userdata.json',
        JSON.stringify(merged, null, 1),
        '同步学习进度与用户数据',
      )

      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: '方法不支持' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: message })
  }
}
