/** 教材内容库的数据类型（对应 api/_lib 里生成的 JSON 结构） */

/* ---------- 科目 ---------- */

/** 科目定义 —— 多科目共用一套内容库与批注体系 */
export interface Subject {
  /** 科目 ID（用作存储与路由键） */
  id: string
  /** 科目名 */
  name: string
  /** 册数 */
  volumeCount: number
  /** 章节总数 */
  chapterCount: number
  /** 封面色（用于导航标识） */
  color: string
}

/** 教材内容库（按科目） */
export interface SubjectLibrary {
  subjectId: string
  meta: {
    title: string
    source: string
    version: string
    generatedAt: string
    chapterCount: number
  }
  chapters: ChapterMeta[]
  subjectiveCount?: number
}

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
  render: 'screenshot'
  /** 知识块数量 */
  blockCount: number
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
  avgScore: string | null
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
  source: SourceRef
  status: '已核' | '待核' | '草稿'
  render: 'screenshot'
}

export interface Point {
  num: number
  title: string
  difficulty: string | null
  hot: number | null
  /** 该考点对应的原书知识块（图片文件名） */
  blocks: string[]
  examples: Example[]
  source: SourceRef
  status: '已核' | '待核' | '草稿'
  render: 'screenshot'
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
  pointsFramework: Array<{
    name: string
    difficulty: string | null
    hot: number | null
    section: string
  }>
  sections: Section[]
  exercises: Array<{ source: SourceRef; status: string }>
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

/* ---------- 用户补充层（与教材原文分离） ---------- */

/**
 * 用户对教材内容的修改与补充。
 *
 * 设计要点：**不改教材原文**，而是用 overlay 覆盖层保存用户的编辑。
 * 好处：
 *   1. 教材原文始终可回溯、可重新解析、可与用户修改对照
 *   2. 导出时能区分「教材原文」与「你的修改」
 *   3. 重新抽取教材不会丢用户数据（overlay 按 ID 匹配）
 */
export interface UserOverlay {
  /** 改写后的考点名称（仅在用户显式改写时存在） */
  title?: string
  /** 用户自己的解析、思路、易错点 */
  notes?: string
  /** 用户记的答案 */
  answer?: string
  /** 用户记的卡点 */
  blocker?: string
  /** 是否已按原书核对 */
  verified?: boolean
  updatedAt: string
}

/** 用户自加的题目 */
export interface UserQuestion {
  id: string
  /** 归属考点 */
  pointId: string
  /** 所属章节 */
  chapterId: string
  chapterNum: number
  type: '单选题' | '多选题' | '计算分析题' | '综合题'
  stem: string
  options: string[]
  answer: string
  analysis: string
  /** 来源：手录 or 从截图 OCR */
  origin: 'manual' | 'ocr'
  createdAt: string
  updatedAt: string
}

/** 主观题训练记录 */
export interface SubjectiveNote {
  /** 专题 ID */
  topicId: string
  topicTitle: string
  /** 手写训练正文（Tiptap JSON 字符串） */
  content: string
  /** 自评档位 */
  rating: 'none' | 'partial' | 'correct'
  updatedAt: string
}

/**
 * 习题作答记录。
 *
 * key = 章节ID + 习题页码（如 ch01-p43），
 * 因为教材的习题按页排布，一页可能含多道题 —— 用户自己在编辑器里分题写。
 */
export interface ExerciseAnswer {
  /** 所属章节 */
  chapterId: string
  /** 习题所在 PDF 页码 */
  page: number
  /** 册别 */
  volume: string
  /** 印刷页码 */
  printPage: number
  /** 作答正文（Tiptap JSON 字符串）—— 可含文字、表格、图片、高亮、颜色 */
  content: string
  updatedAt: string
}

export interface LearningState {
  reviews: Record<string, ReviewState>
  wrongBook: Record<string, WrongItem>
  /** 主观题自评记录 */
  subjective: Record<string, 'none' | 'partial' | 'correct'>
  updatedAt: string
}

/**
 * 批注。
 *
 * 挂在教材的具体位置：某个考点、某道例题、某个章节。
 * 汇总显示时按 科目 → 章 → 节 → 考点 归类，不按时间排序。
 */
export interface Annotation {
  id: string
  /** 归属科目 */
  subjectId: string
  /** 归属章节（章级批注可为空） */
  chapterId: string | null
  /** 归属考点（章级批注可为空） */
  pointId: string | null
  /** 归属例题（可为空） */
  exampleId: string | null
  /** 批注正文（富文本 JSON） */
  content: string
  /** 一句话标题（列表里显示） */
  title: string
  /** 标签 */
  tags: string[]
  /** 来源页码（点击可跳到原书） */
  source: {
    volume: string
    pdfPage: number
    printPage: number
  } | null
  createdAt: string
  updatedAt: string
}

/** 用户数据（与学习状态一起同步到云端） */
export interface UserData {
  /** 教材内容覆盖层：key = 考点ID */
  overlays: Record<string, UserOverlay>
  /** 批注：key = 批注 ID */
  annotations: Record<string, Annotation>
  /** 用户自加题目 */
  questions: UserQuestion[]
  /** 主观题训练记录 */
  subjectiveNotes: Record<string, SubjectiveNote>
  /** 习题作答记录：key = 章节ID-p页码 */
  exerciseAnswers: Record<string, ExerciseAnswer>
  /** 主观题专题（从下册第三部分解析） */
  subjectiveTopics: Array<{
    id: string
    num: number
    title: string
    source: SourceRef
  }>
  updatedAt: string
}

export const EMPTY_LEARNING: LearningState = {
  reviews: {},
  wrongBook: {},
  subjective: {},
  updatedAt: '',
}

export const EMPTY_USER_DATA: UserData = {
  overlays: {},
  annotations: {},
  questions: [],
  subjectiveNotes: {},
  subjectiveTopics: [],
  exerciseAnswers: {},
  updatedAt: '',
}

/**
 * 考点唯一 ID。
 *
 * 必须带节号 —— 教材的考点编号是「每节重新从 01 开始」，
 * 只用 (章, 考点号) 会在同一章的不同节之间冲突
 * （第 1 节的考点01 与第 2 节的考点01 编号相同）。
 */
export function pointId(
  chapterId: string,
  sectionNum: number,
  pointNum: number,
): string {
  return `${chapterId}-s${String(sectionNum).padStart(2, '0')}-p${String(pointNum).padStart(2, '0')}`
}

/** 例题唯一 ID */
export function exampleId(
  chapterId: string,
  sectionNum: number,
  pointNum: number,
  exNo: number,
): string {
  return `${pointId(chapterId, sectionNum, pointNum)}-e${exNo}`
}

/** 解析考点 ID → { chapterId, sectionNum, pointNum } */
export function parsePointId(pid: string): {
  chapterId: string
  sectionNum: number
  pointNum: number
} | null {
  const m = pid.match(/^(.+)-s(\d+)-p(\d+)$/)
  if (!m) return null
  return {
    chapterId: m[1],
    sectionNum: Number(m[2]),
    pointNum: Number(m[3]),
  }
}
