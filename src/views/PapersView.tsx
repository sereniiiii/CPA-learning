import { useEffect, useState } from 'react'
import { learningApi } from '../api'
import { SourceTag } from './SourceTag'

interface PaperMeta {
  id: string
  title: string
  sourceLevel: string
  kind: string
  pageCount: number
}

interface PaperPage {
  image: string
  kind: string
  page: number
}

interface PaperDetail extends PaperMeta {
  pages: PaperPage[]
}

/**
 * 模考卷。
 *
 * 轻三 = 最后六套题（冲刺卷），轻二·套卷 = 模拟卷。
 * 跟章/考点结构不同 —— 整套卷连续做，所以单独一条通道。
 */
export function PapersView({ subjectId }: { subjectId: string }) {
  const [papers, setPapers] = useState<PaperMeta[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [detail, setDetail] = useState<PaperDetail | null>(null)
  const [pageIdx, setPageIdx] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setErr(null)
    setOpen(null)
    setDetail(null)
    fetch(`/api/textbook?kind=papers&subject=${encodeURIComponent(subjectId)}`, {
      credentials: 'include',
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setPapers(d.papers ?? []))
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false))
  }, [subjectId])

  useEffect(() => {
    if (!open) {
      setDetail(null)
      return
    }
    setPageIdx(0)
    fetch(
      `/api/textbook?kind=paper&id=${encodeURIComponent(open)}&subject=${encodeURIComponent(subjectId)}`,
      { credentials: 'include' },
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setDetail(d))
      .catch((e) => setErr(String(e)))
  }, [open, subjectId])

  if (loading) return <div className="view-loading">加载中…</div>
  if (err) return <div className="view-loading is-error">{err}</div>

  // ---------- 卷子详情 ----------
  if (open && detail) {
    const cur = detail.pages[pageIdx]
    return (
      <>
        <button className="back-btn" onClick={() => setOpen(null)}>
          ← 返回卷子列表
        </button>
        <div className="point-head">
          <div className="point-head-meta">
            <span>{detail.kind}</span>
            <span className="dot">·</span>
            <span>{detail.title}</span>
            <span className="dot">·</span>
            <span>共 {detail.pages.length} 页</span>
          </div>
          <h1 className="point-title">
            {detail.title} <SourceTag level={detail.sourceLevel} />
          </h1>
        </div>
        <div className="shot-panel">
          <div className="shot-panel-head">
            <span className="label">原卷</span>
            <span className="muted small">
              第 {pageIdx + 1} / {detail.pages.length} 页
              {cur?.kind === '答案' ? ' · 答案' : ''}
            </span>
            <div style={{ flex: 1 }} />
            <button
              className="top-btn"
              disabled={pageIdx <= 0}
              onClick={() => setPageIdx(pageIdx - 1)}
            >
              ← 上一页
            </button>
            <button
              className="top-btn"
              disabled={pageIdx >= detail.pages.length - 1}
              onClick={() => setPageIdx(pageIdx + 1)}
            >
              下一页 →
            </button>
          </div>
          <div className="shot-panel-body">
            {cur && (
              <figure className="shot">
                <img
                  src={learningApi.shotUrl(cur.image, subjectId)}
                  alt={`${detail.title} 第 ${pageIdx + 1} 页`}
                />
              </figure>
            )}
          </div>
        </div>
      </>
    )
  }

  // ---------- 卷子列表 ----------
  return (
    <div className="tree">
      <div className="tree-head">
        <p className="tree-title">模考卷</p>
        <p className="tree-sub">
          {papers.length} 套 · 轻三冲刺卷 + 轻二模拟卷
        </p>
      </div>
      <div className="tree-list">
        {papers.map((p) => (
          <button
            key={p.id}
            className="tree-chapter"
            onClick={() => setOpen(p.id)}
          >
            <span className="num">{p.kind === '冲刺卷' ? '冲' : '卷'}</span>
            <span style={{ flex: 1, minWidth: 0 }}>{p.title}</span>
            <SourceTag level={p.sourceLevel} compact />
            <span className="muted small">{p.pageCount} 页</span>
          </button>
        ))}
        {papers.length === 0 && (
          <p className="muted" style={{ padding: '20px' }}>
            该科目还没有模考卷。
          </p>
        )}
      </div>
    </div>
  )
}
