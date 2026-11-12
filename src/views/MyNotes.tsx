import { PageMeta } from '../types'
import { RichEditor } from '../editor/Editor'
import type { JSONContent } from '@tiptap/core'

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
                <span className="note-card-time">{n.updatedAt.slice(0, 10)}</span>
              </button>
              <button className="page-del" onClick={() => onRemove(n.id)} title="删除">
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
