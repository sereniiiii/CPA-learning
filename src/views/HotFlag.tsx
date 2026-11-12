/**
 * 考点热度标志。
 *
 * 教材里写的是「5年热点 13 次」这种纯文字，扫一眼看不出轻重。
 * 这里改成两个信号：
 *   🔥🔥🔥  热度等级（一眼看出这是不是高频考点）
 *   [13次]  次数（精确值，框起来单独成块，不跟标题文字混在一起）
 *
 * 分档：≥8 次 = 三火苗，3–7 次 = 两火苗，1–2 次 = 一火苗。
 */
export function HotFlag({
  hot,
  compact = false,
}: {
  hot: number | null | undefined
  compact?: boolean
}) {
  if (!hot || hot <= 0) return null
  const flames = hot >= 8 ? 3 : hot >= 3 ? 2 : 1
  return (
    <span
      className={`hot-flag${compact ? ' is-compact' : ''}`}
      title={`近 5 年考过 ${hot} 次`}
    >
      <span className="hot-flames" aria-label={`热度 ${flames} 级`}>
        {'🔥'.repeat(flames)}
      </span>
      <span className="hot-count">{hot}次</span>
    </span>
  )
}
