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
import { PageMeta, Subject, SubjectLibrary } from './types'
import { useCloudSync } from './useCloudSync'
import { LibraryView } from './views/LibraryView'
import { TodayView } from './views/TodayView'
import { PointView } from './views/PointView'
import { SubjectiveView } from './views/SubjectiveView'
import { ArchiveView, ReviewView, WrongBookView } from './views/ReviewView'
import { MyNotes } from './views/MyNotes'
import { AnnotationPanel } from './views/AnnotationPanel'
import { SubjectSwitcher } from './views/SubjectSwitcher'

type Tab = 'today' | 'library' | 'subjective' | 'anno' | 'review' | 'wrong' | 'archive' | 'notes'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'today', label: '今日' },
  { id: 'library', label: '教材库' },
  { id: 'subjective', label: '主观题' },
  { id: 'anno', label: '批注' },
  { id: 'review', label: '复习' },
  { id: 'wrong', label: '错题本' },
  { id: 'archive', label: '归档' },
  { id: 'notes', label: '我的笔记' },
]

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  const [tab, setTab] = useState<Tab>('today')
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [subjectId, setSubjectId] = useState('cwc')
  const [library, setLibrary] = useState<SubjectLibrary | null>(null)
  const [openPoint, setOpenPoint] = useState<{ chapterId: string; pointNum: number } | null>(
    null,
  )
  const [openChapter, setOpenChapter] = useState<string | null>(null)
  /** 窄屏下目录树抽屉是否展开 */
  const [treeOpen, setTreeOpen] = useState(false)

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
    learningApi
      .getSubjects()
      .then((list) => {
        setSubjects(list)
        if (list.length > 0 && !list.some((s) => s.id === subjectId)) {
          setSubjectId(list[0].id)
        }
      })
      .catch(() => {})
    listPages().then(setMyNotes).catch(() => {})
  }, [authed])

  // 切科目时重载内容库
  useEffect(() => {
    if (!authed) return
    setLibrary(null)
    setOpenPoint(null)
    setOpenChapter(null)
    learningApi
      .getIndex(subjectId)
      .then(setLibrary)
      .catch(() => {})
  }, [authed, subjectId])

  /* ---------- 队列 ---------- */
  const queue = useMemo(() => {
    if (!library) return []
    return buildTodayQueue(learning, library.chapters, todayStr())
  }, [library, learning])

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
      /* 静默失败 */
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
      const full = { ...bundle, learning, userData }
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
          <p className="login-sub">2026 注会 · 教材学习工作台</p>
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

  const currentSubject = subjects.find((s) => s.id === subjectId)
  const annoCount = Object.values(userData.annotations ?? {}).filter(
    (a) => a.subjectId === subjectId,
  ).length

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-head">
          <span className="sidebar-brand">CPA Learning</span>
          <button className="icon-btn" onClick={() => logout()} title="退出">
            ⎋
          </button>
        </div>

        <SubjectSwitcher
          subjects={subjects}
          current={subjectId}
          onChange={(id) => {
            setSubjectId(id)
            setTab('today')
          }}
        />

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
              {t.id === 'wrong' && Object.keys(learning.wrongBook ?? {}).length > 0 && (
                <span className="tab-badge">
                  {Object.keys(learning.wrongBook ?? {}).length}
                </span>
              )}
              {t.id === 'anno' && annoCount > 0 && (
                <span className="tab-badge">{annoCount}</span>
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
        {/* 窄屏：目录树改成抽屉，这里放开关 */}
        <button
          className="mobile-only tree-toggle-btn"
          onClick={() => setTreeOpen(true)}
          aria-label="打开目录"
        >
          ☰ 目录
        </button>
        {treeOpen && (
          <div className="tree-scrim" onClick={() => setTreeOpen(false)} />
        )}

        {openPoint ? (
          <div className="canvas">
            <PointView
              subjectId={subjectId}
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
              treeOpen={treeOpen}
              onTreeClose={() => setTreeOpen(false)}
              index={library}
              subjectId={subjectId}
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
            <SubjectiveView
              subjectId={subjectId}
              userData={userData}
              onUserDataChange={setUserData}
            />
          </div>
        ) : tab === 'anno' ? (
          <AnnotationPanel
            subjectId={subjectId}
            subject={
              currentSubject ?? { id: subjectId, name: subjectId, volumeCount: 0, chapterCount: 0, color: '#2f5fd0' }
            }
            chapters={library?.chapters ?? []}
            userData={userData}
            onUserDataChange={setUserData}
            onOpenPoint={(c, p) => setOpenPoint({ chapterId: c, pointNum: p })}
          />
        ) : tab === 'today' ? (
          <div className="canvas">
            <TodayView
              queue={queue}
              index={library}
              onOpenChapter={(id) => {
                setTab('library')
                setOpenChapter(id)
              }}
              onStart={() => {
                const first = queue[0]
                if (first) setOpenPoint({ chapterId: first.chapterId, pointNum: first.pointNum })
              }}
            />
          </div>
        ) : tab === 'review' ? (
          <ReviewView
            state={learning}
            onOpenPoint={(c, p) => setOpenPoint({ chapterId: c, pointNum: p })}
          />
        ) : tab === 'wrong' ? (
          <WrongBookView
            state={learning}
            onOpenPoint={(c, p) => setOpenPoint({ chapterId: c, pointNum: p })}
          />
        ) : tab === 'archive' ? (
          <ArchiveView
            state={learning}
            onOpenPoint={(c, p) => setOpenPoint({ chapterId: c, pointNum: p })}
          />
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
