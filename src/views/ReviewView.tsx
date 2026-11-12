import { useMemo } from 'react'
import { groupWrongByCause } from '../learning'
import { ErrorCause, LearningState, WrongItem } from '../types'
import { ERROR_CAUSES } from '../types'

interface Props {
  state: LearningState
  onOpenPoint: (chapterId: string, pointNum: number) => void
}

/** 复习区：全部到期队列，按逾期程度排序 */
export function ReviewView({ state, onOpenPoint }: Props) {
  const items = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const out: Array<{
      pid: string
      title: string
      due: string | null
      overdue: number
      mastery: number
    }> = []
    for (const [pid, r] of Object.entries(state.reviews)) {
      if (!r.due) continue
      const overdue = Math.round(
        (new Date(today).getTime() - new Date(r.due).getTime()) / 86400000,
      )
      if (overdue < 0) continue
      out.push({ pid, title: pid, due: r.due, overdue, mastery: r.mastery })
    }
    out.sort((a, b) => b.overdue - a.overdue)
    return out
  }, [state.reviews])

  return (
    <div className="review">
      <h1 className="view-title">复习</h1>
      <p className="muted">
        {items.length > 0
          ? `${items.length} 个考点到期，逾期越久排越前`
          : '当前没有到期的复习项'}
      </p>
      <div className="point-grid">
        {items.map((it) => (
          <button
            key={it.pid}
            className="point-chip"
            onClick={() => {
              const [chId, p] = it.pid.split('-p')
              onOpenPoint(chId, Number(p))
            }}
          >
            <span className="point-name">{it.pid}</span>
            {it.overdue > 0 && (
              <span className="badge badge-overdue">逾期{it.overdue}天</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

/** 错题本：按错因标签分组 */
export function WrongBookView({ state, onOpenPoint }: Props) {
  const groups = useMemo(() => groupWrongByCause(state.wrongBook), [state.wrongBook])
  const total = Object.keys(state.wrongBook).length

  return (
    <div className="wrongbook">
      <h1 className="view-title">错题本</h1>
      <p className="muted">
        {total > 0
          ? `${total} 道错题，按错因分组`
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
                  const [chId, p] = it.pointId.split('-p')
                  onOpenPoint(chId, Number(p))
                }}
              >
                <span className="point-name">{it.pointTitle}</span>
                <span className="point-reason">错 {it.times} 次</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** 归档区：已掌握但会衰减的考点，按衰减程度排序 */
export function ArchiveView({
  state,
  onOpenPoint,
}: {
  state: LearningState
  onOpenPoint: (chapterId: string, pointNum: number) => void
}) {
  const items = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const out: Array<{ pid: string; mastery: number; decayed: number }> = []
    for (const [pid, r] of Object.entries(state.reviews)) {
      if (r.mastery < 60) continue
      const days = r.lastReviewed
        ? Math.round((new Date(today).getTime() - new Date(r.lastReviewed).getTime()) / 86400000)
        : 0
      const decayed = Math.round(r.mastery * Math.pow(0.97, days))
      if (decayed >= 60) continue
      out.push({ pid, mastery: r.mastery, decayed })
    }
    out.sort((a, b) => a.decayed - b.decayed)
    return out
  }, [state.reviews])

  return (
    <div className="archive">
      <h1 className="view-title">归档</h1>
      <p className="muted">
        {items.length > 0
          ? `${items.length} 个考点掌握度已衰减，等重测回升`
          : '还没有进入归档的考点'}
      </p>
      <div className="point-grid">
        {items.map((it) => (
          <button
            key={it.pid}
            className="point-chip"
            onClick={() => {
              const [chId, p] = it.pid.split('-p')
              onOpenPoint(chId, Number(p))
            }}
          >
            <span className="point-name">{it.pid}</span>
            <span className="badge badge-overdue">
              {it.decayed}%（原 {it.mastery}%）
            </span>
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
      <span className="cause-label">错因</span>
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
