import { Subject } from '../types'

/**
 * 科目切换器。
 *
 * 多科目共用一套内容库与批注体系，切换只换科目，不换布局。
 */
export function SubjectSwitcher({
  subjects,
  current,
  onChange,
}: {
  subjects: Subject[]
  current: string
  onChange: (id: string) => void
}) {
  if (subjects.length <= 1) return null

  return (
    <div className="subject-switcher">
      {subjects.map((s) => (
        <button
          key={s.id}
          className={`subject-tab${current === s.id ? ' is-active' : ''}`}
          onClick={() => onChange(s.id)}
          title={`${s.name} · ${s.chapterCount} 章`}
        >
          <span className="subject-dot" style={{ background: s.color }} />
          <span className="subject-name">{s.name}</span>
          <span className="subject-count">{s.chapterCount}</span>
        </button>
      ))}
    </div>
  )
}
