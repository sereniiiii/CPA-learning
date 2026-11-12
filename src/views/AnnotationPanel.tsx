import { useMemo, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { Annotation, ChapterMeta, Subject, UserData, parsePointId } from '../types'
import { RichEditor } from '../editor/Editor'

interface Props {
  subjectId: string
  subject: Subject
  chapters: ChapterMeta[]
  userData: UserData
  onUserDataChange: (d: UserData) => void
  /** 跳到指定考点 */
  onOpenPoint: (chapterId: string, pointNum: number) => void
}

/**
 * 批注总览。
 *
 * 按 科目 → 章 → 节 → 考点 归类，**不按时间排序**。
 * 点进任一条批注可以直接跳到对应的考点/章节。
 */
export function AnnotationPanel({
  subjectId,
  subject,
  chapters,
  userData,
  onUserDataChange,
  onOpenPoint,
}: Props) {
  const [editing, setEditing] = useState<Annotation | null>(null)
  const [filterChapter, setFilterChapter] = useState<string | null>(null)

  // 按科目过滤 → 按章 → 节 → 考点分组
  const grouped = useMemo(() => {
    const mine = Object.values(userData.annotations ?? {}).filter(
      (a) => a.subjectId === subjectId,
    )

    const byChapter = new Map<
      string,
      { title: string; num: number; items: Annotation[] }
    >()
    for (const a of mine) {
      const chId = a.chapterId ?? '__chapter__'
      if (!byChapter.has(chId)) {
        const ch = chapters.find((c) => c.id === chId)
        byChapter.set(chId, {
          title: ch?.title ?? '未归章',
          num: ch?.num ?? 0,
          items: [],
        })
      }
      byChapter.get(chId)!.items.push(a)
    }

    // 章按教材顺序排，章内按考点编号排
    const chapterOrder = new Map(chapters.map((c) => [c.id, c.num]))
    return [...byChapter.entries()]
      .sort((a, b) => {
        const na = a[1].num || 999
        const nb = b[1].num || 999
        if (na !== nb) return na - nb
        return (chapterOrder.get(a[0]) ?? 0) - (chapterOrder.get(b[0]) ?? 0)
      })
      .map(([chId, g]) => {
        // 章内按考点分组
        const byPoint = new Map<string, Annotation[]>()
        for (const a of g.items) {
          const key = a.pointId ?? a.exampleId ?? '__chapter__'
          if (!byPoint.has(key)) byPoint.set(key, [])
          byPoint.get(key)!.push(a)
        }
        const points = [...byPoint.entries()].sort((a, b) => {
          const pa = parsePointId(a[0])?.pointNum
          const pb = parsePointId(b[0])?.pointNum
          if (pa && pb) return Number(pa) - Number(pb)
          if (a[0] === '__chapter__') return -1
          if (b[0] === '__chapter__') return 1
          return 0
        })
        return { chapterId: chId, ...g, points }
      })
  }, [userData.annotations, subjectId, chapters])

  const total = Object.values(userData.annotations ?? {}).filter(
    (a) => a.subjectId === subjectId,
  ).length

  const save = (a: Annotation) => {
    onUserDataChange({
      ...userData,
      annotations: { ...userData.annotations, [a.id]: a },
      updatedAt: new Date().toISOString(),
    })
    setEditing(null)
  }

  const remove = (id: string) => {
    const next = { ...userData.annotations }
    delete next[id]
    onUserDataChange({ ...userData, annotations: next, updatedAt: new Date().toISOString() })
    setEditing(null)
  }

  return (
    <div className="canvas">
      <div className="notes-head">
        <div>
          <h1 className="view-title">批注 · {subject.name}</h1>
          <p className="muted" style={{ marginBottom: 0 }}>
            {total > 0
              ? `${total} 条批注，按章 → 节 → 考点归类`
              : '还没有批注 —— 在考点详情页点「写批注」即可添加'}
          </p>
        </div>
      </div>

      {chapters.length > 1 && (
        <div className="chapter-filter">
          <button
            className={`top-btn${filterChapter === null ? ' is-primary' : ''}`}
            onClick={() => setFilterChapter(null)}
          >
            全部
          </button>
          {chapters.map((c) => (
            <button
              key={c.id}
              className={`top-btn${filterChapter === c.id ? ' is-primary' : ''}`}
              onClick={() => setFilterChapter(filterChapter === c.id ? null : c.id)}
            >
              第{c.num}章
            </button>
          ))}
        </div>
      )}

      {total === 0 && (
        <div className="today-empty">
          <p className="today-empty-title">还没有批注</p>
          <p className="muted">
            打开任意考点，点右上角「写批注」，
            批注会自动归到对应章节下。
          </p>
        </div>
      )}

      {grouped
        .filter((g) => filterChapter === null || g.chapterId === filterChapter)
        .map((g) => (
          <div key={g.chapterId} className="anno-chapter">
            <h3 className="anno-chapter-title">
              {g.num > 0 ? `第${g.num}章 ` : ''}
              {g.title}
              <span className="wrong-count">{g.items.length}</span>
            </h3>

            {g.points.map(([pointKey, items]) => (
              <div key={pointKey} className="anno-point">
                {pointKey !== '__chapter__' && (
                  <div className="anno-point-label">
                    {pointLabel(pointKey, chapters, g.chapterId)}
                    {items.some((i) => i.exampleId) && (
                      <span className="muted small"> · 含例题批注</span>
                    )}
                  </div>
                )}
                {items.map((a) => (
                  <div key={a.id} className="anno-card">
                    <div className="anno-card-head">
                      <span className="anno-card-title">{a.title || '未命名批注'}</span>
                      {a.tags.map((t) => (
                        <span key={t} className="badge badge-blue">
                          {t}
                        </span>
                      ))}
                    {(a.marks?.length ?? 0) > 0 && (
                      <span className="badge badge-mark">
                        图上 {a.marks!.length} 处标注
                      </span>
                    )}
                      <div style={{ flex: 1 }} />
                      <button
                        className="tool-btn"
                        onClick={() => setEditing(a)}
                        style={{ color: 'var(--ink-3)' }}
                      >
                        编辑
                      </button>
                      <button
                        className="tool-btn"
                        onClick={() => remove(a.id)}
                        style={{ color: 'var(--danger)' }}
                      >
                        删除
                      </button>
                    </div>
                    <AnnotationBody content={a.content} />
                    <div className="anno-card-foot">
                      {a.source && (
                        <button
                          className="anno-jump"
                          onClick={() => {
                            const parsed = a.pointId ? parsePointId(a.pointId) : null
                            if (parsed) onOpenPoint(parsed.chapterId, parsed.pointNum)
                          }}
                        >
                          {a.source.volume} 印刷页 {a.source.printPage}
                          {a.pointId ? ' · 跳到该考点' : ''}
                        </button>
                      )}
                      <span className="muted small">
                        {a.createdAt.slice(0, 10)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}

      {editing && (
        <AnnotationEditor
          annotation={editing}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  )
}

/** 批注正文 —— 富文本 JSON 渲染成可读 HTML（受限渲染） */
function AnnotationBody({ content }: { content: string }) {
  if (!content) return null
  let doc: JSONContent | null = null
  try {
    doc = JSON.parse(content) as JSONContent
  } catch {
    return <p className="raw-text small">{content}</p>
  }
  return (
    <div className="anno-body">
      {doc?.content?.map((node, i) => (
        <p key={i} className="anno-line">
          {node.content?.map((c, j) => {
            const text = c.text ?? ''
            const marks = (c as { marks?: Array<{ type: string }> }).marks ?? []
            let el: React.ReactNode = text
            for (const m of marks) {
              if (m.type === 'bold') el = <strong>{el}</strong>
              if (m.type === 'italic') el = <em>{el}</em>
              if (m.type === 'highlight') el = <mark>{el}</mark>
            }
            return <span key={j}>{el}</span>
          })}
        </p>
      ))}
    </div>
  )
}

/** 批注编辑 */
function AnnotationEditor({
  annotation,
  onSave,
  onCancel,
}: {
  annotation: Annotation
  onSave: (a: Annotation) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(annotation.title)
  const [content, setContent] = useState(annotation.content)
  const [tags, setTags] = useState(annotation.tags.join('、'))

  return (
    <div className="anno-editor">
      <h3>编辑批注</h3>
      <label className="field-label">标题</label>
      <input
        className="overlay-input"
        value={title}
        placeholder="一句话概括这条批注"
        onChange={(e) => setTitle(e.target.value)}
      />
      <label className="field-label">标签（用、分隔）</label>
      <input
        className="overlay-input"
        value={tags}
        placeholder="如：公式、易错、待背"
        onChange={(e) => setTags(e.target.value)}
      />
      <label className="field-label">正文</label>
      <RichEditor
        compact
        content={content}
        placeholder="写下你的批注…"
        onSave={() =>
          onSave({
            ...annotation,
            title,
            content,
            tags: tags.split(/[、,，]/).map((t) => t.trim()).filter(Boolean),
            updatedAt: new Date().toISOString(),
          })
        }
        onChange={(json) => setContent(JSON.stringify(json))}
      />
      <div className="answer-row">
        <button
          className="answer-btn is-correct"
          onClick={() =>
            onSave({
              ...annotation,
              title,
              content,
              tags: tags.split(/[、,，]/).map((t) => t.trim()).filter(Boolean),
              updatedAt: new Date().toISOString(),
            })
          }
        >
          保存
        </button>
        <button className="answer-btn" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  )
}

/** 从考点 ID 里取出可读标签 */
function pointLabel(pointKey: string, chapters: ChapterMeta[], chapterId: string) {
  const parsed = parsePointId(pointKey)
  if (!parsed) return pointKey
  const ch = chapters.find((c) => c.id === chapterId)
  const sec = ch?.sections.find((s) => s.num === parsed.sectionNum)
  const pt = sec?.points.find((p) => p.num === parsed.pointNum)
  return pt
    ? `第${parsed.sectionNum}节 考点${parsed.pointNum} ${pt.title}`
    : `考点${parsed.pointNum}`
}
