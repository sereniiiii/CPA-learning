import { useMemo } from 'react'
import { QueueItem } from '../learning'
import { SubjectLibrary } from '../types'

export function TodayView({
  queue,
  index,
  onOpenChapter,
  onStart,
}: {
  queue: QueueItem[]
  index: SubjectLibrary | null
  onOpenChapter: (chapterId: string) => void
  onStart: () => void
}) {
  const counts = useMemo(() => {
    const c = { due: 0, wrong: 0, new: 0 }
    for (const q of queue) c[q.reason] += 1
    return c
  }, [queue])

  // 全书概览（按章一行，不重复教材库的完整目录）
  const chapters = useMemo(() => {
    if (!index) return []
    const queueCount = new Map<string, number>()
    for (const q of queue) {
      queueCount.set(q.chapterId, (queueCount.get(q.chapterId) ?? 0) + 1)
    }
    return index.chapters.map((c) => {
      const points = c.sections.reduce((m, s) => m + s.points.length, 0)
      const hot = c.sections.reduce(
        (m, s) =>
          m +
          s.points.reduce(
            (k, p) => k + (p.hot ?? 0),
            0,
          ),
        0,
      )
      return {
        id: c.id,
        num: c.num,
        title: c.title,
        difficulty: c.info.difficulty,
        points,
        hot,
        queued: queueCount.get(c.id) ?? 0,
      }
    })
  }, [index, queue])

  const totalPoints = chapters.reduce((n, c) => n + c.points, 0)

  if (queue.length === 0) {
    return (
      <div className="today-empty">
        <p className="today-empty-title">今日队列已清空</p>
        <p className="muted">
          没有到期的重测，也没有未解决的错题。去「库」里学新内容，或明天再来。
        </p>
      </div>
    )
  }

  return (
    <div className="today">
      <div className="today-head">
        <h1 className="today-title">今日</h1>
        <div className="today-counts">
          <span className="count-chip is-due">{counts.due} 到期</span>
          <span className="count-chip is-wrong">{counts.wrong} 错题</span>
          <span className="count-chip is-new">{counts.new} 新内容</span>
        </div>
      </div>

      <p className="today-hint">
        共 {queue.length} 个考点待处理 · 全书 {totalPoints} 个考点 ·
        建议一次做一个闭环（15–25 分钟）
      </p>

      <button className="start-btn" onClick={onStart}>
        开始今日队列
      </button>

      {/* 全书概览 —— 一章一行。
          这里刻意不铺开全部考点：那是「教材库」的内容，铺两份就是重复。 */}
      <div className="today-overview">
        <div className="today-overview-head">
          <h4 className="today-group-title">全书概览</h4>
          <span className="muted small">点章名进教材库</span>
        </div>
        <div className="today-chapter-rows">
          {chapters.map((c) => (
            <button
              key={c.id}
              className="today-chapter-row"
              onClick={() => onOpenChapter(c.id)}
            >
              <span className="today-chapter-no">第{c.num}章</span>
              <span className="today-chapter-name">{c.title}</span>
              {c.difficulty && (
                <span className={`badge badge-diff is-${c.difficulty}`}>
                  {c.difficulty}
                </span>
              )}
              {c.hot > 0 && (
                <span className="muted small">5年热点 {c.hot} 次</span>
              )}
              <span style={{ flex: 1 }} />
              {c.queued > 0 && (
                <span className="count-chip is-new">{c.queued} 待学</span>
              )}
              <span className="muted small">{c.points} 考点</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
