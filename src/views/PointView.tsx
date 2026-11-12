import { useEffect, useState } from 'react'
import { Chapter, Example, LearningState, Point } from '../types'
import { ErrorCause } from '../types'
import { AnswerResult, applyAnswer, updateWrongBook } from '../learning'
import { learningApi } from '../api'
import { CausePicker } from './ReviewView'

interface Props {
  chapterId: string
  pointNum: number
  state: LearningState
  onStateChange: (s: LearningState) => void
  onBack: () => void
  onOpenPoint: (chapterId: string, pointNum: number) => void
}

/**
 * 考点详情 + 自测。
 *
 * 闭环（文档 3.2）：接触材料 → 合上材料自测 → 即时反馈与错因 → 错题归档 → 间隔重测 → 掌握
 * 关键：默认先只看题干，「显示材料」按钮才展开正文 —— 强制「合上材料自测」。
 */
export function PointView({
  chapterId,
  pointNum,
  state,
  onStateChange,
  onBack,
  onOpenPoint,
}: Props) {
  const [chapter, setChapter] = useState<Chapter | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [cause, setCause] = useState<ErrorCause | null>(null)
  const [selfRated, setSelfRated] = useState<'none' | 'partial' | 'correct'>('none')
  const [err, setErr] = useState('')

  useEffect(() => {
    setRevealed(false)
    setCause(null)
    setSelfRated('none')
    learningApi.getChapter(chapterId).then(setChapter).catch((e) => setErr(String(e)))
  }, [chapterId, pointNum])

  if (err) return <div className="view-loading is-error">{err}</div>
  if (!chapter) return <div className="view-loading">加载中…</div>

  const pid = `${chapterId}-p${String(pointNum).padStart(2, '0')}`
  let point: Point | null = null
  for (const sec of chapter.sections) {
    const p = sec.points.find((x) => x.num === pointNum)
    if (p) {
      point = p
      break
    }
  }

  if (!point) {
    return (
      <div className="point-view">
        <button className="back-btn" onClick={onBack}>
          ← 返回
        </button>
        <p className="muted">该考点不存在。</p>
      </div>
    )
  }

  const shotName = shotNameFor(point.source)

  const handleAnswer = (result: AnswerResult) => {
    let next = applyAnswer(state, pid, result)
    next = updateWrongBook(
      next,
      {
        pointId: pid,
        chapterNum: chapter.num,
        chapterTitle: chapter.title,
        pointTitle: point!.title,
        cause,
        selfRating: null,
      },
      result !== 'correct',
    )
    onStateChange(next)
  }

  const handleSelfRate = (rating: 'none' | 'partial' | 'correct') => {
    setSelfRated(rating)
    const next = applyAnswer(state, pid, rating === 'none' ? 'wrong' : rating === 'correct' ? 'correct' : 'partial')
    onStateChange(next)
  }

  return (
    <div className="point-view">
      <button className="back-btn" onClick={onBack}>
        ← 返回
      </button>

      <header className="point-head">
        <div className="point-head-meta">
          <span>第{chapter.num}章 {chapter.title}</span>
          <span className="dot">·</span>
          <span>{point.source.volume} · 印刷页 {point.source.printPage}</span>
        </div>
        <h1 className="point-title">
          考点{String(point.num).padStart(2, '0')} {point.title}
        </h1>
        <div className="point-head-badges">
          {point.difficulty && (
            <span className={`badge badge-diff is-${point.difficulty}`}>难度 {point.difficulty}</span>
          )}
          {point.hot != null && <span className="badge badge-hot">5年热点 {point.hot} 次</span>}
          {point.hot != null && (
            <span className="muted small">高频但不代表必考，可当筛选器不能当排除器</span>
          )}
        </div>
      </header>

      {/* 材料区 —— 默认折叠，强制自测 */}
      <section className="material">
        <div className="material-bar">
          <button className="material-btn" onClick={() => setRevealed((v) => !v)}>
            {revealed ? '收起材料' : '显示材料'}
          </button>
          {!revealed && (
            <span className="muted small">
              先合上材料自测 —— 看懂不等于会做（文档 3.2）
            </span>
          )}
        </div>
        {revealed && (
          <div className="material-body">
            {point.body ? (
              <pre className="raw-text">{point.body}</pre>
            ) : (
              <p className="muted">该考点正文为图片，见下方原书截图。</p>
            )}
            {shotName && (
              <figure className="shot">
                <img src={learningApi.shotUrl(shotName)} alt="原书页面截图" loading="lazy" />
                <figcaption>
                  原书截图（{point.source.volume} 第{point.source.printPage}印刷页 / PDF 第
                  {point.source.pdfPage}页）
                </figcaption>
              </figure>
            )}
          </div>
        )}
      </section>

      {/* 例题区 */}
      {point.examples.length > 0 && (
        <section className="examples">
          <h2 className="section-title">教材例题（{point.examples.length}）</h2>
          <p className="muted small">
            随讲随练的即时验证，挂在所属考点下
          </p>
          {point.examples.map((ex) => (
            <ExampleCard key={ex.no} example={ex} />
          ))}
        </section>
      )}

      {/* 自测区 */}
      <section className="selftest">
        <h2 className="section-title">自测</h2>
        <p className="muted small">
          合上材料，凭记忆作答。答对 → 进入间隔重测；答错 → 归档到错题本并选错因。
        </p>
        <div className="answer-row">
          <button className="answer-btn is-correct" onClick={() => handleAnswer('correct')}>
            会了
          </button>
          <button
            className="answer-btn is-partial"
            onClick={() => handleAnswer('partial')}
          >
            半懂
          </button>
          <button className="answer-btn is-wrong" onClick={() => handleAnswer('wrong')}>
            不会
          </button>
        </div>
        <CausePicker value={cause} onChange={setCause} />
      </section>

      {/* 主观题自评 */}
      <section className="selftest">
        <h2 className="section-title">主观题自评</h2>
        <p className="muted small">
          主观题无法自动判分，走三档自评：完整正确 / 写出部分步骤 / 完全没思路。
          「先写再对」这个环节本身是有效的 —— 直接看答案等于没练。
        </p>
        <div className="answer-row">
          <button
            className="answer-btn is-correct"
            onClick={() => handleSelfRate('correct')}
          >
            完整正确
          </button>
          <button
            className="answer-btn is-partial"
            onClick={() => handleSelfRate('partial')}
          >
            写出部分步骤
          </button>
          <button className="answer-btn is-wrong" onClick={() => handleSelfRate('none')}>
            完全没思路
          </button>
        </div>
        {selfRated !== 'none' && <p className="muted small">已记录：{selfRated}</p>}
      </section>

      {/* 相邻考点 */}
      <nav className="point-nav">
        <button
          className="nav-btn"
          onClick={() => {
            const prev = findNeighbor(chapter, pointNum, -1)
            if (prev) onOpenPoint(chapterId, prev)
          }}
        >
          ← 上一个考点
        </button>
        <button
          className="nav-btn"
          onClick={() => {
            const next = findNeighbor(chapter, pointNum, 1)
            if (next) onOpenPoint(chapterId, next)
          }}
        >
          下一个考点 →
        </button>
      </nav>
    </div>
  )
}

function ExampleCard({ example }: { example: Example }) {
  const [open, setOpen] = useState(false)
  const shot = shotNameFor(example.source)

  return (
    <article className="example">
      <div className="example-head">
        <span className="example-no">【例题{example.no}·{example.type}】</span>
        <span className="muted small">
          {example.source.volume} 印刷页 {example.source.printPage}
        </span>
        {example.status === '待核' && <span className="badge badge-todo">待核</span>}
      </div>
      <p className="example-text">{example.text || '（题干为图片，见下方截图）'}</p>
      {shot && (
        <figure className="shot">
          <img src={learningApi.shotUrl(shot)} alt="原书页面截图" loading="lazy" />
        </figure>
      )}
      <button className="material-btn" onClick={() => setOpen((v) => !v)}>
        {open ? '收起解析' : '显示解析'}
      </button>
      {open && (
        <pre className="raw-text small">
          解析见原书截图（该题含公式与数值，OCR 文字不可信，请对照原书）
        </pre>
      )}
    </article>
  )
}

function findNeighbor(chapter: Chapter, pointNum: number, dir: number): number | null {
  const all = chapter.sections.flatMap((s) => s.points)
  const idx = all.findIndex((p) => p.num === pointNum)
  if (idx === -1) return null
  const next = all[idx + dir]
  return next ? next.num : null
}

/** 册别 + PDF 页码 → 截图文件名 */
function shotNameFor(source: { volume: string; pdfPage: number }): string {
  const vol = { 上册: 'up', 中册: 'mid', 下册: 'down' }[source.volume] ?? 'up'
  return `${vol}-${String(source.pdfPage).padStart(4, '0')}.jpg`
}
