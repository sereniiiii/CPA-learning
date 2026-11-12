import { useCallback, useEffect, useRef, useState } from 'react'
import { EMPTY_LEARNING, EMPTY_USER_DATA, LearningState, UserData } from './types'

const LOCAL_KEY = 'cpa-learning-state'
const LOCAL_USER_KEY = 'cpa-user-data'
// 防抖时长：连续答题时合并成一次写。
// 原来 1.5 秒 → 每答一题就是一次 commit + 一次 API 调用；
// 4 秒能覆盖大多数连续作答，又不至于让「关页面就丢」。
const SYNC_DEBOUNCE = 4000

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error' | 'offline'

export interface CloudSync {
  learning: LearningState
  userData: UserData
  setLearning: (s: LearningState) => void
  setUserData: (d: UserData) => void
  status: SyncStatus
  lastSyncedAt: string | null
  /** 强制立即同步 */
  flush: () => Promise<void>
}

/**
 * 学习数据云端同步。
 *
 * 策略：本地立即生效（不等网络），防抖后写云端。
 * 云端是唯一真相源 —— 换设备时从这里拉。
 * 断网时降级为纯本地，不阻塞使用。
 */
/**
 * 补全学习状态字段。
 *
 * 云端数据可能是旧版本结构 —— 字段缺失时补空值，
 * 否则前端 Object.values(undefined) 会让整页白屏。
 */
function normalizeLearning(raw: Partial<LearningState> | null): LearningState {
  return {
    ...EMPTY_LEARNING,
    ...(raw ?? {}),
    reviews: raw?.reviews ?? {},
    wrongBook: raw?.wrongBook ?? {},
    subjective: raw?.subjective ?? {},
  }
}

/** 补全用户数据字段（同上，防白屏） */
function normalizeUserData(raw: Partial<UserData> | null): UserData {
  return {
    ...EMPTY_USER_DATA,
    ...(raw ?? {}),
    overlays: raw?.overlays ?? {},
    annotations: raw?.annotations ?? {},
    questions: raw?.questions ?? [],
    subjectiveNotes: raw?.subjectiveNotes ?? {},
    subjectiveTopics: raw?.subjectiveTopics ?? [],
    exerciseAnswers: raw?.exerciseAnswers ?? {},
  }
}

export function useCloudSync(enabled: boolean): CloudSync {
  const [learning, setLearningState] = useState<LearningState>(EMPTY_LEARNING)
  const [userData, setUserDataState] = useState<UserData>(EMPTY_USER_DATA)
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)

  const timer = useRef<number | null>(null)
  const retryTimer = useRef<number | null>(null)
  const pending = useRef<{ learning: LearningState; userData: UserData } | null>(null)
  const loaded = useRef(false)

  // 首次加载：先读本地（秒开），再从云端拉最新并覆盖
  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const localLearning = localStorage.getItem(LOCAL_KEY)
    const localUser = localStorage.getItem(LOCAL_USER_KEY)
    if (localLearning) {
      try {
        setLearningState(normalizeLearning(JSON.parse(localLearning)))
      } catch {
        /* 用空状态 */
      }
    }
    if (localUser) {
      try {
        setUserDataState(normalizeUserData(JSON.parse(localUser)))
      } catch {
        /* 用空状态 */
      }
    }

    fetch('/api/userdata')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        // 必须做字段补全 —— 云端存的是旧版本结构，
        // 缺字段直接覆盖会让 Object.values(undefined) 崩掉（整页白屏）。
        if (data.learning) setLearningState(normalizeLearning(data.learning))
        if (data.userData) setUserDataState(normalizeUserData(data.userData))
        loaded.current = true
        setLastSyncedAt(new Date().toISOString())
      })
      .catch(() => {
        // 云端不可达 → 纯本地模式
        if (!cancelled) {
          loaded.current = true
          setStatus('offline')
        }
      })

    return () => {
      cancelled = true
    }
  }, [enabled])

  /**
   * 写云端。
   *
   * 注意：**失败时不能清空 pending** —— 之前是先清空再写，
   * 一旦网络抖动，那次作答就彻底丢了（本地有但云端没有）。
   * 现在失败会保留 pending 并在 6 秒后重试。
   */
  const flush = useCallback(async () => {
    const data = pending.current
    if (!data) return
    setStatus('saving')
    try {
      const res = await fetch('/api/userdata', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error(`同步失败（${res.status}）`)
      // 只有成功才清 pending（且要确认期间没有新的改动）
      if (pending.current === data) pending.current = null
      setStatus('saved')
      setLastSyncedAt(new Date().toISOString())
      setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 2000)
    } catch {
      setStatus('error')
      // 保留 pending，稍后重试
      if (retryTimer.current) window.clearTimeout(retryTimer.current)
      retryTimer.current = window.setTimeout(() => {
        void flushRef.current?.()
      }, 6000)
    }
  }, [])

  // flush 自己引用自己（重试），用 ref 打破循环依赖
  const flushRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    flushRef.current = () => void flush()
  }, [flush])

  const schedule = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      void flush()
    }, SYNC_DEBOUNCE)
  }, [flush])

  const setLearning = useCallback(
    (s: LearningState) => {
      setLearningState(s)
      localStorage.setItem(LOCAL_KEY, JSON.stringify(s))
      pending.current = { learning: s, userData: pending.current?.userData ?? userData }
      schedule()
    },
    [schedule, userData],
  )

  const setUserData = useCallback(
    (d: UserData) => {
      setUserDataState(d)
      localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(d))
      pending.current = { learning: pending.current?.learning ?? learning, userData: d }
      schedule()
    },
    [schedule, learning],
  )

  // 页面关闭前尽力同步
  useEffect(() => {
    const onLeave = () => {
      if (pending.current) {
        const blob = new Blob(
          [JSON.stringify(pending.current)],
          { type: 'application/json' },
        )
        const ok = navigator.sendBeacon?.('/api/userdata', blob)
        if (ok) pending.current = null
      }
    }
    window.addEventListener('pagehide', onLeave)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') onLeave()
    })
    return () => window.removeEventListener('pagehide', onLeave)
  }, [])

  return { learning, userData, setLearning, setUserData, status, lastSyncedAt, flush }
}
