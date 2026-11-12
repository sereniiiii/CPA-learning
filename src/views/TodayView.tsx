import { useMemo } from 'react'
import { QueueItem } from '../learning'
import { SubjectLibrary } from '../types'

const REASON_LABEL: Record<QueueItem['reason'], string> = {
  due: '到期重测',
  wrong: '错题未解决',
  new: '新内容',
}

export function TodayView({
  queue,
  index,
  onOpenPoint,
  onStart,
}: {
  queue: QueueItem[]
  index: SubjectLibrary | null
  onOpenPoint: (chapterId: string, pointNum: number) => void
  onStart: () => void
}) {
  const counts = useMemo(() => {
    const c = { due: 0, wrong: 0, new: 0 }
    for (const q of queue) c[q.reason] += 1
    return c
  }, [queue])

  // 按章分组展示（队列本身交错，这里只是视觉归类）
  const byChapter = useMemo(() => {
    const map = new Map<number, { title: string; items: QueueItem[] }>()
    for (const q of queue) {
      if (!map.has(q.chapterNum)) {
        map.set(q.chapterNum, { title: q.chapterTitle, items: [] })
      }
      map.get(q.chapterNum)!.items.push(q)
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0])
  }, [queue])

  // 进度统计
  const stats = useMemo(() => {
    if (!index) return { total: 0, done: 0 }
    const total = index.chapters.reduce(
      (n, c) => n + c.sections.reduce((m, s) => m + s.points.length, 0),
      0,
    )
    return { total, done: 0 }
  }, [index])

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
        共 {queue.length} 个考点 · 全书 {stats.total} 个考点 ·
        建议一次做一个闭环（15–25 分钟）
      </p>

      <button className="start-btn" onClick={onStart}>
        开始今日队列
      </button>

      <div className="today-groups">
        {byChapter.map(([num, group]) => (
          <div key={num} className="today-group">
            <h4 className="today-group-title">
              第{num}章 {group.title}
            </h4>
            <div className="point-grid">
              {group.items.map((q) => (
                <button
                  key={q.pid}
                  className="point-chip"
                  onClick={() => onOpenPoint(q.chapterId, q.pointNum)}
                >
                  <span className={`reason-dot is-${q.reason}`} />
                  <span className="point-idx">{String(q.pointNum).padStart(2, '0')}</span>
                  <span className="point-name">{q.pointTitle}</span>
                  {q.hot != null && <span className="badge badge-hot">热{q.hot}</span>}
                  <span className="point-reason">{REASON_LABEL[q.reason]}</span>
                  {q.overdue > 0 && (
                    <span className="badge badge-overdue">逾期{q.overdue}天</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
