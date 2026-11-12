/** 教材内容库的数据类型（对应 api/_lib 里生成的 JSON 结构） */

export interface PageMeta {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  order: number
}

export interface PointMeta {
  num: number
  title: string
  difficulty: string | null
  hot: number | null
  exampleCount: number
}

export interface SectionMeta {
  num: number
  title: string
  points: PointMeta[]
}

export interface ChapterInfo {
  difficulty: string | null
  studyHours: number | null
  examTypes: string | null
  avgScore: number | null
  guide: string | null
  changes: string[] | null
}

export interface ChapterMeta {
  id: string
  num: number
  title: string
  volume: string
  info: ChapterInfo
  sections: SectionMeta[]
}

export interface TextbookIndex {
  meta: {
    title: string
    source: string
    version: string
    generatedAt: string
    chapterCount: number
  }
  chapters: ChapterMeta[]
  subjectiveCount: number
}

export interface SourceRef {
  volume: string
  pdfPage: number
  printPage: number
}

export interface Example {
  no: number
  type: string
  text: string
  source: SourceRef
  status: '已核' | '待核' | '草稿'
  render: 'text' | 'screenshot'
}

export interface Point {
  num: number
  title: string
  difficulty: string | null
  hot: number | null
  body: string
  examples: Example[]
  source: SourceRef
  status: '已核' | '待核' | '草稿'
  render: 'text' | 'screenshot'
}

export interface Section {
  num: number
  title: string
  points: Point[]
}

export interface Chapter {
  id: string
  num: number
  title: string
  volume: string
  info: ChapterInfo
  pointsFramework: Array<{ name: string; difficulty: string | null; hot: number | null; section: string }>
  sections: Section[]
  exercises: Array<{ source: SourceRef; text: string; status: string }>
  pdfPages: number[]
  needScreenshot: boolean
  status: string
}

/* ---------- 学习机制（文档 5.3） ---------- */

export const INTERVALS = [1, 3, 7, 14, 30, 60] // 间隔重复天数
export const DECAY_PER_DAY = 0.03 // 掌握度每天衰减约 3%
export const MASTERY_GAIN = 0.35 // 答对后向 100% 推进剩余空间的 35%

/** 错因标签（文档 3.6） */
export const ERROR_CAUSES = [
  '概念混淆',
  '没记住',
  '计算失误',
  '看错题',
  '表述陷阱',
] as const
export type ErrorCause = (typeof ERROR_CAUSES)[number]

export interface ReviewState {
  /** 考点掌握度 0-100 */
  mastery: number
  /** 下次复习日期（YYYY-MM-DD） */
  due: string | null
  /** 间隔档位索引，答错回到 0 */
  intervalIndex: number
  /** 重测次数 */
  attempts: number
  lastResult: 'correct' | 'wrong' | 'partial' | null
  lastReviewed: string | null
}

export interface WrongItem {
  /** 考点 ID（ch01-p01） */
  pointId: string
  chapterNum: number
  chapterTitle: string
  pointTitle: string
  cause: ErrorCause | null
  times: number
  lastWrong: string
  /** 主观题自评档位；客观题为 null */
  selfRating?: 'none' | 'partial' | 'correct' | null
}

export interface LearningState {
  reviews: Record<string, ReviewState>
  wrongBook: Record<string, WrongItem>
  /** 主观题自评记录 */
  subjective: Record<string, 'none' | 'partial' | 'correct'>
  updatedAt: string
}

export const EMPTY_LEARNING: LearningState = {
  reviews: {},
  wrongBook: {},
  subjective: {},
  updatedAt: '',
}

/** 考点唯一 ID */
export function pointId(chapterId: string, pointNum: number): string {
  return `${chapterId}-p${String(pointNum).padStart(2, '0')}`
}
