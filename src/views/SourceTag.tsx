/**
 * 资料来源标签。
 *
 * 同一门课的资料来自不同的册子：
 *   轻一          教材正文（章 → 节 → 考点）
 *   轻二·大题篇   主观题集训（专题级）
 *   轻二·小题篇   同步习题（按专题挂在各章）
 *   轻二·套卷     模拟卷
 *   轻三          冲刺卷
 *
 * 界面上必须一眼看出「这块内容是从哪本书来的」——
 * 否则几套资料混在一起会以为是一套。
 */
const TONE: Record<string, string> = {
  轻一: 'tone-1',
  '轻二·大题篇': 'tone-2',
  '轻二·小题篇': 'tone-3',
  '轻二·套卷': 'tone-4',
  轻三: 'tone-5',
}

export function SourceTag({ level, compact }: { level?: string; compact?: boolean }) {
  if (!level) return null
  return (
    <span className={`source-tag ${TONE[level] ?? ''}${compact ? ' is-compact' : ''}`}>
      {level}
    </span>
  )
}
