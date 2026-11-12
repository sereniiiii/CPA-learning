import { useCallback, useEffect, useRef, useState } from 'react'
import { EMPTY_LEARNING, EMPTY_USER_DATA, LearningState, UserData } from './types'

const LOCAL_KEY = 'cpa-learning-state'
const LOCAL_USER_KEY = 'cpa-user-data'
const SYNC_DEBOUNCE = 1500

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
export function useCloudSync(enabled: boolean): CloudSync {
  const [learning, setLearningState] = useState<LearningState>(EMPTY_LEARNING)
  const [userData, setUserDataState] = useState<UserData>(EMPTY_USER_DATA)
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)

  const timer = useRef<number | null>(null)
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
        setLearningState(JSON.parse(localLearning) as LearningState)
      } catch {
        /* 用空状态 */
      }
    }
    if (localUser) {
      try {
        setUserDataState(JSON.parse(localUser) as UserData)
      } catch {
        /* 用空状态 */
      }
    }

    fetch('/api/userdata')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        if (data.learning) setLearningState(data.learning)
        if (data.userData) setUserDataState(data.userData)
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

  const flush = useCallback(async () => {
    const data = pending.current
    if (!data) return
    pending.current = null
    setStatus('saving')
    try {
      const res = await fetch('/api/userdata', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error(`同步失败（${res.status}）`)
      setStatus('saved')
      setLastSyncedAt(new Date().toISOString())
      setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 2000)
    } catch {
      setStatus('error')
    }
  }, [])

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
        navigator.sendBeacon?.('/api/userdata', blob)
      }
    }
    window.addEventListener('pagehide', onLeave)
    return () => window.removeEventListener('pagehide', onLeave)
  }, [])

  return { learning, userData, setLearning, setUserData, status, lastSyncedAt, flush }
}
