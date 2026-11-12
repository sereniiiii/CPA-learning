import { useCallback, useEffect, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { learningApi } from '../api'
import { UserData } from '../types'
import { RichEditor } from '../editor/Editor'

export interface ExerciseItem {
  no: number
  stem: string
  block: string
  page: number
  answer: string | null
  answerBlock: string | null
}

export interface ExerciseGroup {
  chapterNum: number
  chapterTitle: string
  items: ExerciseItem[]
}

/**
 * 习题滑动工作台。
 *
 * 一道题一屏，左右滑动切换：
 *   - 触摸滑动（移动端）
 *   - ← → 方向键
 *   - 底部圆点指示器点选跳转
 * 左原书题图，右答题区；答案默认收起，做完再展开对照。
 */
export function ExerciseWorkbench({
  subjectId,
  chapterId,
  groups,
  userData,
  onUserDataChange,
}: {
  subjectId: string
  chapterId: string
  groups: ExerciseGroup[]
  userData: UserData
  onUserDataChange: (d: UserData) => void
}) {
  const all = groups.flatMap((g) => g.items)
  const [index, setIndex] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [touchX, setTouchX] = useState<number | null>(null)

  const cur = all[index]

  const go = useCallback(
    (n: number) => {
      setIndex(Math.max(0, Math.min(all.length - 1, n)))
      setShowAnswer(false)
    },
    [all.length],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        return
      }
      if (e.key === 'ArrowLeft') go(index - 1)
      if (e.key === 'ArrowRight') go(index + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, go])

  if (!cur) {
    return <p className="muted small">这一章还没有习题</p>
  }

  const answerKey = `${chapterId}-ex${cur.page}-${cur.no}`

  const saveAnswer = (content: string) => {
    onUserDataChange({
      ...userData,
      exerciseAnswers: {
        ...userData.exerciseAnswers,
        [answerKey]: {
          chapterId,
          page: cur.page,
          volume: '',
          printPage: cur.page,
          content,
          updatedAt: new Date().toISOString(),
        },
      },
      updatedAt: new Date().toISOString(),
    })
  }

  return (
    <div className="ex-swipe">
      <div className="ex-swipe-top">
        <div className="ex-swipe-tabs">
          {groups.map((g, gi) => {
            const start = groups
              .slice(0, gi)
              .reduce((n, x) => n + x.items.length, 0)
            const active = index >= start && index < start + g.items.length
            return (
              <button
                key={gi}
                className={`ex-tab${active ? ' is-active' : ''}`}
                onClick={() => go(start)}
              >
                {g.items.length}题
              </button>
            )
          })}
        </div>
        <span className="muted small">
          第 {index + 1} / {all.length} 题
        </span>
      </div>

      <div
        className="ex-swipe-track"
        onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX === null) return
          const dx = e.changedTouches[0].clientX - touchX
          if (Math.abs(dx) > 48) go(index + (dx < 0 ? 1 : -1))
          setTouchX(null)
        }}
      >
        <div className="ex-swipe-inner" style={{ transform: `translateX(${-index * 100}%)` }}>
          {all.map((it, i) => {
            const k = `${chapterId}-ex${it.page}-${it.no}`
            return (
              <div className="ex-slide" key={`${it.page}-${it.no}-${i}`}>
                <div className="ex-slide-left">
                  <figure className="shot">
                    <img
                      src={learningApi.shotUrl(it.block, subjectId)}
                      alt={`第 ${it.no} 题`}
                      loading="lazy"
                    />
                    <figcaption>{it.stem.slice(0, 60)}</figcaption>
                  </figure>
                </div>
                <div className="ex-slide-right">
                  <div className="ex-slide-head">
                    <span className="ex-qno">第 {it.no} 题</span>
                    {it.answer && !showAnswer && (
                      <button
                        className="ex-reveal"
                        onClick={() => setShowAnswer(true)}
                      >
                        看答案
                      </button>
                    )}
                  </div>

                  <RichEditor
                    compact
                    content={userData.exerciseAnswers[k]?.content ?? ''}
                    placeholder="在这里写你的解答…"
                    onSave={() => {}}
                    onChange={(json: JSONContent) => saveAnswer(JSON.stringify(json))}
                  />

                  {showAnswer && (
                    <div className="ex-answer">
                      <div className="ex-answer-head">
                        <span className="ex-answer-label">教材答案</span>
                        {it.answer && <b>{it.answer}</b>}
                        <button
                          className="ex-answer-close"
                          onClick={() => setShowAnswer(false)}
                        >
                          收起
                        </button>
                      </div>
                      {it.answerBlock && (
                        <img
                          src={learningApi.shotUrl(it.answerBlock, subjectId)}
                          alt="教材答案"
                          loading="lazy"
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="ex-swipe-bottom">
        <button
          className="ex-arrow"
          onClick={() => go(index - 1)}
          disabled={index === 0}
          title="上一题 ←"
        >
          ‹
        </button>
        <div className="ex-dots">
          {all.map((it, i) => (
            <button
              key={i}
              className={`ex-dot${i === index ? ' is-active' : ''}`}
              onClick={() => go(i)}
              title={`第 ${it.no} 题`}
            />
          ))}
        </div>
        <button
          className="ex-arrow"
          onClick={() => go(index + 1)}
          disabled={index === all.length - 1}
          title="下一题 →"
        >
          ›
        </button>
      </div>
      <p className="muted small ex-hint">
        左右滑动或按 ← → 切题 · 写完点「看答案」对照教材
      </p>
    </div>
  )
}
