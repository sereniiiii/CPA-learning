import { useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { learningApi } from '../api'
import { UserData } from '../types'
import { RichEditor } from '../editor/Editor'

const VOL_MAP: Record<string, string> = { 上册: 'up', 中册: 'mid', 下册: 'down' }

/**
 * 习题工作台。
 *
 * 一页原书 + 一个答题框并排：
 *   左边看题（点击可放大），右边写解答。
 * 答题框支持文字、表格、图片、高亮、颜色 —— 内容以 Tiptap JSON 存储。
 */
export function ExerciseWorkbench({
  chapterId,
  pages,
  userData,
  onUserDataChange,
}: {
  chapterId: string
  pages: Array<{ source: { volume: string; pdfPage: number; printPage: number } }>
  userData: UserData
  onUserDataChange: (d: UserData) => void
}) {
  const [openPage, setOpenPage] = useState<number | null>(pages[0]?.source.pdfPage ?? null)

  if (pages.length === 0) return null

  return (
    <div className="workbench">
      {pages.map((ex) => {
        const key = `${chapterId}-p${ex.source.pdfPage}`
        const answer = userData.exerciseAnswers[key]
        const open = openPage === ex.source.pdfPage
        return (
          <div key={key} className="workbench-row">
            <button
              className={`workbench-tab${open ? ' is-open' : ''}`}
              onClick={() => setOpenPage(open ? null : ex.source.pdfPage)}
            >
              <span>
                {ex.source.volume} 印刷页 {ex.source.printPage}
              </span>
              <span className="workbench-tab-meta">
                {answer ? '已作答' : '未作答'}
                {answer ? ' ✓' : ''}
              </span>
            </button>

            {open && (
              <div className="workbench-body">
                <div className="workbench-left">
                  <ShotPanel
                    volume={ex.source.volume}
                    page={ex.source.pdfPage}
                    printPage={ex.source.printPage}
                  />
                </div>
                <div className="workbench-right">
                  <div className="workbench-right-head">
                    <span className="section-title">我的解答</span>
                    <span className="muted small">
                      可写文字、插表格、贴图片，用高亮和颜色标注关键步骤
                    </span>
                  </div>
                  <RichEditor
                    compact
                    content={answer?.content ?? ''}
                    placeholder={
                      '在这里写解答…\n提示：一页里通常有几道题，可以自己用「1. 」「2.」分开写'
                    }
                    onSave={() => {
                      /* 内容变更时已即时保存，这里无需额外动作 */
                    }}
                    onChange={(json: JSONContent) => {
                      const content = JSON.stringify(json)
                      onUserDataChange({
                        ...userData,
                        exerciseAnswers: {
                          ...userData.exerciseAnswers,
                          [key]: {
                            chapterId,
                            page: ex.source.pdfPage,
                            volume: ex.source.volume,
                            printPage: ex.source.printPage,
                            content,
                            updatedAt: new Date().toISOString(),
                          },
                        },
                        updatedAt: new Date().toISOString(),
                      })
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** 原书页 —— 点击放大 */
function ShotPanel({
  volume,
  page,
  printPage,
}: {
  volume: string
  page: number
  printPage: number
}) {
  const [zoomed, setZoomed] = useState(false)
  const [failed, setFailed] = useState(false)
  const vol = VOL_MAP[volume] ?? 'up'
  const name = `${vol}-${String(page).padStart(4, '0')}.jpg`

  return (
    <>
      {failed ? (
        <p className="muted small" style={{ padding: 20, textAlign: 'center' }}>
          这一页的截图暂不可用。
        </p>
      ) : (
        <figure className="shot">
          <img
            src={learningApi.shotUrl(name)}
            alt={`${volume} 印刷页 ${printPage}`}
            loading="lazy"
            onClick={() => setZoomed(true)}
            onError={() => setFailed(true)}
          />
          <figcaption>
            {volume} · 印刷页 {printPage} · 点击放大
          </figcaption>
        </figure>
      )}
      {zoomed && (
        <div className="lightbox" onClick={() => setZoomed(false)}>
          <img src={learningApi.shotUrl(name)} alt="" />
        </div>
      )}
    </>
  )
}
