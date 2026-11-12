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
import { PageMeta, TextbookIndex } from './types'
import { useCloudSync } from './useCloudSync'
import { LibraryView } from './views/LibraryView'
import { TodayView } from './views/TodayView'
import { PointView } from './views/PointView'
import { SubjectiveView } from './views/SubjectiveView'
import { ArchiveView, ReviewView, WrongBookView } from './views/ReviewView'
import { MyNotes } from './views/MyNotes'

type Tab = 'today' | 'library' | 'subjective' | 'review' | 'wrong' | 'archive' | 'notes'

const TABS: Array<{ id: Tab; label: string; short: string }> = [
  { id: 'today', label: '今日', short: '今' },
  { id: 'library', label: '教材库', short: '库' },
  { id: 'subjective', label: '主观题', short: '主' },
  { id: 'review', label: '复习', short: '复' },
  { id: 'wrong', label: '错题本', short: '错' },
  { id: 'archive', label: '归档', short: '归' },
  { id: 'notes', label: '我的笔记', short: '记' },
]

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  const [tab, setTab] = useState<Tab>('today')
  const [index, setIndex] = useState<TextbookIndex | null>(null)
  const [openPoint, setOpenPoint] = useState<{ chapterId: string; pointNum: number } | null>(
    null,
  )
  const [openChapter, setOpenChapter] = useState<string | null>(null)

  const [myNotes, setMyNotes] = useState<PageMeta[]>([])
  const [activeNote, setActiveNote] = useState<PageMeta | null>(null)
  const [noteContent, setNoteContent] = useState('')
  const [noteTitle, setNoteTitle] = useState('')
  const [dirty, setDirty] = useState(false)
  const saveTimer = useRef<number | null>(null)

  const sync = useCloudSync(authed === true)
  const { learning, userData, setLearning, setUserData } = sync

  /* ---------- 启动 ---------- */
  useEffect(() => {
    checkSession().then(setAuthed)
  }, [])

  useEffect(() => {
    if (!authed) return
    learningApi.getIndex().then(setIndex).catch(() => {})
    listPages().then(setMyNotes).catch(() => {})
  }, [authed])

  /* ---------- 队列 ---------- */
  const queue = useMemo(() => {
    if (!index) return []
    return buildTodayQueue(learning, index.chapters, todayStr())
  }, [index, learning])

  const masteryOf = useCallback(
    (pid: string) => currentMastery(learning, pid, todayStr()),
    [learning],
  )
  const dueOf = useCallback((pid: string) => isDue(learning, pid, todayStr()), [learning])
  const wrongOf = useCallback((pid: string) => Boolean(learning.wrongBook[pid]), [learning])

  /* ---------- 我的笔记 ---------- */
  const flush = async () => {
    if (!activeNote) return
    try {
      await savePage(activeNote.id, noteTitle, noteContent)
      setDirty(false)
    } catch {
      /* 静默失败，下一次输入会重试 */
    }
  }

  const scheduleSave = () => {
    setDirty(true)
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => void flush(), 1200)
  }

  const openNote = async (p: PageMeta) => {
    if (dirty) await flush()
    const { content, meta } = await getPage(p.id)
    setActiveNote(meta)
    setNoteTitle(meta.title)
    setNoteContent(content)
    setDirty(false)
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
      // 把学习进度与用户数据一并带出去
      const full = {
        ...bundle,
        learning,
        userData,
      }
      const blob = new Blob([JSON.stringify(full, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cpa-learning-${todayStr()}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      console.error(err)
    }
  }

  const doImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const data = JSON.parse(await file.text()) as ExportBundle & {
        learning?: typeof learning
        userData?: typeof userData
      }
      const mode = window.confirm(
        `导入 ${data.pages?.length ?? 0} 篇笔记。\n\n确定 = 合并\n取消 = 完全还原`,
      )
        ? 'merge'
        : 'replace'
      await importAll(data, mode)
      if (data.learning) setLearning(data.learning)
      if (data.userData) setUserData(data.userData)
      setMyNotes(await listPages())
    } catch (err) {
      console.error(err)
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
          <p className="login-sub">2026 注会 · 财务成本管理</p>
          <input
            className="login-input"
            type="password"
            value={password}
            autoFocus
            onChange={(e) => setPassword(e.target.value)}
            placeholder="访问口令"
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
              title={t.label}
            >
              <span className="tab-text">{t.label}</span>
              {t.id === 'today' && queue.length > 0 && (
                <span className="tab-badge">{queue.length}</span>
              )}
              {t.id === 'wrong' && Object.keys(learning.wrongBook).length > 0 && (
                <span className="tab-badge">{Object.keys(learning.wrongBook).length}</span>
              )}
              {t.id === 'subjective' &&
                Object.keys(userData.subjectiveNotes).filter(
                  (k) => userData.subjectiveNotes[k].rating !== 'none',
                ).length > 0 && (
                  <span className="tab-badge">
                    {
                      Object.keys(userData.subjectiveNotes).filter(
                        (k) => userData.subjectiveNotes[k].rating !== 'none',
                      ).length
                    }
                  </span>
                )}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="foot-row">
            <span className="save-status">
              {sync.status === 'saving'
                ? '同步中'
                : sync.status === 'saved'
                  ? '已同步'
                  : sync.status === 'error'
                    ? '同步失败'
                    : sync.status === 'offline'
                      ? '离线（本地）'
                      : ''}
            </span>
            <div className="data-tools">
              <button className="tool-btn" onClick={doExport} title="导出全部数据为 JSON">
                导出
              </button>
              <label className="tool-btn" title="从 JSON 恢复">
                导入
                <input
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={doImport}
                />
              </label>
            </div>
          </div>
        </div>
      </aside>

      <main className="main">
        {openPoint ? (
          <div className="canvas">
            <PointView
              chapterId={openPoint.chapterId}
              pointNum={openPoint.pointNum}
              state={learning}
              userData={userData}
              onStateChange={setLearning}
              onUserDataChange={setUserData}
              onBack={() => setOpenPoint(null)}
              onOpenPoint={(c, p) => setOpenPoint({ chapterId: c, pointNum: p })}
            />
          </div>
        ) : tab === 'library' ? (
          <div className="split">
            <LibraryView
              index={index}
              activePoint={openPoint}
              openChapter={openChapter}
              onOpenChapter={(id) => setOpenChapter(openChapter === id ? null : id)}
              onOpenPoint={(c, p) => setOpenPoint({ chapterId: c, pointNum: p })}
              masteryOf={masteryOf}
              isDue={dueOf}
              isWrong={wrongOf}
            />
          </div>
        ) : tab === 'subjective' ? (
          <div className="split">
            <SubjectiveView userData={userData} onUserDataChange={setUserData} />
          </div>
        ) : tab === 'today' ? (
          <div className="canvas">
            <TodayView
              queue={queue}
              index={index}
              onOpenPoint={(c, p) => setOpenPoint({ chapterId: c, pointNum: p })}
              onStart={() => {
                const first = queue[0]
                if (first) setOpenPoint({ chapterId: first.chapterId, pointNum: first.pointNum })
              }}
            />
          </div>
        ) : tab === 'review' ? (
          <ReviewView state={learning} onOpenPoint={(c, p) => setOpenPoint({ chapterId: c, pointNum: p })} />
        ) : tab === 'wrong' ? (
          <WrongBookView state={learning} onOpenPoint={(c, p) => setOpenPoint({ chapterId: c, pointNum: p })} />
        ) : tab === 'archive' ? (
          <ArchiveView state={learning} onOpenPoint={(c, p) => setOpenPoint({ chapterId: c, pointNum: p })} />
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
              void flush()
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
