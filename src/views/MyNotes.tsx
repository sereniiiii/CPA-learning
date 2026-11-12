import { useEffect, useState } from 'react'
import { PageMeta } from '../types'
import { RichEditor } from '../editor/Editor'
import { getPage } from '../api'
import type { JSONContent } from '@tiptap/core'

/**
 * 从 Tiptap JSON 里抽纯文本，用作卡片摘要。
 *
 * 递归收集所有 text 节点，用空格拼接（段落之间换行更好读）。
 */
function extractText(json: string, limit = 90): string {
  if (!json) return ''
  let doc: unknown
  try {
    doc = JSON.parse(json)
  } catch {
    return ''
  }
  const parts: string[] = []

  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const n = node as { text?: string; content?: unknown[] }
    if (typeof n.text === 'string') {
      parts.push(n.text)
      return
    }
    if (Array.isArray(n.content)) {
      n.content.forEach(walk)
      parts.push(' ')
    }
  }
  walk(doc)

  const text = parts.join('').replace(/\s+/g, ' ').trim()
  return text.length > limit ? text.slice(0, limit) + '…' : text
}

interface Props {
  notes: PageMeta[]
  active: PageMeta | null
  title: string
  content: string
  dirty: boolean
  onOpen: (p: PageMeta) => void
  onCreate: () => void
  onRemove: (id: string) => void
  onTitleChange: (v: string) => void
  onContentChange: (v: string) => void
  onBack: () => void
}

/**
 * 我的笔记：可自由编辑的学习页（富文本、图片、表格）。
 * 与教材内容库分开 —— 教材是只读参考，这里是自己的产出。
 */
export function MyNotes({
  notes,
  active,
  title,
  content,
  onOpen,
  onCreate,
  onRemove,
  onTitleChange,
  onContentChange,
  onBack,
}: Props) {
  // 摘要：懒加载 + 页面内缓存（不改存储格式，避免动服务端写入逻辑）
  const [excerpts, setExcerpts] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    const need = notes.filter((n) => !(n.id in excerpts))
    if (need.length === 0) return
    void Promise.all(
      need.map(async (n) => {
        try {
          const p = await getPage(n.id)
          return [n.id, extractText(p.content)] as const
        } catch {
          return [n.id, ''] as const
        }
      }),
    ).then((pairs) => {
      if (cancelled) return
      setExcerpts((prev) => {
        const next = { ...prev }
        for (const [id, text] of pairs) next[id] = text
        return next
      })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes])

  if (!active) {
    return (
      <div className="notes">
        <header className="notes-head">
          <h1 className="page-title">我的笔记</h1>
          <button className="start-btn" onClick={onCreate}>
            新建笔记
          </button>
        </header>
        <p className="muted">
          {notes.length > 0
            ? '选一篇继续编辑，或新建一篇'
            : '还没有笔记。新建一篇，开始记录你自己的理解。'}
        </p>
        <div className="note-list">
          {notes.map((n) => (
            <div key={n.id} className="note-card">
              <button className="note-card-main" onClick={() => onOpen(n)}>
                <span className="note-card-title">{n.title}</span>
                <span className="note-card-excerpt">
                  {excerpts[n.id] ?? '（空白笔记）'}
                </span>
                <span className="note-card-foot">
                  <span className="note-card-time">
                    {n.updatedAt.slice(0, 10)}
                  </span>
                  {n.createdAt.slice(0, 10) !== n.updatedAt.slice(0, 10) && (
                    <span className="muted small">创建于 {n.createdAt.slice(0, 10)}</span>
                  )}
                </span>
              </button>
              <button
                className="page-del"
                onClick={() => onRemove(n.id)}
                title="删除"
                aria-label="删除笔记"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="notes is-editing">
      <div className="notes-toolbar">
        <button className="back-btn" onClick={onBack}>
          ← 全部笔记
        </button>
        <button
          className="tool-btn is-danger"
          onClick={() => onRemove(active.id)}
        >
          删除
        </button>
      </div>

      <input
        className="title-input"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="无标题"
      />

      <RichEditor
        content={content}
        onChange={(json: JSONContent) => onContentChange(JSON.stringify(json))}
        onSave={() => window.dispatchEvent(new CustomEvent('notes-save'))}
      />
    </div>
  )
}
