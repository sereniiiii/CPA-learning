import { useEffect, useState } from 'react'
import { learningApi } from '../api'
import { UserData } from '../types'
import { RichEditor } from '../editor/Editor'

interface Topic {
  id: string
  num: number
  title: string
  source: { volume: string; pdfPage: number; printPage: number }
  pageCount: number
}

interface TopicDetail {
  id: string
  num: number
  title: string
  source: { volume: string; pdfPage: number; printPage: number }
  pages: Array<{ pdfPage: number; text: string }>
}

/**
 * 主观题集训区。
 *
 * 文档 3.5：主观题占 50 分，是与客观题等重的分值，必须是一条独立通道。
 * 教材为此专设「第三部分 主观题集训」17 个专题。
 *
 * 学习方式与客观题不同（文档 3.5）：
 * 主观题必须手写训练过程 —— 网页提供「题目 + 参考答案 + 自评」三件套，
 * 「先写再对」这个自评环节本身是有效的，直接看答案等于没练。
 */
export function SubjectiveView({
  subjectId,
  userData,
  onUserDataChange,
}: {
  subjectId: string
  userData: UserData
  onUserDataChange: (d: UserData) => void
}) {
  const [topics, setTopics] = useState<Topic[]>([])
  const [openTopic, setOpenTopic] = useState<string | null>(null)
  const [detail, setDetail] = useState<TopicDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    learningApi
      .getSubjectiveIndex(subjectId)
      .then((d) => setTopics(d.topics))
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false))
  }, [subjectId])

  useEffect(() => {
    if (!openTopic) {
      setDetail(null)
      return
    }
    learningApi.getSubjectiveTopic(openTopic, subjectId).then(setDetail).catch(() => {})
  }, [openTopic, subjectId])

  const saveNote = (topic: Topic, content: string, rating: 'none' | 'partial' | 'correct') => {
    const prev = userData.subjectiveNotes[scopedTopicId(subjectId, topic.id)]
    const now = new Date().toISOString()
    // 每次改档位记一条轨迹 —— 主观题只能自评，
    // 没有轨迹就看不出「练了 5 次有没有进步」。
    const ratingChanged = !prev || prev.rating !== rating
    onUserDataChange({
      ...userData,
      subjectiveNotes: {
        ...userData.subjectiveNotes,
        [scopedTopicId(subjectId, topic.id)]: {
          topicId: topic.id,
          topicTitle: topic.title,
          content,
          rating,
          attempts: (prev?.attempts ?? 0) + (ratingChanged ? 1 : 0),
          history: [
            ...(prev?.history ?? []),
            ...(ratingChanged ? [{ rating, at: now }] : []),
          ].slice(-40),
          updatedAt: now,
        },
      },
      updatedAt: now,
    })
  }

  if (loading) return <div className="view-loading">加载主观题集训…</div>
  if (err) return <div className="view-loading is-error">{err}</div>

  return (
    <>
      <div className="tree">
        <div className="tree-head">
          <p className="tree-title">主观题集训</p>
          <p className="tree-sub">17 个专题 · 占卷面 50 分</p>
        </div>
        <div className="tree-list">
          {topics.map((t) => {
            const note = userData.subjectiveNotes[scopedTopicId(subjectId, t.id)]
            const active = openTopic === t.id
            return (
              <button
                key={t.id}
                className={`tree-chapter${active ? ' is-active' : ''}`}
                onClick={() => setOpenTopic(active ? null : t.id)}
              >
                <span className="num">{t.num}</span>
                <span style={{ flex: 1, minWidth: 0 }}>{t.title}</span>
                {note?.rating === 'correct' && <span className="mini-badge m-易">✓</span>}
                {note?.rating === 'partial' && <span className="mini-badge m-中">半</span>}
                {note?.rating === 'none' && <span className="mini-badge m-难">未</span>}
              </button>
            )
          })}
        </div>
      </div>

      <div className="canvas">
        <div className="library-head">
          <div>
            <h1 className="library-title">主观题集训</h1>
            <p className="library-sub">
              教材下册「第三部分 主观题集训」17 个专题 · 跨章节专项训练
              <br />
              主观题必须手写训练过程 —— 先写，再对答案，直接看答案等于没练
            </p>
          </div>
        </div>

        {!openTopic && (
          <div className="chapter-list">
            {topics.map((t) => {
              const note = userData.subjectiveNotes[scopedTopicId(subjectId, t.id)]
              return (
                <section key={t.id} className="chapter">
                  <button className="chapter-head" onClick={() => setOpenTopic(t.id)}>
                    <span className="chapter-num">专题 {t.num}</span>
                    <span className="chapter-title">{t.title}</span>
                    <span className="chapter-badges">
                      {note?.rating === 'correct' && (
                        <span className="badge badge-ok">完整正确</span>
                      )}
                      {note?.rating === 'partial' && (
                        <span className="badge badge-diff is-中">部分步骤</span>
                      )}
                      {note?.rating === 'none' && (
                        <span className="badge badge-overdue">没思路</span>
                      )}
                      <span className="badge">{t.pageCount} 页</span>
                    </span>
                    <span className="chapter-toggle">+</span>
                  </button>
                </section>
              )
            })}
          </div>
        )}

        {openTopic && detail && (
          <SubjectiveDetail
            subjectId={subjectId}
            topic={detail}
            note={userData.subjectiveNotes[scopedTopicId(subjectId, openTopic)]}
            onSave={(content, rating) => {
              const t = topics.find((x) => x.id === openTopic)
              if (t) saveNote(t, content, rating)
            }}
            onBack={() => setOpenTopic(null)}
          />
        )}
      </div>
    </>
  )
}

function SubjectiveDetail({
  subjectId,
  topic,
  note,
  onSave,
  onBack,
}: {
  subjectId: string
  topic: TopicDetail
  note: UserData['subjectiveNotes'][string] | undefined
  onSave: (content: string, rating: 'none' | 'partial' | 'correct') => void
  onBack: () => void
}) {
  const [draft, setDraft] = useState(note?.content ?? '')
  const [page, setPage] = useState(topic.pages[0]?.pdfPage ?? topic.source.pdfPage)
  const [rating, setRating] = useState<'none' | 'partial' | 'correct'>(
    note?.rating ?? 'none',
  )

  useEffect(() => {
    setDraft(note?.content ?? '')
  }, [note?.content])

  const current = topic.pages.find((p) => p.pdfPage === page) ?? topic.pages[0]
  const idx = topic.pages.findIndex((p) => p.pdfPage === current?.pdfPage)

  return (
    <>
      <button className="back-btn" onClick={onBack}>
        ← 返回专题列表
      </button>

      <div className="point-head">
        <div className="point-head-meta">
          <span>主观题集训</span>
          <span className="dot">·</span>
          <span>专题{topic.num} · {topic.title}</span>
          <span className="dot">·</span>
          <span>共 {topic.pages.length} 页</span>
        </div>
        <h1 className="point-title">
          专题{topic.num} {topic.title}
        </h1>
      </div>

      {/* 原书页 —— 主观题内容以截图呈现 */}
      <div className="shot-panel">
        <div className="shot-panel-head">
          <span className="label">原书页</span>
          <span className="muted small">
            第 {idx + 1} / {topic.pages.length} 页
          </span>
          <div style={{ flex: 1 }} />
          <button
            className="top-btn"
            disabled={idx <= 0}
            onClick={() => setPage(topic.pages[idx - 1].pdfPage)}
          >
            ← 上一页
          </button>
          <button
            className="top-btn"
            disabled={idx >= topic.pages.length - 1}
            onClick={() => setPage(topic.pages[idx + 1].pdfPage)}
          >
            下一页 →
          </button>
        </div>
        <div className="shot-panel-body">
          <ShotImage page={current?.pdfPage ?? topic.source.pdfPage} subjectId={subjectId} />
        </div>
      </div>

      {/* 我的训练 */}
      <section className="selftest">
        <h2 className="section-title">我的训练过程</h2>
        <p className="muted small">
          手写一遍解题过程：条件、公式、步骤、结论。写完再看原书解析，对照差在哪。
        </p>
        <RichEditor
          compact
          content={draft}
          placeholder="在这里写下你的解题过程：条件、公式、步骤、结论…"
          onSave={() => onSave(draft, rating)}
          onChange={(json) => setDraft(JSON.stringify(json))}
        />

        {/* 练习轨迹 */}
        {note && (note.attempts ?? 0) > 0 && (
          <div className="sub-track">
            <span className="muted small">
              练过 {note.attempts ?? 0} 次
            </span>
            <div className="sub-track-bars">
              {(note.history ?? []).map((h, i) => (
                <span
                  key={i}
                  className={`sub-track-bar is-${h.rating}`}
                  title={`${h.at.slice(0, 10)} · ${
                    h.rating === 'correct' ? '完整正确' : h.rating === 'partial' ? '写出部分' : '没思路'
                  }`}
                />
              ))}
            </div>
            <span className="muted small">
              {(note.history ?? []).length > 0 &&
                `最近：${
                  note.history[note.history.length - 1].rating === 'correct'
                    ? '完整正确'
                    : note.history[note.history.length - 1].rating === 'partial'
                      ? '写出部分'
                      : '没思路'
                }`}
            </span>
          </div>
        )}

        <div className="field-label">自评（先写再对，直接看答案等于没练）</div>
        <div className="answer-row">
          <button
            className="answer-btn is-correct"
            onClick={() => {
              setRating('correct')
              onSave(draft, 'correct')
            }}
          >
            完整正确
          </button>
          <button
            className="answer-btn is-partial"
            onClick={() => {
              setRating('partial')
              onSave(draft, 'partial')
            }}
          >
            写出部分步骤
          </button>
          <button
            className="answer-btn is-wrong"
            onClick={() => {
              setRating('none')
              onSave(draft, 'none')
            }}
          >
            完全没思路
          </button>
        </div>
        {note?.rating && (
          <p className="muted small">
            上次自评：{note.rating} · 更新于 {note.updatedAt.slice(0, 16).replace('T', ' ')}
          </p>
        )}
      </section>
    </>
  )
}

function ShotImage({ page, subjectId }: { page: number; subjectId: string }) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  // 主观题页块：整页去掉页眉水印
  const name = `down-${String(page).padStart(4, '0')}.png`

  useEffect(() => {
    setLoaded(false)
    setFailed(false)
  }, [page])

  return (
    <>
      {failed ? (
        <p className="muted" style={{ textAlign: 'center', padding: '40px 0' }}>
          这一页的截图还没生成，往前后翻一页试试。
        </p>
      ) : loaded ? (
        <figure className="shot">
          <img
            src={learningApi.shotUrl(name, subjectId)}
            alt={`下册第 ${page} 页`}
            onClick={() => setZoomed(true)}
            onError={() => setFailed(true)}
          />
          <figcaption>下册 · PDF 第 {page} 页 · 点击放大</figcaption>
        </figure>
      ) : (
        <button className="shot-load-btn" onClick={() => setLoaded(true)}>
          加载第 {page} 页
        </button>
      )}
      {zoomed && (
        <div className="lightbox" onClick={() => setZoomed(false)}>
          <img src={learningApi.shotUrl(name, subjectId)} alt="" />
        </div>
      )}
    </>
  )
}

/**
 * 主观题记录的 key —— 带科目前缀。
 *
 * 两科都有 topic01..topic17，不隔离会互相覆盖。
 */
function scopedTopicId(subjectId: string, topicId: string): string {
  return `${subjectId}:${topicId}`
}
