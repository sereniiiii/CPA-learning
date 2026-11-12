import { useMemo, useState } from 'react'
import { ChapterMeta, SubjectLibrary, pointId } from '../types'

/**
 * 教材库视图：左侧目录树 + 右侧章节卡片。
 * 目录树照抄教材结构（章 → 节 → 考点），不另造分类。
 */
export function LibraryView({
  index,
  subjectId: _subjectId,
  treeOpen = false,
  onTreeClose,
  activePoint,
  onOpenPoint,
  onOpenChapter,
  openChapter,
  masteryOf,
  isDue,
  isWrong,
}: {
  index: SubjectLibrary | null
  subjectId: string
  /** 窄屏下目录抽屉是否展开 */
  treeOpen?: boolean
  onTreeClose?: () => void
  activePoint: { chapterId: string; pointNum: number } | null
  onOpenPoint: (chapterId: string, pointNum: number) => void
  onOpenChapter: (chapterId: string) => void
  openChapter: string | null
  masteryOf: (pid: string) => number
  isDue: (pid: string) => boolean
  isWrong: (pid: string) => boolean
}) {
  const [query, setQuery] = useState('')

  if (!index) {
    return <div className="view-loading">内容库加载中…</div>
  }

  // 搜索：章名 / 节名 / 考点名 命中即保留（连同其父级）
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return index.chapters
    const out: ChapterMeta[] = []
    for (const ch of index.chapters) {
      const chHit = ch.title.toLowerCase().includes(q)
      const sections = ch.sections
        .map((sec) => {
          const secHit = sec.title.toLowerCase().includes(q)
          const points = sec.points.filter(
            (p) =>
              secHit ||
              chHit ||
              p.title.toLowerCase().includes(q) ||
              `考点${p.num}`.includes(q),
          )
          return points.length ? { ...sec, points } : null
        })
        .filter(Boolean) as ChapterMeta['sections']
      if (chHit || sections.length) out.push({ ...ch, sections })
    }
    return out
  }, [index, query])

  const hitCount = useMemo(
    () =>
      filtered.reduce(
        (n, ch) => n + ch.sections.reduce((m, s) => m + s.points.length, 0),
        0,
      ),
    [filtered],
  )

  return (
    <>
      <div className={`tree${treeOpen ? ' is-open' : ''}`}>
        <div className="tree-head">
          <button
            className="mobile-only tree-close-btn"
            onClick={() => onTreeClose?.()}
            aria-label="关闭目录"
          >
            ×
          </button>
          <p className="tree-title">教材目录</p>
          <p className="tree-sub">{index.chapters.length} 章 · 20 个部分</p>
          <input
            className="tree-search"
            value={query}
            placeholder="搜索考点、章节…"
            onChange={(e) => setQuery(e.target.value)}
          />
          {query.trim() && (
            <p className="tree-sub">
              命中 {hitCount} 个考点
              <button className="tree-clear" onClick={() => setQuery('')}>
                清除
              </button>
            </p>
          )}
        </div>
        <div className="tree-list">
          {filtered.map((ch) => (
            <ChapterTree
              key={ch.id}
              meta={ch}
              expanded={openChapter === ch.id || query.trim() !== ''}
              activePoint={activePoint}
              onToggle={() => onOpenChapter(ch.id)}
              onOpenPoint={onOpenPoint}
              masteryOf={masteryOf}
              isDue={isDue}
              isWrong={isWrong}
            />
          ))}
          {filtered.length === 0 && (
            <p className="muted small" style={{ padding: '16px 14px' }}>
              没有匹配的考点
            </p>
          )}
        </div>
      </div>

      <div className="canvas">
        <div className="library-head">
          <div>
            <h1 className="library-title">{index.meta.title}</h1>
            <p className="library-sub">
              源自 {index.meta.source}
              <br />
              内容以原书截图呈现 —— OCR 文字层不可信，涉及公式与数值的部分一律对照原书
            </p>
          </div>
          <div className="library-ver">
            <span>版本 {index.meta.version}</span>
            <span>更新 {index.meta.generatedAt}</span>
          </div>
        </div>

        <div className="chapter-list">
          {index.chapters.map((ch) => (
            <ChapterCard
              key={ch.id}
              meta={ch}
              open={openChapter === ch.id}
              onToggle={() => onOpenChapter(ch.id)}
              onOpenPoint={onOpenPoint}
              masteryOf={masteryOf}
              isDue={isDue}
              isWrong={isWrong}
            />
          ))}
        </div>
      </div>
    </>
  )
}

function ChapterTree({
  meta,
  expanded,
  activePoint,
  onToggle,
  onOpenPoint,
  masteryOf,
  isDue,
  isWrong,
}: {
  meta: ChapterMeta
  expanded: boolean
  activePoint: { chapterId: string; pointNum: number } | null
  onToggle: () => void
  onOpenPoint: (chapterId: string, pointNum: number) => void
  masteryOf: (pid: string) => number
  isDue: (pid: string) => boolean
  isWrong: (pid: string) => boolean
}) {
  return (
    <div>
      <button
        className={`tree-chapter${expanded ? ' is-active' : ''}`}
        onClick={onToggle}
      >
        <span className="num">{meta.num}</span>
        <span style={{ flex: 1, minWidth: 0 }}>{meta.title}</span>
        {meta.info.difficulty && (
          <span className={`mini-badge m-${meta.info.difficulty}`}>
            {meta.info.difficulty}
          </span>
        )}
      </button>

      {expanded && (
        <div className="tree-points">
          {meta.sections.map((sec) => (
            <div key={sec.num}>
              <div className="tree-section">
                第{sec.num}节 {sec.title}
              </div>
              {sec.points.map((p) => {
                const pid = pointId(meta.id, sec.num, p.num)
                const active =
                  activePoint?.chapterId === meta.id && activePoint.pointNum === p.num
                const m = masteryOf(pid)
                return (
                  <button
                    key={p.num}
                    className={`tree-point${active ? ' is-active' : ''}`}
                    onClick={() => onOpenPoint(meta.id, p.num)}
                    title={p.title}
                  >
                    <span className="point-idx">{String(p.num).padStart(2, '0')}</span>
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.title}
                    </span>
                    {isWrong(pid) && <span className="mini-badge m-wrong">错</span>}
                    {!isWrong(pid) && isDue(pid) && (
                      <span className="mini-badge m-due">复习</span>
                    )}
                    {p.hot != null && <span className="mini-badge m-hot">热{p.hot}</span>}
                    {m >= 60 && <span className="mini-badge m-易">✓</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ChapterCard({
  meta,
  open,
  onToggle,
  onOpenPoint,
  masteryOf,
  isDue,
  isWrong,
}: {
  meta: ChapterMeta
  open: boolean
  onToggle: () => void
  onOpenPoint: (chapterId: string, pointNum: number) => void
  masteryOf: (pid: string) => number
  isDue: (pid: string) => boolean
  isWrong: (pid: string) => boolean
}) {
  const pointCount = useMemo(
    () => meta.sections.reduce((n, s) => n + s.points.length, 0),
    [meta],
  )
  const dueCount = useMemo(
    () =>
      meta.sections
        .flatMap((s) => s.points)
        .filter((p) => isDue(`${meta.id}-p${String(p.num).padStart(2, '0')}`)).length,
    [meta, isDue],
  )
  const wrongCount = useMemo(
    () =>
      meta.sections
        .flatMap((s) => s.points)
        .filter((p) => isWrong(`${meta.id}-p${String(p.num).padStart(2, '0')}`)).length,
    [meta, isWrong],
  )

  return (
    <section className={`chapter${open ? ' is-open' : ''}`}>
      <button className="chapter-head" onClick={onToggle}>
        <span className="chapter-num">第 {meta.num} 章</span>
        <span className="chapter-title">{meta.title}</span>
        <span className="chapter-badges">
          {wrongCount > 0 && <span className="badge badge-overdue">错 {wrongCount}</span>}
          {dueCount > 0 && <span className="badge badge-due">待复习 {dueCount}</span>}
          <span className="badge">{pointCount} 考点</span>
        </span>
        <span className="chapter-toggle">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="chapter-body">
          {meta.info.guide && <p className="chapter-guide">{meta.info.guide}</p>}

          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
            {meta.info.difficulty && (
              <span className={`badge badge-diff is-${meta.info.difficulty}`}>
                难度 {meta.info.difficulty}
              </span>
            )}
            {meta.info.studyHours != null && (
              <span className="badge badge-blue">建议 {meta.info.studyHours}h</span>
            )}
            {meta.info.examTypes && (
              <span className="badge">题型 {meta.info.examTypes}</span>
            )}
            {meta.info.avgScore != null && (
              <span className="badge">近5年均分 {meta.info.avgScore}</span>
            )}
          </div>

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

          {meta.sections.map((sec) => (
            <div key={sec.num} className="section">
              <h4 className="section-title">
                第{sec.num}节 {sec.title}
              </h4>
              <div className="point-grid" style={{ marginTop: 7 }}>
                {sec.points.map((p) => {
                  const pid = pointId(meta.id, sec.num, p.num)
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
                        <span className={`badge badge-diff is-${p.difficulty}`}>
                          {p.difficulty}
                        </span>
                      )}
                      {p.hot != null && (
                        <span className="badge badge-hot">热{p.hot}</span>
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
        </div>
      )}
    </section>
  )
}
