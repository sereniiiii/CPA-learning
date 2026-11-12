import { useEffect, useState } from 'react'
import {
  Chapter,
  Example,
  LearningState,
  Point,
  UserData,
  UserQuestion,
} from '../types'
import { ErrorCause } from '../types'
import { AnswerResult, applyAnswer, updateWrongBook } from '../learning'
import { learningApi } from '../api'
import { CausePicker } from './ReviewView'
import { OverlayEditor, QuestionEditor } from './EditPanel'

interface Props {
  chapterId: string
  pointNum: number
  state: LearningState
  userData: UserData
  onStateChange: (s: LearningState) => void
  onUserDataChange: (d: UserData) => void
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
  userData,
  onStateChange,
  onUserDataChange,
  onBack,
  onOpenPoint,
}: Props) {
  const [chapter, setChapter] = useState<Chapter | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [cause, setCause] = useState<ErrorCause | null>(null)
  const [selfRated, setSelfRated] = useState<'none' | 'partial' | 'correct'>('none')
  const [addingQuestion, setAddingQuestion] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    setRevealed(false)
    setCause(null)
    setSelfRated('none')
    setAddingQuestion(false)
    learningApi
      .getChapter(chapterId)
      .then(setChapter)
      .catch((e) => setErr(String(e)))
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

  const overlay = userData.overlays[pid]
  // 覆盖层生效：显示用户改写后的标题与正文
  const displayTitle = overlay?.title ?? point.title
  const displayBody = overlay?.body ?? point.body
  const myQuestions = userData.questions.filter((q) => q.pointId === pid)

  const handleAnswer = (result: AnswerResult) => {
    let next = applyAnswer(state, pid, result)
    next = updateWrongBook(
      next,
      {
        pointId: pid,
        chapterNum: chapter.num,
        chapterTitle: chapter.title,
        pointTitle: displayTitle,
        cause,
        selfRating: null,
      },
      result !== 'correct',
    )
    onStateChange(next)
  }

  const handleSelfRate = (rating: 'none' | 'partial' | 'correct') => {
    setSelfRated(rating)
    const next = applyAnswer(
      state,
      pid,
      rating === 'none' ? 'wrong' : rating === 'correct' ? 'correct' : 'partial',
    )
    onStateChange(next)
  }

  const saveOverlay = (o: import('../types').UserOverlay) => {
    onUserDataChange({
      ...userData,
      overlays: { ...userData.overlays, [pid]: o },
      updatedAt: new Date().toISOString(),
    })
  }

  const saveQuestion = (q: UserQuestion) => {
    const filled: UserQuestion = {
      ...q,
      pointId: pid,
      chapterId,
      chapterNum: chapter.num,
    }
    const exists = userData.questions.some((x) => x.id === filled.id)
    onUserDataChange({
      ...userData,
      questions: exists
        ? userData.questions.map((x) => (x.id === filled.id ? filled : x))
        : [...userData.questions, filled],
      updatedAt: new Date().toISOString(),
    })
    setAddingQuestion(false)
  }

  return (
    <div className="point-view">
      <button className="back-btn" onClick={onBack}>
        ← 返回
      </button>

      <header className="point-head">
        <div className="point-head-meta">
          <span>
            第{chapter.num}章 {chapter.title}
          </span>
          <span className="dot">·</span>
          <span>
            {point.source.volume} · 印刷页 {point.source.printPage}
          </span>
        </div>
        <h1 className="point-title">
          考点{String(point.num).padStart(2, '0')} {displayTitle}
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

      {/* 编辑 / 补充 */}
      <OverlayEditor
        pid={pid}
        overlay={overlay}
        originalTitle={point.title}
        originalBody={point.body}
        onChange={saveOverlay}
      />

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
          <button
            className="material-btn is-link"
            onClick={() => setRevealed(true)}
            title="加载原书页截图，用于核对公式与数值"
          >
            看原书
          </button>
        </div>
        {revealed && (
          <div className="material-body">
            {displayBody ? (
              <pre className="raw-text">{displayBody}</pre>
            ) : (
              <p className="muted">该考点正文为图片，见下方原书截图。</p>
            )}
            <OriginalPageShot source={point.source} />
          </div>
        )}
      </section>

      {/* 我的补充笔记 */}
      {(overlay?.notes || overlay?.answer || overlay?.blocker) && (
        <section className="my-notes">
          <h2 className="section-title">我的补充</h2>
          {overlay.answer && (
            <p className="my-note-line">
              <span className="my-note-key">答案</span>
              {overlay.answer}
            </p>
          )}
          {overlay.blocker && (
            <p className="my-note-line">
              <span className="my-note-key">卡点</span>
              {overlay.blocker}
            </p>
          )}
          {overlay.notes && <pre className="raw-text small">{overlay.notes}</pre>}
        </section>
      )}

      {/* 教材例题 */}
      {point.examples.length > 0 && (
        <section className="examples">
          <h2 className="section-title">教材例题（{point.examples.length}）</h2>
          <p className="muted small">随讲随练的即时验证，挂在所属考点下</p>
          {point.examples.map((ex) => (
            <ExampleCard key={ex.no} example={ex} />
          ))}
        </section>
      )}

      {/* 自加题目 */}
      <section className="examples">
        <div className="section-head-row">
          <h2 className="section-title">我加的题（{myQuestions.length}）</h2>
          <button
            className="material-btn"
            onClick={() => setAddingQuestion((v) => !v)}
          >
            {addingQuestion ? '取消' : '+ 加一道'}
          </button>
        </div>
        {addingQuestion && (
          <QuestionEditor
            question={null}
            onSave={saveQuestion}
            onCancel={() => setAddingQuestion(false)}
          />
        )}
        {myQuestions.map((q) => (
          <article key={q.id} className="example">
            <div className="example-head">
              <span className="example-no">{q.type}</span>
              <span className="muted small">自录 · {q.createdAt.slice(0, 10)}</span>
            </div>
            <p className="example-text">{q.stem}</p>
            {q.options.some((o) => o) && (
              <ol className="q-options" type="A">
                {q.options.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ol>
            )}
            {q.answer && (
              <p className="my-note-line">
                <span className="my-note-key">答案</span>
                {q.answer}
              </p>
            )}
            {q.analysis && <pre className="raw-text small">{q.analysis}</pre>}
            <button
              className="tool-btn"
              onClick={() =>
                onUserDataChange({
                  ...userData,
                  questions: userData.questions.filter((x) => x.id !== q.id),
                  updatedAt: new Date().toISOString(),
                })
              }
            >
              删除
            </button>
          </article>
        ))}
      </section>

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
          <button className="answer-btn is-partial" onClick={() => handleAnswer('partial')}>
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
          <button className="answer-btn is-correct" onClick={() => handleSelfRate('correct')}>
            完整正确
          </button>
          <button className="answer-btn is-partial" onClick={() => handleSelfRate('partial')}>
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

/** 原书页截图 —— 点击才加载，避免一次性拉几百张 */
function OriginalPageShot({ source }: { source: { volume: string; pdfPage: number; printPage: number } }) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const name = shotNameFor(source)

  if (!loaded) {
    return (
      <button className="shot-load-btn" onClick={() => setLoaded(true)}>
        加载原书页截图（{source.volume} 印刷页 {source.printPage}）
      </button>
    )
  }
  if (failed) {
    return <p className="muted small">该页截图暂不可用（可能是未收录页）。</p>
  }
  return (
    <figure className="shot">
      <img
        src={learningApi.shotUrl(name)}
        alt="原书页面截图"
        loading="lazy"
        onError={() => setFailed(true)}
      />
      <figcaption>
        原书截图（{source.volume} 印刷页 {source.printPage} / PDF 第{source.pdfPage}页）
      </figcaption>
    </figure>
  )
}

function ExampleCard({ example }: { example: Example }) {
  const [open, setOpen] = useState(false)
  const [shotFailed, setShotFailed] = useState(false)
  const name = shotNameFor(example.source)

  return (
    <article className="example">
      <div className="example-head">
        <span className="example-no">
          【例题{example.no}·{example.type}】
        </span>
        <span className="muted small">
          {example.source.volume} 印刷页 {example.source.printPage}
        </span>
        {example.status === '待核' && <span className="badge badge-todo">待核</span>}
      </div>
      <p className="example-text">{example.text || '（题干为图片，见下方原书截图）'}</p>

      <div className="example-actions">
        <button className="material-btn" onClick={() => setOpen((v) => !v)}>
          {open ? '收起' : '看原书页'}
        </button>
      </div>

      {open && !shotFailed && (
        <figure className="shot">
          <img
            src={learningApi.shotUrl(name)}
            alt="原书页面截图"
            loading="lazy"
            onError={() => setShotFailed(true)}
          />
          <figcaption>原书截图（含完整题干、选项与解析）</figcaption>
        </figure>
      )}
      {open && shotFailed && (
        <p className="muted small">该页截图暂不可用（可能是未收录页）。</p>
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
