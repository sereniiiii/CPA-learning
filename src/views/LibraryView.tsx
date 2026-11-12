import { useEffect, useState } from 'react'
import { Chapter, ChapterMeta, TextbookIndex } from '../types'
import { learningApi } from '../api'

interface Props {
  onOpenPoint: (chapterId: string, pointNum: number) => void
  masteryOf: (pid: string) => number
  isDue: (pid: string) => boolean
}

export function LibraryView({ onOpenPoint, masteryOf, isDue }: Props) {
  const [index, setIndex] = useState<TextbookIndex | null>(null)
  const [openChapter, setOpenChapter] = useState<string | null>(null)
  const [detail, setDetail] = useState<Chapter | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    learningApi
      .getIndex()
      .then(setIndex)
      .catch((e) => setErr(e instanceof Error ? e.message : '内容库加载失败'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!openChapter) {
      setDetail(null)
      return
    }
    setDetail(null)
    learningApi.getChapter(openChapter).then(setDetail).catch(() => {})
  }, [openChapter])

  if (loading) return <div className="view-loading">加载中…</div>
  if (err) return <div className="view-loading is-error">{err}</div>
  if (!index) return null

  const totalPoints = index.chapters.reduce(
    (n, c) => n + c.sections.reduce((m, s) => m + s.points.length, 0),
    0,
  )

  return (
    <div className="library">
      <header className="library-head">
        <div>
          <h1 className="library-title">{index.meta.title}</h1>
          <p className="library-sub">
            {index.chapters.length} 章 · {totalPoints} 考点 · 源自 {index.meta.source}
          </p>
        </div>
        <div className="library-ver">
          <span>版本 {index.meta.version}</span>
          <span>最后更新 {index.meta.generatedAt}</span>
        </div>
      </header>

      <div className="chapter-list">
        {index.chapters.map((ch) => (
          <ChapterBlock
            key={ch.id}
            meta={ch}
            open={openChapter === ch.id}
            detail={openChapter === ch.id ? detail : null}
            onToggle={() => setOpenChapter(openChapter === ch.id ? null : ch.id)}
            onOpenPoint={onOpenPoint}
            masteryOf={masteryOf}
            isDue={isDue}
          />
        ))}
      </div>
    </div>
  )
}

function ChapterBlock({
  meta,
  open,
  detail,
  onToggle,
  onOpenPoint,
  masteryOf,
  isDue,
}: {
  meta: ChapterMeta
  open: boolean
  detail: Chapter | null
  onToggle: () => void
  onOpenPoint: (chapterId: string, pointNum: number) => void
  masteryOf: (pid: string) => number
  isDue: (pid: string) => boolean
}) {
  const pointCount = meta.sections.reduce((n, s) => n + s.points.length, 0)
  const dueCount = meta.sections
    .flatMap((s) => s.points)
    .filter((p) => isDue(`${meta.id}-p${String(p.num).padStart(2, '0')}`)).length

  return (
    <section className={`chapter${open ? ' is-open' : ''}`}>
      <button className="chapter-head" onClick={onToggle}>
        <span className="chapter-num">第 {meta.num} 章</span>
        <span className="chapter-title">{meta.title}</span>
        <span className="chapter-badges">
          {meta.info.difficulty && (
            <span className={`badge badge-diff is-${meta.info.difficulty}`}>{meta.info.difficulty}</span>
          )}
          {meta.info.studyHours != null && (
            <span className="badge">{meta.info.studyHours}h</span>
          )}
          {meta.info.avgScore != null && (
            <span className="badge">均分 {meta.info.avgScore}</span>
          )}
          {dueCount > 0 && <span className="badge badge-due">待复习 {dueCount}</span>}
          <span className="badge">{pointCount} 考点</span>
        </span>
        <span className="chapter-toggle">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="chapter-body">
          {meta.info.guide && <p className="chapter-guide">{meta.info.guide}</p>}

          {meta.info.changes && meta.info.changes.length > 0 && (
            <div className="chapter-changes">
              <h4>教材主要变化</h4>
              <ul>
                {meta.info.changes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          {detail ? (
            <>
              {detail.sections.map((sec) => (
                <div key={sec.num} className="section">
                  <h4 className="section-title">
                    第{sec.num}节 {sec.title}
                  </h4>
                  <div className="point-grid">
                    {sec.points.map((p) => {
                      const pid = `${meta.id}-p${String(p.num).padStart(2, '0')}`
                      const m = masteryOf(pid)
                      return (
                        <button
                          key={p.num}
                          className="point-chip"
                          onClick={() => onOpenPoint(meta.id, p.num)}
                        >
                          <span className="point-idx">{String(p.num).padStart(2, '0')}</span>
                          <span className="point-name">{p.title}</span>
                          {p.difficulty && (
                            <span className={`badge badge-diff is-${p.difficulty}`}>{p.difficulty}</span>
                          )}
                          {p.hot != null && (
                            <span className="badge badge-hot">热点{p.hot}</span>
                          )}
                          {m > 0 && (
                            <span className="point-mastery" style={{ width: `${m}%` }} />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}

              {detail.exercises.length > 0 && (
                <div className="section">
                  <h4 className="section-title">同步习题（章末综合）</h4>
                  <p className="muted">
                    来自 {detail.exercises[0].source.volume} · PDF 第{' '}
                    {detail.exercises[0].source.pdfPage} 页起，共 {detail.exercises.length} 页
                  </p>
                  <p className="muted small">
                    习题原文含大量数值与公式，OCR 文字不可信 —— 请对照原书使用。
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="view-loading is-inline">加载章节详情…</div>
          )}
        </div>
      )}
    </section>
  )
}
