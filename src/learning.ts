/**
 * 学习机制。
 *
 * 严格按《财务成本管理学习网页设计与落地清单》第 5.3 节的参数实现：
 *   间隔重复    1 / 3 / 7 / 14 / 30 / 60 天，答错回到第 1 天
 *   掌握度衰减  每天约 3%，需要重测回升
 *   掌握度推进  答对后向 100% 推进约 35% 剩余空间
 *   交错出题    今日队列不按章节顺序推进
 *
 * 掌握度只由重测驱动（文档 3.6）：浏览与重读都不涨。
 */
import {
  DECAY_PER_DAY,
  ErrorCause,
  INTERVALS,
  LearningState,
  MASTERY_GAIN,
  ReviewState,
  WrongItem,
  pointId,
} from './types'

export function todayStr(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return todayStr(d)
}

export function daysBetween(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00').getTime()
  const b = new Date(to + 'T00:00:00').getTime()
  return Math.round((b - a) / 86400000)
}

export function emptyReview(): ReviewState {
  return {
    mastery: 0,
    due: null,
    intervalIndex: -1,
    attempts: 0,
    lastResult: null,
    lastReviewed: null,
  }
}

/**
 * 掌握度衰减：按距上次重测的天数，每天衰减约 3%。
 * 衰减是乘性的（连续衰减会趋近于 0），但不低于 0。
 */
export function decayMastery(mastery: number, daysSinceReview: number): number {
  if (mastery <= 0 || daysSinceReview <= 0) return mastery
  const decayed = mastery * Math.pow(1 - DECAY_PER_DAY, daysSinceReview)
  return Math.max(0, Math.round(decayed))
}

/** 答对：向 100% 推进剩余空间的 35% */
function gainMastery(mastery: number): number {
  const remaining = 100 - mastery
  return Math.min(100, Math.round(mastery + remaining * MASTERY_GAIN))
}

/** 答错：回到第 1 天，掌握度打折 */
function punishMastery(mastery: number): number {
  return Math.max(0, Math.round(mastery * 0.5))
}

export type AnswerResult = 'correct' | 'wrong' | 'partial'

/**
 * 记录一次重测结果，更新掌握度与下次复习日期。
 *
 * - correct  → 间隔进一档，掌握度按剩余空间的 35% 推进
 * - partial  → 间隔不变（半懂），掌握度小幅推进
 * - wrong    → 间隔回到第 1 天，掌握度打折
 */
export function applyAnswer(
  state: LearningState,
  pid: string,
  result: AnswerResult,
  today = todayStr(),
): LearningState {
  const prev = state.reviews[pid] ?? emptyReview()
  let review: ReviewState

  if (result === 'correct') {
    const idx = Math.min(prev.intervalIndex + 1, INTERVALS.length - 1)
    review = {
      ...prev,
      mastery: gainMastery(prev.mastery),
      intervalIndex: idx,
      due: addDays(today, INTERVALS[idx]),
      attempts: prev.attempts + 1,
      lastResult: 'correct',
      lastReviewed: today,
    }
  } else if (result === 'partial') {
    // 半懂：间隔不推进，掌握度小幅上升
    const gain = Math.max(1, Math.round((100 - prev.mastery) * 0.1))
    review = {
      ...prev,
      mastery: Math.min(100, prev.mastery + gain),
      attempts: prev.attempts + 1,
      lastResult: 'partial',
      lastReviewed: today,
    }
  } else {
    review = {
      ...prev,
      mastery: punishMastery(prev.mastery),
      intervalIndex: 0,
      due: addDays(today, INTERVALS[0]),
      attempts: prev.attempts + 1,
      lastResult: 'wrong',
      lastReviewed: today,
    }
  }

  return { ...state, reviews: { ...state.reviews, [pid]: review }, updatedAt: today }
}

/**
 * 错题归档：答错时记录，答对时移除。
 * 错因标签必填一个（文档 3.6：答错后必须选一个）。
 */
export function updateWrongBook(
  state: LearningState,
  item: Omit<WrongItem, 'times' | 'lastWrong' | 'cause'> & { cause: ErrorCause | null },
  wrong: boolean,
  today = todayStr(),
): LearningState {
  const book = { ...state.wrongBook }
  if (wrong) {
    const prev = book[item.pointId]
    book[item.pointId] = {
      ...item,
      cause: item.cause ?? prev?.cause ?? null,
      times: (prev?.times ?? 0) + 1,
      lastWrong: today,
    }
  } else {
    delete book[item.pointId]
  }
  return { ...state, wrongBook: book, updatedAt: today }
}

/** 某考点的当前掌握度（含衰减） */
export function currentMastery(state: LearningState, pid: string, today = todayStr()): number {
  const r = state.reviews[pid]
  if (!r || !r.lastReviewed) return 0
  return decayMastery(r.mastery, daysBetween(r.lastReviewed, today))
}

/** 是否到期需要重测 */
export function isDue(state: LearningState, pid: string, today = todayStr()): boolean {
  const r = state.reviews[pid]
  if (!r) return false
  if (!r.due) return true // 学过但没排下次 → 视为该复习了
  // 到期日 <= 今天 才算到期。
  // daysBetween(from, to) = to - from，所以要算 (今天 - 到期日) >= 0。
  return daysBetween(r.due, today) >= 0
}

/** 逾期天数（0 = 今天到期，负 = 尚未到期） */
export function overdueDays(state: LearningState, pid: string, today = todayStr()): number {
  const r = state.reviews[pid]
  if (!r?.due) return 0
  return daysBetween(r.due, today)
}

/**
 * 今日队列（文档 5.1）：
 *   到期重排 + 未解决错题 + 新内容
 * 且不按章节顺序推进（文档 5.3 交错出题）。
 */
export interface QueueItem {
  pid: string
  chapterId: string
  chapterNum: number
  chapterTitle: string
  pointNum: number
  pointTitle: string
  difficulty: string | null
  hot: number | null
  reason: 'due' | 'wrong' | 'new'
  overdue: number
}

export function buildTodayQueue(
  state: LearningState,
  chapters: Array<{
    id: string
    num: number
    title: string
    sections: Array<{
      num: number
      points: Array<{ num: number; title: string; difficulty: string | null; hot: number | null }>
    }>
  }>,
  today = todayStr(),
): QueueItem[] {
  const items: QueueItem[] = []
  const seen = new Set<string>()

  for (const ch of chapters) {
    for (const sec of ch.sections) {
      for (const p of sec.points) {
        const pid = pointId(ch.id, sec.num, p.num)
        if (seen.has(pid)) continue

        const wrongItem = state.wrongBook[pid]
        const due = isDue(state, pid, today)
        const od = overdueDays(state, pid, today)

        if (wrongItem && !due) {
          // 错题未解决但尚未到期 —— 仍纳入今日（文档 5.1：未解决错题）
          seen.add(pid)
          items.push({
            pid, chapterId: ch.id, chapterNum: ch.num, chapterTitle: ch.title,
            pointNum: p.num, pointTitle: p.title,
            difficulty: p.difficulty, hot: p.hot,
            reason: 'wrong', overdue: od,
          })
        } else if (due) {
          seen.add(pid)
          items.push({
            pid, chapterId: ch.id, chapterNum: ch.num, chapterTitle: ch.title,
            pointNum: p.num, pointTitle: p.title,
            difficulty: p.difficulty, hot: p.hot,
            reason: 'due', overdue: od,
          })
        }
      }
    }
  }

  // 新内容：完全没学过的考点，按教材信号（5年热点次数、难度）优先
  const fresh: QueueItem[] = []
  for (const ch of chapters) {
    for (const sec of ch.sections) {
      for (const p of sec.points) {
        const pid = pointId(ch.id, sec.num, p.num)
        if (seen.has(pid)) continue
        if (state.reviews[pid]) continue
        fresh.push({
          pid, chapterId: ch.id, chapterNum: ch.num, chapterTitle: ch.title,
          pointNum: p.num, pointTitle: p.title,
          difficulty: p.difficulty, hot: p.hot,
          reason: 'new', overdue: 0,
        })
      }
    }
  }
  // 教材信号优先：5年热点次数多的先学（同难度下）
  fresh.sort((a, b) => {
    const hot = (b.hot ?? 0) - (a.hot ?? 0)
    if (hot !== 0) return hot
    const diff = rank(a.difficulty) - rank(b.difficulty)
    if (diff !== 0) return diff
    return a.chapterNum - b.chapterNum
  })

  // 交错：今日队列不按章节顺序推进
  const interleaved = interleave(fresh)

  return [...items, ...interleaved]
}

function rank(d: string | null): number {
  if (d === '难') return 2
  if (d === '中') return 1
  return 0
}

/**
 * 交错混合：把各章的新内容轮流取出，避免按章节顺序推进。
 * 文档 3.2：按顺序练题会制造「我懂了」的错觉。
 */
function interleave(items: QueueItem[]): QueueItem[] {
  const byChapter = new Map<number, QueueItem[]>()
  for (const it of items) {
    if (!byChapter.has(it.chapterNum)) byChapter.set(it.chapterNum, [])
    byChapter.get(it.chapterNum)!.push(it)
  }
  const chapters = [...byChapter.keys()].sort((a, b) => a - b)
  const out: QueueItem[] = []
  let idx = 0
  while (out.length < items.length) {
    const ch = chapters[idx % chapters.length]
    const list = byChapter.get(ch)!
    if (list.length) out.push(list.shift()!)
    idx += 1
    if (idx > chapters.length * 200) break // 安全阀
  }
  return out
}

/** 归档区：已掌握但会衰减的考点，按衰减程度排序 */
export function buildArchive(state: LearningState, today = todayStr()): Array<{
  pid: string
  title: string
  mastery: number
  decayedTo: number
  daysSince: number
}> {
  const out: Array<{ pid: string; title: string; mastery: number; decayedTo: number; daysSince: number }> = []
  for (const [pid, r] of Object.entries(state.reviews ?? {})) {
    if (r.mastery < 60) continue
    const days = r.lastReviewed ? daysBetween(r.lastReviewed, today) : 0
    const now = decayMastery(r.mastery, days)
    if (now >= 60) continue // 还很稳，不算归档
    out.push({ pid, title: pid, mastery: r.mastery, decayedTo: now, daysSince: days })
  }
  out.sort((a, b) => a.decayedTo - b.decayedTo)
  return out
}

/** 错题本按错因标签分组统计（文档 5.2） */
export function groupWrongByCause(book: Record<string, WrongItem>): Record<string, WrongItem[]> {
  const groups: Record<string, WrongItem[]> = {}
  for (const item of Object.values(book)) {
    const key = item.cause ?? '未标注'
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
  }
  return groups
}
