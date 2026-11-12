import { useRef, useState } from 'react'
import type { ImageMark } from '../types'

type DrawMark = Extract<ImageMark, { kind: 'stroke' | 'box' }>

const COLORS = ['#e5484d', '#2f5fd0', '#0b7a4b', '#f5a524', '#6b3ba8']
const NOTE_COLORS = ['#ffe58a', '#b8f2c6', '#bfe0ff', '#ffc9d9']

type Tool = 'stroke' | 'box' | 'note'

/**
 * 图片标注层。
 *
 * 图片是服务端渲染的静态图，标注以**百分比坐标**叠加在上面的 SVG 层，
 * 所以缩放、换设备、换窗口宽度，标注位置都不会跑。
 *
 * 三种标注：
 *   画笔  自由线条（红色为主，模拟红笔批改）
 *   框选  矩形（圈出重点）
 *   便签  一段文字
 */
export function ImageAnnotator({
  imageUrl,
  alt,
  marks,
  onChange,
  readOnly = false,
}: {
  imageUrl: string
  alt: string
  marks: ImageMark[]
  onChange: (marks: ImageMark[]) => void
  readOnly?: boolean
}) {
  const [tool, setTool] = useState<Tool>('stroke')
  const [color, setColor] = useState(COLORS[0])
  const [noteText, setNoteText] = useState('')
  const [draft, setDraft] = useState<DrawMark | null>(null)

  const wrapRef = useRef<HTMLDivElement>(null)
  const drawing = useRef(false)
  const startPt = useRef<{ x: number; y: number } | null>(null)

  /** 指针位置 → 百分比坐标 */
  const toPct = (e: React.PointerEvent) => {
    const rect = wrapRef.current!.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (readOnly) return
    if (tool === 'note') return
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    const p = toPct(e)
    startPt.current = p
    if (tool === 'stroke') {
      setDraft({ kind: 'stroke', points: [p], color, width: 1.6 })
    } else {
      setDraft({ kind: 'box', x: p.x, y: p.y, w: 0, h: 0, color })
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing.current || !draft) return
    const p = toPct(e)
    if (draft.kind === 'stroke') {
      setDraft({ ...draft, points: [...draft.points, p] })
    } else {
      const s = startPt.current!
      setDraft({
        ...draft,
        x: Math.min(s.x, p.x),
        y: Math.min(s.y, p.y),
        w: Math.abs(p.x - s.x),
        h: Math.abs(p.y - s.y),
      })
    }
  }

  const onPointerUp = () => {
    if (!drawing.current) return
    drawing.current = false
    startPt.current = null
    if (draft) {
      const empty =
        (draft.kind === 'stroke' && draft.points.length < 2) ||
        (draft.kind === 'box' && (draft.w < 0.6 || draft.h < 0.6))
      if (!empty) onChange([...marks, draft])
    }
    setDraft(null)
  }

  const addNote = (e: React.PointerEvent) => {
    if (readOnly || !noteText.trim()) return
    const p = toPct(e)
    onChange([
      ...marks,
      {
        kind: 'note',
        x: Math.min(88, p.x),
        y: Math.min(92, p.y),
        text: noteText.trim(),
        color: NOTE_COLORS[0],
      },
    ])
    setNoteText('')
  }

  const removeAt = (idx: number) => {
    onChange(marks.filter((_, i) => i !== idx))
  }

  const all = draft ? [...marks, draft] : marks

  return (
    <div className="annot">
      {!readOnly && (
        <div className="annot-bar">
          <div className="annot-tools">
            <button
              className={`annot-tool${tool === 'stroke' ? ' is-on' : ''}`}
              onClick={() => setTool('stroke')}
            >
              画笔
            </button>
            <button
              className={`annot-tool${tool === 'box' ? ' is-on' : ''}`}
              onClick={() => setTool('box')}
            >
              框选
            </button>
            <button
              className={`annot-tool${tool === 'note' ? ' is-on' : ''}`}
              onClick={() => setTool('note')}
            >
              便签
            </button>
          </div>

          {tool !== 'note' && (
            <div className="annot-colors">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={`annot-color${color === c ? ' is-on' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  aria-label={`颜色 ${c}`}
                />
              ))}
            </div>
          )}

          {tool === 'note' && (
            <input
              className="annot-note-input"
              value={noteText}
              placeholder="便签内容，点图上放置"
              onChange={(e) => setNoteText(e.target.value)}
            />
          )}

          <div style={{ flex: 1 }} />
          {marks.length > 0 && (
            <button
              className="tool-btn"
              style={{ color: 'var(--red)' }}
              onClick={() => onChange([])}
            >
              清空标注
            </button>
          )}
        </div>
      )}

      <div
        className={`annot-wrap${tool === 'stroke' || tool === 'box' ? ' is-drawable' : ''}${
          tool === 'note' ? ' is-note' : ''
        }`}
        ref={wrapRef}
        onPointerDown={tool === 'note' ? addNote : onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img src={imageUrl} alt={alt} loading="lazy" draggable={false} />

        {/* 标注层 */}
        <svg className="annot-layer" viewBox="0 0 100 100" preserveAspectRatio="none">
          {all.map((m, i) => {
            if (m.kind === 'stroke') {
              return (
                <polyline
                  key={i}
                  points={m.points.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={m.color}
                  strokeWidth={m.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              )
            }
            if (m.kind === 'box') {
              return (
                <rect
                  key={i}
                  x={m.x}
                  y={m.y}
                  width={m.w}
                  height={m.h}
                  fill="none"
                  stroke={m.color}
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              )
            }
            return null
          })}
        </svg>

        {/* 便签（HTML 层，便于放文字） */}
        {all.map((m, i) =>
          m.kind === 'note' ? (
            <div
              key={i}
              className="annot-note"
              style={{
                left: `${m.x}%`,
                top: `${m.y}%`,
                background: m.color,
              }}
              onDoubleClick={() => removeAt(i)}
              title="双击删除"
            >
              {m.text}
            </div>
          ) : null,
        )}

        {marks.length > 0 && !readOnly && (
          <span className="annot-count">{marks.length} 处标注</span>
        )}
      </div>
    </div>
  )
}
