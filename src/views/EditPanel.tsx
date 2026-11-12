import { useEffect, useState } from 'react'
import { UserOverlay, UserQuestion } from '../types'

interface OverlayProps {
  pid: string
  overlay: UserOverlay | undefined
  /** 教材原文，用于「改写原文」时对照 */
  originalTitle: string
  originalBody: string
  onChange: (o: UserOverlay) => void
}

/**
 * 考点编辑面板。
 *
 * 四种编辑（用户要求「都要」）：
 *   1. 改写原文（title / body）—— 覆盖层，不动教材原文
 *   2. 写自己的解析与笔记（notes）
 *   3. 记答案（answer）
 *   4. 记卡点（blocker）
 *
 * 另有「已按原书核对」标记（文档 7.3 的 status 字段）。
 */
export function OverlayEditor({
  pid,
  overlay,
  originalTitle,
  originalBody,
  onChange,
}: OverlayProps) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'notes' | 'answer' | 'rewrite'>('notes')
  const [draft, setDraft] = useState<OverlayState>(emptyOverlay())

  useEffect(() => {
    setDraft(overlay ? { ...overlay } : emptyOverlay())
  }, [overlay, pid])

  const commit = (patch: Partial<OverlayState>) => {
    const next: UserOverlay = {
      ...draft,
      ...patch,
      updatedAt: new Date().toISOString(),
    }
    setDraft(next)
    onChange(next)
  }

  const edited = Boolean(
    overlay &&
      (overlay.title !== undefined ||
        overlay.body !== undefined ||
        overlay.notes ||
        overlay.answer ||
        overlay.blocker),
  )

  return (
    <div className="overlay-editor">
      <div className="overlay-bar">
        <button className="material-btn" onClick={() => setOpen((v) => !v)}>
          {open ? '收起编辑' : edited ? '编辑（已修改）' : '编辑 / 补充'}
        </button>
        {overlay?.verified && <span className="badge badge-ok">已核</span>}
        {edited && !overlay?.verified && <span className="badge badge-todo">待核</span>}
        {overlay?.updatedAt && (
          <span className="muted small">更新于 {overlay.updatedAt.slice(0, 16).replace('T', ' ')}</span>
        )}
      </div>

      {open && (
        <div className="overlay-body">
          <div className="overlay-tabs">
            <button
              className={`overlay-tab${tab === 'notes' ? ' is-on' : ''}`}
              onClick={() => setTab('notes')}
            >
              解析笔记
            </button>
            <button
              className={`overlay-tab${tab === 'answer' ? ' is-on' : ''}`}
              onClick={() => setTab('answer')}
            >
              答案与卡点
            </button>
            <button
              className={`overlay-tab${tab === 'rewrite' ? ' is-on' : ''}`}
              onClick={() => setTab('rewrite')}
            >
              改写原文
            </button>
          </div>

          {tab === 'notes' && (
            <div className="overlay-pane">
              <label className="field-label">我的解析 / 思路 / 易错点</label>
              <textarea
                className="overlay-textarea"
                value={draft.notes ?? ''}
                placeholder="用自己的话写一遍，比读十遍有用。"
                onChange={(e) => commit({ notes: e.target.value })}
              />
            </div>
          )}

          {tab === 'answer' && (
            <div className="overlay-pane">
              <label className="field-label">答案</label>
              <input
                className="overlay-input"
                value={draft.answer ?? ''}
                placeholder="如：BCD"
                onChange={(e) => commit({ answer: e.target.value })}
              />
              <label className="field-label">我卡在哪</label>
              <textarea
                className="overlay-textarea is-short"
                value={draft.blocker ?? ''}
                placeholder="如：把边际贡献和变动成本混淆了"
                onChange={(e) => commit({ blocker: e.target.value })}
              />
            </div>
          )}

          {tab === 'rewrite' && (
            <div className="overlay-pane">
              <div className="rewrite-note">
                改写只覆盖显示，教材原文仍然保留在内容库里，随时可以还原。
              </div>
              <label className="field-label">考点名称（改写后）</label>
              <input
                className="overlay-input"
                value={draft.title ?? originalTitle}
                placeholder={originalTitle}
                onChange={(e) => commit({ title: e.target.value || undefined })}
              />
              <label className="field-label">正文（改写后）</label>
              <textarea
                className="overlay-textarea"
                value={draft.body ?? originalBody}
                placeholder={originalBody.slice(0, 120)}
                onChange={(e) => commit({ body: e.target.value || undefined })}
              />
              {(draft.title || draft.body) && (
                <button
                  className="tool-btn"
                  onClick={() => commit({ title: undefined, body: undefined })}
                >
                  还原为教材原文
                </button>
              )}
            </div>
          )}

          <label className="verify-line">
            <input
              type="checkbox"
              checked={draft.verified ?? false}
              onChange={(e) => commit({ verified: e.target.checked })}
            />
            <span>已对照原书核对过（含公式与数值的必核）</span>
          </label>
        </div>
      )}
    </div>
  )
}

interface OverlayState extends Omit<UserOverlay, 'updatedAt'> {
  updatedAt?: string
}

function emptyOverlay(): OverlayState {
  return { updatedAt: new Date().toISOString() }
}

/* ---------- 自加题目 ---------- */

interface QuestionEditorProps {
  question: UserQuestion | null
  onSave: (q: UserQuestion) => void
  onCancel: () => void
}

export function QuestionEditor({ question, onSave, onCancel }: QuestionEditorProps) {
  const [draft, setDraft] = useState<UserQuestion>(
    question ?? {
      id: '',
      pointId: '',
      chapterId: '',
      chapterNum: 0,
      type: '单选题',
      stem: '',
      options: ['', '', '', ''],
      answer: '',
      analysis: '',
      origin: 'manual',
      createdAt: '',
      updatedAt: '',
    },
  )

  const setOption = (i: number, v: string) => {
    const options = [...draft.options]
    options[i] = v
    setDraft({ ...draft, options })
  }

  const isChoice = draft.type === '单选题' || draft.type === '多选题'

  return (
    <div className="q-editor">
      <div className="q-editor-head">
        <h4>自加题目</h4>
        <select
          className="overlay-input is-inline"
          value={draft.type}
          onChange={(e) =>
            setDraft({ ...draft, type: e.target.value as UserQuestion['type'] })
          }
        >
          <option>单选题</option>
          <option>多选题</option>
          <option>计算分析题</option>
          <option>综合题</option>
        </select>
      </div>

      <label className="field-label">题干</label>
      <textarea
        className="overlay-textarea"
        value={draft.stem}
        placeholder="题干"
        onChange={(e) => setDraft({ ...draft, stem: e.target.value })}
      />

      {isChoice && (
        <>
          <label className="field-label">选项</label>
          {draft.options.map((o, i) => (
            <div key={i} className="q-option-row">
              <span className="q-option-label">{String.fromCharCode(65 + i)}</span>
              <input
                className="overlay-input"
                value={o}
                onChange={(e) => setOption(i, e.target.value)}
              />
            </div>
          ))}
          <div className="q-option-actions">
            {draft.options.length < 6 && (
              <button
                className="tool-btn"
                onClick={() => setDraft({ ...draft, options: [...draft.options, ''] })}
              >
                + 选项
              </button>
            )}
            {draft.options.length > 2 && (
              <button
                className="tool-btn"
                onClick={() => setDraft({ ...draft, options: draft.options.slice(0, -1) })}
              >
                − 删除
              </button>
            )}
          </div>
        </>
      )}

      <label className="field-label">答案</label>
      <input
        className="overlay-input"
        value={draft.answer}
        placeholder={isChoice ? '如：BCD' : '如：见解析'}
        onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
      />

      <label className="field-label">解析</label>
      <textarea
        className="overlay-textarea is-short"
        value={draft.analysis}
        onChange={(e) => setDraft({ ...draft, analysis: e.target.value })}
      />

      <div className="answer-row">
        <button
          className="answer-btn is-correct"
          onClick={() =>
            onSave({
              ...draft,
              id: draft.id || `uq-${Date.now().toString(36)}`,
              createdAt: draft.createdAt || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            })
          }
        >
          保存
        </button>
        <button className="answer-btn" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  )
}
