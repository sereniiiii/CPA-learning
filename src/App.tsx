import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ExportBundle,
  checkSession,
  createPage,
  deletePage,
  exportAll,
  getPage,
  importAll,
  learningApi,
  listPages,
  login,
  logout,
  savePage,
} from './api'
import { buildTodayQueue, currentMastery, isDue, todayStr } from './learning'
import {
  EMPTY_LEARNING,
  LearningState,
  PageMeta,
  TextbookIndex,
} from './types'
import { LibraryView } from './views/LibraryView'
import { TodayView } from './views/TodayView'
import { PointView } from './views/PointView'
import { ArchiveView, ReviewView, WrongBookView } from './views/ReviewView'
import { MyNotes } from './views/MyNotes'

type Tab = 'today' | 'library' | 'review' | 'wrong' | 'archive' | 'notes'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'today', label: '今日' },
  { id: 'library', label: '库' },
  { id: 'review', label: '复习' },
  { id: 'wrong', label: '错题本' },
  { id: 'archive', label: '归档' },
  { id: 'notes', label: '我的笔记' },
]

const STATE_KEY = 'cpa-learning-state'

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  const [tab, setTab] = useState<Tab>('today')
  const [index, setIndex] = useState<TextbookIndex | null>(null)
  const [learnState, setLearnState] = useState<LearningState>(EMPTY_LEARNING)
  const [openPoint, setOpenPoint] = useState<{ chapterId: string; pointNum: number } | null>(null)
  const [myNotes, setMyNotes] = useState<PageMeta[]>([])
  const [activeNote, setActiveNote] = useState<PageMeta | null>(null)
  const [noteContent, setNoteContent] = useState('')
  const [noteTitle, setNoteTitle] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimer = useRef<number | null>(null)

  /* ---------- 启动 ---------- */
  useEffect(() => {
    checkSession().then(setAuthed)
    const saved = localStorage.getItem(STATE_KEY)
    if (saved) {
      try {
        setLearnState(JSON.parse(saved) as LearningState)
      } catch {
        /* 用空状态 */
      }
    }
  }, [])

  useEffect(() => {
    if (!authed) return
    learningApi.getIndex().then(setIndex).catch(() => {})
    listPages().then(setMyNotes).catch(() => {})
  }, [authed])

  // 学习进度落本地（换设备时可通过导出带走）
  useEffect(() => {
    if (!authed) return
    localStorage.setItem(STATE_KEY, JSON.stringify(learnState))
  }, [learnState, authed])

  const updateState = useCallback((s: LearningState) => setLearnState(s), [])

  /* ---------- 队列 ---------- */
  const queue = useMemo(() => {
    if (!index) return []
    return buildTodayQueue(learnState, index.chapters, todayStr())
  }, [index, learnState])

  const masteryOf = useCallback(
    (pid: string) => currentMastery(learnState, pid, todayStr()),
    [learnState],
  )
  const dueOf = useCallback(
    (pid: string) => isDue(learnState, pid, todayStr()),
    [learnState],
  )

  /* ---------- 我的笔记 ---------- */
  const openNote = async (p: PageMeta) => {
    if (dirty) await flush()
    const { content, meta } = await getPage(p.id)
    setActiveNote(meta)
    setNoteTitle(meta.title)
    setNoteContent(content)
    setDirty(false)
  }

  const flush = async () => {
    if (!activeNote) return
    setSaveState('saving')
    try {
      await savePage(activeNote.id, noteTitle, noteContent)
      setDirty(false)
      setSaveState('saved')
      setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 2000)
    } catch {
      setSaveState('error')
    }
  }

  const scheduleSave = () => {
    setDirty(true)
    setSaveState('idle')
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => flush(), 1200)
  }

  const createNote = async () => {
    const p = await createPage('未命名')
    setMyNotes((prev) => [...prev, p])
    setActiveNote(p)
    setNoteTitle(p.title)
    setNoteContent('')
    setDirty(false)
  }

  const removeNote = async (id: string) => {
    if (!window.confirm('删除这篇笔记？')) return
    await deletePage(id)
    setMyNotes((prev) => prev.filter((p) => p.id !== id))
    if (activeNote?.id === id) setActiveNote(null)
  }

  /* ---------- 导入导出 ---------- */
  const doExport = async () => {
    try {
      const bundle = await exportAll()
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cpa-learning-${todayStr()}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setSaveState('error')
    }
  }

  const doImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const bundle = JSON.parse(await file.text()) as ExportBundle
      const mode = window.confirm(
        `导入 ${bundle.pages?.length ?? 0} 篇笔记。\n\n确定 = 合并\n取消 = 完全还原`,
      )
        ? 'merge'
        : 'replace'
      await importAll(bundle, mode)
      setMyNotes(await listPages())
    } catch {
      setSaveState('error')
    }
  }

  /* ---------- 登录 ---------- */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoggingIn(true)
    setAuthError('')
    try {
      await login(password)
      setAuthed(true)
      setPassword('')
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setLoggingIn(false)
    }
  }

  if (authed === null) return <div className="boot" />

  if (!authed) {
    return (
      <div className="login-screen">
        <form className="login-card" onSubmit={handleLogin}>
          <h1 className="login-title">CPA Learning</h1>
          <p className="login-sub">请输入访问口令</p>
          <input
            className="login-input"
            type="password"
            value={password}
            autoFocus
            onChange={(e) => setPassword(e.target.value)}
            placeholder="口令"
          />
          {authError && <p className="login-error">{authError}</p>}
          <button className="login-btn" type="submit" disabled={loggingIn}>
            {loggingIn ? '验证中…' : '进入'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-head">
          <span className="sidebar-brand">CPA Learning</span>
          <button className="icon-btn" onClick={() => logout()} title="退出">
            ⎋
          </button>
        </div>

        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab${tab === t.id ? ' is-active' : ''}`}
              onClick={() => {
                setTab(t.id)
                setOpenPoint(null)
              }}
            >
              {t.label}
              {t.id === 'today' && queue.length > 0 && (
                <span className="tab-badge">{queue.length}</span>
              )}
              {t.id === 'wrong' && Object.keys(learnState.wrongBook).length > 0 && (
                <span className="tab-badge">
                  {Object.keys(learnState.wrongBook).length}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="foot-row">
            {saveState !== 'idle' && (
              <span className={`save-status is-${saveState}`}>
                {saveState === 'saving'
                  ? '保存中'
                  : saveState === 'saved'
                    ? '已保存'
                    : '保存失败'}
              </span>
            )}
            <div className="data-tools">
              <button className="tool-btn" onClick={doExport} title="导出全部数据为 JSON">
                导出
              </button>
              <label className="tool-btn" title="从 JSON 恢复">
                导入
                <input type="file" accept="application/json,.json" hidden onChange={doImport} />
              </label>
            </div>
          </div>
        </div>
      </aside>

      <main className="main">
        {openPoint ? (
          <PointView
            chapterId={openPoint.chapterId}
            pointNum={openPoint.pointNum}
            state={learnState}
            onStateChange={updateState}
            onBack={() => setOpenPoint(null)}
            onOpenPoint={(c, p) => setOpenPoint({ chapterId: c, pointNum: p })}
          />
        ) : tab === 'today' ? (
          <TodayView
            queue={queue}
            chapters={index?.chapters ?? []}
            onOpenPoint={(c, p) => setOpenPoint({ chapterId: c, pointNum: p })}
            onStart={() => {
              const first = queue[0]
              if (first) setOpenPoint({ chapterId: first.chapterId, pointNum: first.pointNum })
            }}
          />
        ) : tab === 'library' ? (
          <LibraryView
            onOpenPoint={(c, p) => setOpenPoint({ chapterId: c, pointNum: p })}
            masteryOf={masteryOf}
            isDue={dueOf}
          />
        ) : tab === 'review' ? (
          <ReviewView state={learnState} onOpenPoint={(c, p) => setOpenPoint({ chapterId: c, pointNum: p })} />
        ) : tab === 'wrong' ? (
          <WrongBookView state={learnState} onOpenPoint={(c, p) => setOpenPoint({ chapterId: c, pointNum: p })} />
        ) : tab === 'archive' ? (
          <ArchiveView state={learnState} onOpenPoint={(c, p) => setOpenPoint({ chapterId: c, pointNum: p })} />
        ) : (
          <MyNotes
            notes={myNotes}
            active={activeNote}
            title={noteTitle}
            content={noteContent}
            dirty={dirty}
            onOpen={openNote}
            onCreate={createNote}
            onRemove={removeNote}
            onBack={() => {
              flush()
              setActiveNote(null)
            }}
            onTitleChange={(v) => {
              setNoteTitle(v)
              scheduleSave()
            }}
            onContentChange={(v) => {
              setNoteContent(v)
              scheduleSave()
            }}
          />
        )}
      </main>
    </div>
  )
}
