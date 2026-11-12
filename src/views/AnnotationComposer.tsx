import { useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { Annotation } from '../types'
import { RichEditor } from '../editor/Editor'

interface Props {
  subjectId: string
  chapterId: string
  chapterTitle: string
  pointId: string | null
  pointTitle: string
  source: { volume: string; pdfPage: number; printPage: number } | null
  onSave: (a: Annotation) => void
  onCancel: () => void
}

/**
 * 批注撰写。
 *
 * 批注天然带归属（科目 / 章 / 考点），所以写的时候不用选分类 ——
 * 归属由所在位置决定，汇总时按科目 → 章 → 节 → 考点归类。
 */
export function AnnotationComposer({
  subjectId,
  chapterId,
  chapterTitle,
  pointId,
  pointTitle,
  source,
  onSave,
  onCancel,
}: Props) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')

  const build = (): Annotation => ({
    id: `anno-${Date.now().toString(36)}`,
    subjectId,
    chapterId,
    pointId,
    exampleId: null,
    content,
    title: title || pointTitle,
    tags: tags
      .split(/[、,，]/)
      .map((t) => t.trim())
      .filter(Boolean),
    source,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  return (
    <div className="anno-editor">
      <div className="anno-editor-head">
        <h3>写批注</h3>
        <span className="muted small">
          归属：{chapterTitle}
          {pointId ? ` · ${pointTitle}` : ''}
        </span>
      </div>

      <label className="field-label">标题</label>
      <input
        className="overlay-input"
        value={title}
        placeholder={`默认用「${pointTitle}」`}
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
        placeholder="写下你的批注：可以插图、表格、用高亮和颜色标注"
        onSave={() => onSave(build())}
        onChange={(json: JSONContent) => setContent(JSON.stringify(json))}
      />

      <div className="answer-row">
        <button className="answer-btn is-correct" onClick={() => onSave(build())}>
          保存批注
        </button>
        <button className="answer-btn" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  )
}
