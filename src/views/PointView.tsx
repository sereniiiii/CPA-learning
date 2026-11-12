import { useEffect, useState } from 'react'
import {
  Chapter,
  LearningState,
  Point,
  UserData,
  UserQuestion,
} from '../types'
import { ErrorCause, pointId } from '../types'
import { AnswerResult, applyAnswer, updateWrongBook } from '../learning'
import { learningApi } from '../api'
import { CausePicker } from './ReviewView'
import { OverlayEditor, QuestionEditor } from './EditPanel'
import { ExerciseWorkbench } from './ExerciseWorkbench'
import { AnnotationComposer } from './AnnotationComposer'

interface Props {
  subjectId: string
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
  subjectId,
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
  const [cause, setCause] = useState<ErrorCause | null>(null)
  const [selfRated, setSelfRated] = useState<'none' | 'partial' | 'correct'>('none')
  const [addingQuestion, setAddingQuestion] = useState(false)
  const [annotating, setAnnotating] = useState(false)
  const [err, setErr] = useState('')
  // 知识块索引：文件名 → 类型/来源页/标签
  const [blockIndex, setBlockIndex] = useState<Record<string, BlockMeta>>({})
  const [blocksLoading, setBlocksLoading] = useState(true)
  const [zoomedExample, setZoomedExample] = useState<string | null>(null)

  useEffect(() => {
    setCause(null)
    setSelfRated('none')
    setAddingQuestion(false)
    learningApi
      .getChapter(chapterId, subjectId)
      .then(setChapter)
      .catch((e) => setErr(String(e)))
  }, [chapterId, pointNum, subjectId])

  useEffect(() => {
    setBlocksLoading(true)
    learningApi
      .getBlockIndex(subjectId)
      .then((map) => {
        const out: Record<string, BlockMeta> = {}
        for (const [name, meta] of Object.entries(map)) {
          out[name] = meta
        }
        setBlockIndex(out)
      })
      .catch(() => {})
      .finally(() => setBlocksLoading(false))
  }, [subjectId])

  if (err) return <div className="view-loading is-error">{err}</div>
  if (!chapter) return <div className="view-loading">加载中…</div>

  // 考点 ID 必须带节号（教材每节重新编号）
  const secNum = chapter.sections.find((s) =>
    s.points.some((x) => x.num === pointNum),
  )?.num ?? 0
  const pid = pointId(chapterId, secNum, pointNum)
  let point: Point | null = null
  for (const sec of chapter.sections) {
    const p = sec.points.find((x) => x.num === pointNum)
    if (p) {
      point = p
      break
    }
  }

  // 该考点的例题块（kind=example）
  const exampleBlocks = point
    ? (point.blocks ?? []).filter((b) => blockIndex[b]?.kind === 'example')
    : []

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
          <div style={{ flex: 1 }} />
          <button
            className="material-btn"
            onClick={() => setAnnotating(true)}
            title="给这个考点写批注，会归到对应章节下"
          >
            写批注
          </button>
        </div>
      </header>

      {/* 编辑 / 补充 */}
      <OverlayEditor
        pid={pid}
        overlay={overlay}
        originalTitle={point.title}
        onChange={saveOverlay}
      />

      {/* 写批注 */}
      {annotating && (
        <AnnotationComposer
          subjectId={subjectId}
          chapterId={chapter.id}
          chapterTitle={chapter.title}
          pointId={pid}
          pointTitle={displayTitle}
          source={point.source}
          onSave={(a) => {
            onUserDataChange({
              ...userData,
              annotations: { ...userData.annotations, [a.id]: a },
              updatedAt: new Date().toISOString(),
            })
            setAnnotating(false)
          }}
          onCancel={() => setAnnotating(false)}
        />
      )}

      {/* 教材内容 —— 按知识点切分的原书图，不是整页 */}
      {(point.blocks ?? []).length > 0 && (
        <section className="blocks-section">
          <div className="section-head-row">
            <h2 className="section-title">教材内容（{(point.blocks ?? []).length} 块）</h2>
            <span className="muted small">
              {point.source.volume} · 印刷页 {point.source.printPage}
            </span>
          </div>
          <BlockGallery
            blocks={point.blocks ?? []}
            subjectId={subjectId}
            index={blockIndex}
            loading={blocksLoading}
          />
        </section>
      )}

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

      {/* 教材例题 —— 用切好的例题块（题干+选项+解析），并标出教材答案 */}
      {exampleBlocks.length > 0 && (
        <section className="examples">
          <h2 className="section-title">
            教材例题（{(point.examples ?? []).length}）
          </h2>
          <p className="muted small">
            随讲随练的即时验证，挂在所属考点下 · 答案取自教材页脚的「例题-答案」
          </p>
          <div className="block-grid" style={{ marginTop: 10 }}>
            {exampleBlocks.map((name) => {
              const meta = blockIndex[name]
              const no = meta?.exampleNo
              const ex = (point.examples ?? []).find((e) => e.no === no)
              const ans = ex?.answer
              return (
                <figure key={name} className="block-card">
                  <div className="block-card-head">
                    <span className="block-kind is-example">
                      例题{no ?? ''}
                    </span>
                    {ex?.type && (
                      <span className="muted small">{ex.type}</span>
                    )}
                    <div style={{ flex: 1 }} />
                    <span className="muted small">
                      {meta ? `${meta.volume} · PDF 第${meta.pdfPage}页` : ''}
                    </span>
                  </div>
                  <img
                    src={learningApi.shotUrl(name, subjectId)}
                    alt={meta?.label ?? '教材例题'}
                    loading="lazy"
                    onClick={() => setZoomedExample(name)}
                  />
                  {/* 答案紧贴图片下沿 —— 图片底部就是教材的解析，
                      答案接在解析后面，读起来是一条连贯的流 */}
                  <div className="example-answer-row">
                    {ans ? (
                      <span className="example-answer">
                        答案 <b>{ans}</b>
                      </span>
                    ) : (
                      <span
                        className="example-answer example-answer-none"
                        title="计算分析题的答案见上方原书解析"
                      >
                        答案见上方解析
                      </span>
                    )}
                    {meta?.label && (
                      <span className="example-caption">
                        {meta.label.slice(0, 46)}
                      </span>
                    )}
                  </div>
                </figure>
              )
            })}
          </div>
          {zoomedExample && (
            <div className="lightbox" onClick={() => setZoomedExample(null)}>
              <img src={learningApi.shotUrl(zoomedExample, subjectId)} alt="" />
            </div>
          )}
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

      {/* 同步习题 —— 章末综合，独立成章，不拆进各考点（文档 3.4） */}
      {(chapter.exercises ?? []).length > 0 && (
        <section className="examples">
          <h2 className="section-title">同步习题（{(chapter.exercises ?? []).length} 页）</h2>
          <p className="muted small">
            章末跨考点综合检验 —— 左边看题，右边写解答
          </p>
          <ExerciseWorkbench
            subjectId={subjectId}
            chapterId={chapter.id}
            pages={chapter.exercises ?? []}
            userData={userData}
            onUserDataChange={onUserDataChange}
          />
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

/**
 * 知识块画廊。
 *
 * 每块是原书按知识点/例题/点拨切分后的图，不是整页 —— 整页等于让用户自己翻书。
 */
function BlockGallery({
  blocks,
  subjectId,
  index,
  loading,
}: {
  blocks: string[]
  subjectId: string
  index: Record<string, BlockMeta>
  loading: boolean
}) {
  const [zoomed, setZoomed] = useState<string | null>(null)

  const KIND_LABEL: Record<string, string> = {
    point: '知识点',
    example: '例题',
    label: '点拨 / 辨析',
  }

  return (
    <>
      <div className="block-grid">
        {loading && <div className="muted small">载入中…</div>}
        {blocks.map((name, i) => {
          const meta = index[name]
          const kind = meta?.kind ?? 'point'
          return (
            <figure key={name} className="block-card">
              <div className="block-card-head">
                <span className={`block-kind is-${kind}`}>{KIND_LABEL[kind] ?? kind}</span>
                <span className="muted small">
                  {meta ? `${meta.volume} · PDF 第${meta.pdfPage}页` : ''}
                </span>
                <div style={{ flex: 1 }} />
                <span className="muted small">#{i + 1}</span>
              </div>
              <img
                src={learningApi.shotUrl(name, subjectId)}
                alt={meta?.label ?? '教材知识块'}
                loading="lazy"
                onClick={() => setZoomed(name)}
              />
              {meta?.label && <figcaption>{meta.label.slice(0, 60)}</figcaption>}
            </figure>
          )
        })}
      </div>

      {zoomed && (
        <div className="lightbox" onClick={() => setZoomed(null)}>
          <img src={learningApi.shotUrl(zoomed, subjectId)} alt="" />
        </div>
      )}
    </>
  )
}

interface BlockMeta {
  kind: 'point' | 'example' | 'label'
  volume: string
  pdfPage: number
  label: string
  exampleNo: number | null
}



function findNeighbor(chapter: Chapter, pointNum: number, dir: number): number | null {
  const all = chapter.sections.flatMap((s) => s.points)
  const idx = all.findIndex((p) => p.num === pointNum)
  if (idx === -1) return null
  const next = all[idx + dir]
  return next ? next.num : null
}

/** 册别 + PDF 页码 → 截图文件名 */

