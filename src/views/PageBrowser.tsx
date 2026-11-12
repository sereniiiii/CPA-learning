import { useEffect, useState } from 'react'
import { learningApi } from '../api'

const VOL_MAP: Record<string, string> = { 上册: 'up', 中册: 'mid', 下册: 'down' }

/** 册别代码 → 显示名 */
const VOL_LABEL: Record<string, string> = { up: '上册', mid: '中册', down: '下册' }

/**
 * 原书页浏览器。
 *
 * 教材正文一律以原书截图呈现 —— OCR 文字层不可信，
 * 涉及公式与数值的部分必须对照原书（设计文档 4.1）。
 * 这个组件提供连续翻页 + 键盘翻页 + 点击放大。
 */
export function PageBrowser({
  volume,
  startPage,
  title,
  subtitle,
  onClose,
}: {
  volume: string
  startPage: number
  title: string
  subtitle?: string
  onClose?: () => void
}) {
  const [page, setPage] = useState(startPage)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [zoomed, setZoomed] = useState(false)

  const vol = VOL_MAP[volume] ?? 'up'
  const name = `${vol}-${String(page).padStart(4, '0')}.jpg`

  useEffect(() => {
    setLoaded(false)
    setFailed(false)
  }, [page])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (zoomed) {
        if (e.key === 'Escape') setZoomed(false)
        return
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setPage((p) => p + 1)
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') setPage((p) => Math.max(1, p - 1))
      if (e.key === 'Escape' && onClose) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomed, onClose])

  return (
    <>
      <div className="shot-panel">
        <div className="shot-panel-head">
          <span className="label">{title}</span>
          {subtitle && <span className="muted small">{subtitle}</span>}
          <div style={{ flex: 1 }} />
          <span className="muted small">
            {VOL_LABEL[vol]} · PDF 第 {page} 页
          </span>
          <button className="top-btn" onClick={() => setPage((p) => Math.max(1, p - 1))}>
            ← 上一页
          </button>
          <button className="top-btn" onClick={() => setPage((p) => p + 1)}>
            下一页 →
          </button>
          {onClose && (
            <button className="top-btn" onClick={onClose}>
              收起
            </button>
          )}
        </div>

        <div className="shot-panel-body">
          {failed ? (
            <p className="muted" style={{ textAlign: 'center', padding: '40px 0' }}>
              这一页的截图还没生成。
              <br />
              往前后翻一页通常就有。
            </p>
          ) : loaded ? (
            <figure className="shot">
              <img
                src={learningApi.shotUrl(name)}
                alt={`${VOL_LABEL[vol]} 第 ${page} 页`}
                onClick={() => setZoomed(true)}
                onError={() => setFailed(true)}
              />
              <figcaption>
                {VOL_LABEL[vol]} · PDF 第 {page} 页 · 点击放大，方向键翻页
              </figcaption>
            </figure>
          ) : (
            <button className="shot-load-btn" onClick={() => setLoaded(true)}>
              加载第 {page} 页原书截图
            </button>
          )}
        </div>
      </div>

      {zoomed && (
        <div className="lightbox" onClick={() => setZoomed(false)}>
          <img src={learningApi.shotUrl(name)} alt="" />
        </div>
      )}
    </>
  )
}

/**
 * 多页并排展示 —— 用于同步习题区（一章的习题跨多页）。
 */
export function PageGrid({
  volume,
  pages,
  title,
}: {
  volume: string
  pages: number[]
  title: string
}) {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <>
      <div className="shot-panel">
        <div className="shot-panel-head">
          <span className="label">{title}</span>
          <span className="muted small">共 {pages.length} 页 · 点击展开</span>
        </div>
        <div className="shot-panel-body">
          <div className="shot-grid">
            {pages.map((p) => (
              <button
                key={p}
                className="shot-load-btn"
                style={{ padding: '22px 12px' }}
                onClick={() => setOpen(p)}
              >
                第 {p} 页
              </button>
            ))}
          </div>
        </div>
      </div>

      {open !== null && (
        <PageBrowser
          volume={volume}
          startPage={open}
          title={title}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  )
}
