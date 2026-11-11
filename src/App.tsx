import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { RichEditor } from './editor/Editor'
import {
  PageMeta,
  checkSession,
  createPage,
  deletePage,
  getPage,
  listPages,
  login,
  logout,
  savePage,
} from './api'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  const [pages, setPages] = useState<PageMeta[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [loading, setLoading] = useState(false)

  const contentRef = useRef<string>('')
  const titleRef = useRef<string>('')
  const saveTimer = useRef<number | null>(null)

  /* ---------- 启动 ---------- */
  useEffect(() => {
    checkSession().then(setAuthed)
  }, [])

  const loadPageList = useCallback(async (selectId?: string) => {
    const list = await listPages()
    setPages(list)
    if (selectId) {
      setActiveId(selectId)
    } else if (list.length > 0) {
      setActiveId((prev) => prev ?? list[0].id)
    }
    return list
  }, [])

  useEffect(() => {
    if (!authed) return
    loadPageList().catch(() => setSaveState('error'))
  }, [authed, loadPageList])

  useEffect(() => {
    if (!authed || !activeId) return
    let cancelled = false
    setLoading(true)
    getPage(activeId)
      .then((page) => {
        if (cancelled) return
        contentRef.current = page.content
        titleRef.current = page.meta.title
        setContent(page.content)
        setTitle(page.meta.title)
        setDirty(false)
      })
      .catch(() => {
        if (!cancelled) setSaveState('error')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [authed, activeId])

  /* ---------- 自动保存（防抖 1.2s） ---------- */
  const flushSave = useCallback(async () => {
    if (!activeId) return
    setSaveState('saving')
    try {
      const meta = await savePage(activeId, titleRef.current, contentRef.current)
      setPages((prev) => prev.map((p) => (p.id === meta.id ? meta : p)))
      setDirty(false)
      setSaveState('saved')
      setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 2000)
    } catch {
      setSaveState('error')
    }
  }, [activeId])

  const scheduleSave = useCallback(() => {
    setDirty(true)
    setSaveState('idle')
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      flushSave()
    }, 1200)
  }, [flushSave])

  const handleContentChange = useCallback(
    (json: JSONContent) => {
      contentRef.current = JSON.stringify(json)
      setContent(contentRef.current)
      scheduleSave()
    },
    [scheduleSave],
  )

  const handleTitleChange = useCallback(
    (value: string) => {
      titleRef.current = value
      setTitle(value)
      scheduleSave()
    },
    [scheduleSave],
  )

  /* ---------- 页面操作 ---------- */
  const handleCreate = async () => {
    const page = await createPage('未命名')
    await loadPageList(page.id)
    setTitle(page.title)
    titleRef.current = page.title
    contentRef.current = ''
    setContent('')
    setDirty(false)
  }

  const handleDelete = async (id: string) => {
    const target = pages.find((p) => p.id === id)
    if (!target) return
    if (!window.confirm(`删除「${target.title}」？此操作会记入 Git 历史，可回滚。`)) return
    await deletePage(id)
    const list = await loadPageList()
    if (activeId === id) {
      setActiveId(list.length > 0 ? list[0].id : null)
    }
  }

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

  const handleLogout = async () => {
    await logout()
    setAuthed(false)
    setPages([])
    setActiveId(null)
  }

  /* ---------- 渲染 ---------- */
  if (authed === null) {
    return <div className="boot" />
  }

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

  const statusText =
    saveState === 'saving'
      ? '保存中'
      : saveState === 'saved'
        ? '已保存'
        : saveState === 'error'
          ? '保存失败'
          : dirty
            ? '未保存'
            : ''

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-head">
          <span className="sidebar-brand">CPA Learning</span>
          <button className="icon-btn" onClick={handleLogout} title="退出">
            ⎋
          </button>
        </div>

        <button className="new-page" onClick={handleCreate}>
          <span>＋</span> 新建笔记
        </button>

        <nav className="page-list">
          {pages.length === 0 && <p className="page-list-empty">还没有笔记</p>}
          {pages.map((p) => (
            <div
              key={p.id}
              className={`page-item${p.id === activeId ? ' is-active' : ''}`}
              onClick={() => {
                if (dirty) flushSave()
                setActiveId(p.id)
              }}
            >
              <span className="page-title">{p.title}</span>
              <button
                className="page-del"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(p.id)
                }}
                title="删除"
              >
                ×
              </button>
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          {statusText && (
            <span className={`save-status is-${saveState}`}>{statusText}</span>
          )}
        </div>
      </aside>

      <main className="main">
        {activeId ? (
          <>
            <input
              className="title-input"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="无标题"
            />
            {loading ? (
              <div className="loading" />
            ) : (
              <RichEditor
                content={content}
                onChange={handleContentChange}
                onSave={flushSave}
              />
            )}
          </>
        ) : (
          <div className="empty-state">
            <p>左侧新建一篇笔记，或从下拉里选择已有内容。</p>
          </div>
        )}
      </main>
    </div>
  )
}
