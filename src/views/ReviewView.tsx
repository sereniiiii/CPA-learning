import { useMemo } from 'react'
import { groupWrongByCause } from '../learning'
import { ErrorCause, LearningState, WrongItem, ReviewState } from '../types'
import { ERROR_CAUSES, parsePointId } from '../types'

/** 复习区：全部到期队列，按逾期程度排序 */
export function ReviewView({
  state,
  subjectId,
  onOpenPoint,
}: {
  state: LearningState
  subjectId: string
  onOpenPoint: (chapterId: string, pointNum: number) => void
}) {
  const scoped = useMemo(
    () => filterBySubject(state, subjectId),
    [state, subjectId],
  )
  const items = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const out: Array<{
      pid: string
      due: string | null
      overdue: number
      mastery: number
    }> = []
    for (const [pid, r] of Object.entries(scoped.reviews ?? {})) {
      if (!r.due) continue
      const overdue = Math.round(
        (new Date(today).getTime() - new Date(r.due).getTime()) / 86400000,
      )
      if (overdue < 0) continue
      out.push({ pid, due: r.due, overdue, mastery: r.mastery })
    }
    out.sort((a, b) => b.overdue - a.overdue)
    return out
  }, [scoped.reviews])

  const groups = useMemo(() => {
    const map = new Map<string, typeof items>()
    for (const it of items) {
      const day = it.due ?? '未排期'
      if (!map.has(day)) map.set(day, [])
      map.get(day)!.push(it)
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
  }, [items])

  return (
    <div className="canvas">
      <h1 className="view-title">复习</h1>
      <p className="muted">
        {items.length > 0
          ? `${items.length} 个考点到期，逾期越久排越前`
          : '当前没有到期的复习项'}
      </p>

      {groups.map(([day, list]) => (
        <div key={day} className="wrong-group">
          <h4 className="wrong-group-title">
            {day}
            <span className="wrong-count">{list.length}</span>
          </h4>
          <div className="point-grid">
            {list.map((it) => (
              <button
                key={it.pid}
                className="point-chip"
                onClick={() => {
                  const parsed = parsePointId(it.pid)
                  if (parsed) onOpenPoint(parsed.chapterId, parsed.pointNum)
                }}
              >
                <span className="point-name">{it.pid}</span>
                <span className="badge badge-blue">掌握 {it.mastery}%</span>
                {it.overdue > 0 && (
                  <span className="badge badge-overdue">逾期{it.overdue}天</span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** 错题本：按错因标签分组 */
export function WrongBookView({
  state,
  subjectId,
  onOpenPoint,
}: {
  state: LearningState
  subjectId: string
  onOpenPoint: (chapterId: string, pointNum: number) => void
}) {
  const scoped = useMemo(
    () => filterBySubject(state, subjectId),
    [state, subjectId],
  )
  const groups = useMemo(() => groupWrongByCause(scoped.wrongBook), [scoped.wrongBook])
  const total = Object.keys(scoped.wrongBook ?? {}).length

  return (
    <div className="canvas">
      <h1 className="view-title">错题本</h1>
      <p className="muted">
        {total > 0
          ? `${total} 道错题，按错因分组 —— 只有「错了」没有错因的错题本，复盘价值减半`
          : '还没有错题 —— 答错时会自动归档到这里'}
      </p>

      {Object.entries(groups).map(([cause, items]) => (
        <div key={cause} className="wrong-group">
          <h4 className="wrong-group-title">
            {cause}
            <span className="wrong-count">{items.length}</span>
          </h4>
          <div className="point-grid">
            {items.map((it: WrongItem) => (
              <button
                key={it.pointId}
                className="point-chip"
                onClick={() => {
                  const parsed = parsePointId(it.pointId)
                  if (parsed) onOpenPoint(parsed.chapterId, parsed.pointNum)
                }}
              >
                <span className="point-name">{it.pointTitle}</span>
                <span className="point-reason">
                  第{it.chapterNum}章 · 错 {it.times} 次
                </span>
                <span className="badge badge-overdue">{it.lastWrong}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** 归档区：已掌握但会衰减的考点，按衰减程度排序 */
/**
 * 掌握度衰减曲线。
 *
 * 每天按 3% 衰减（复利），画出来就是一条下行曲线 ——
 * 比单看「原 85% → 现在 62%」直观得多：能看出还剩多少缓冲、多久会跌破线。
 */
function DecayCurve({
  mastery,
  days,
  decayed,
}: {
  mastery: number
  days: number
  decayed: number
}) {
  const W = 132
  const H = 34
  const horizon = Math.max(days, 14)
  const pts: string[] = []
  for (let d = 0; d <= horizon; d += Math.max(1, Math.round(horizon / 28))) {
    const v = mastery * Math.pow(0.97, d)
    const x = (d / horizon) * W
    const y = H - (v / 100) * H
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`)
  }
  const x = (days / horizon) * W
  const y = H - (decayed / 100) * H

  return (
    <svg className="decay-curve" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <line
        x1="0"
        y1={H - 0.6 * H}
        x2={W}
        y2={H - 0.6 * H}
        stroke="var(--line-2)"
        strokeDasharray="3 3"
        strokeWidth="1"
      />
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke="var(--amber)"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={x} cy={y} r="2.8" fill="var(--red)" />
    </svg>
  )
}

export function ArchiveView({
  state,
  subjectId,
  onOpenPoint,
}: {
  state: LearningState
  subjectId: string
  onOpenPoint: (chapterId: string, pointNum: number) => void
}) {
  const scoped = useMemo(
    () => filterBySubject(state, subjectId),
    [state, subjectId],
  )
  const items = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const out: Array<{ pid: string; mastery: number; decayed: number; days: number }> = []
    for (const [pid, r] of Object.entries(scoped.reviews ?? {})) {
      if (r.mastery < 60) continue
      const days = r.lastReviewed
        ? Math.round(
            (new Date(today).getTime() - new Date(r.lastReviewed).getTime()) / 86400000,
          )
        : 0
      const decayed = Math.round(r.mastery * Math.pow(0.97, days))
      if (decayed >= 60) continue
      out.push({ pid, mastery: r.mastery, decayed, days })
    }
    out.sort((a, b) => a.decayed - b.decayed)
    return out
  }, [scoped.reviews])

  return (
    <div className="canvas">
      <h1 className="view-title">归档</h1>
      <p className="muted">
        {items.length > 0
          ? `${items.length} 个考点掌握度已衰减（每天约 3%），等重测回升 —— 归档不是删除`
          : '还没有进入归档的考点'}
      </p>
      <div className="point-grid">
        {items.map((it) => (
          <button
            key={it.pid}
            className="point-chip archive-chip"
            onClick={() => {
              const parsed = parsePointId(it.pid)
              if (parsed) onOpenPoint(parsed.chapterId, parsed.pointNum)
            }}
          >
            <DecayCurve mastery={it.mastery} days={it.days} decayed={it.decayed} />
            <span className="point-name">{it.pid}</span>
            <span className="badge badge-diff is-中">
              {it.decayed}%（原 {it.mastery}%）
            </span>
            <span className="point-reason">{it.days} 天未测</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** 错因选择器 —— 答错后必须选一个（文档 3.6） */
export function CausePicker({
  value,
  onChange,
}: {
  value: ErrorCause | null
  onChange: (c: ErrorCause) => void
}) {
  return (
    <div className="cause-picker">
      <span className="cause-label">错因（答错后必选）</span>
      {ERROR_CAUSES.map((c) => (
        <button
          key={c}
          className={`cause-btn${value === c ? ' is-on' : ''}`}
          onClick={() => onChange(c)}
        >
          {c}
        </button>
      ))}
    </div>
  )
}

/**
 * 按科目过滤学习状态。
 *
 * 学习状态的 key 现在是「科目:考点ID」（如 `cwc:ch01-s01-p01`），
 * 所以切科目时只看得到该科目的掌握度与错题。
 * 老数据（没有科目前缀）一律归到当前科目 —— 升级后不丢数据。
 */
export function filterBySubject(
  state: LearningState,
  subjectId: string,
): LearningState {
  const reviews: Record<string, ReviewState> = {}
  const wrongBook: Record<string, WrongItem> = {}

  for (const [key, r] of Object.entries(state.reviews ?? {})) {
    const i = key.indexOf(':')
    if (i < 0) {
      // 老数据：没有科目前缀 → 归当前科目
      reviews[key] = r
    } else if (key.slice(0, i) === subjectId) {
      reviews[key.slice(i + 1)] = r
    }
  }

  for (const [key, w] of Object.entries(state.wrongBook ?? {})) {
    const i = key.indexOf(':')
    if (i < 0) {
      wrongBook[key] = w
    } else if (key.slice(0, i) === subjectId) {
      wrongBook[key.slice(i + 1)] = { ...w, subjectId }
    }
  }

  return { ...state, reviews, wrongBook }
}
