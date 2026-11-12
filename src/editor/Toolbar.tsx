import { useState } from 'react'
import type { Editor } from '@tiptap/react'

interface ToolbarProps {
  editor: Editor
  onPickImage: () => void
  uploadState: 'idle' | 'uploading' | 'error'
  /** 紧凑模式：只保留高频按钮，其余收进「更多」 */
  compact?: boolean
}

/** 高亮色板 —— 荧光笔效果 */
const HIGHLIGHT_COLORS = [
  { color: '#ffe58a', name: '黄' },
  { color: '#b8f2c6', name: '绿' },
  { color: '#bfe0ff', name: '蓝' },
  { color: '#ffc9d9', name: '粉' },
]

/** 文字颜色板 */
const TEXT_COLORS = [
  { color: '#12161c', name: '默认' },
  { color: '#b32334', name: '红' },
  { color: '#9a5b00', name: '橙' },
  { color: '#0b7a4b', name: '绿' },
  { color: '#2f5fd0', name: '蓝' },
  { color: '#6b3ba8', name: '紫' },
]

/**
 * 图标集。
 *
 * 全部用 SVG 而不是字符 —— 字符（•— 1. ☑ ” </>）在不同字体下粗细不一、
 * 基线不齐，挤在一起就是一团噪点。SVG 描边统一，视觉重量一致。
 */
const ICONS = {
  bold: (
    <>
      <path d="M6 4h6.5a3.5 3.5 0 0 1 0 7H6z" />
      <path d="M6 11h7.5a3.5 3.5 0 0 1 0 7H6z" />
    </>
  ),
  italic: <path d="M10 4h6M8 18h6M14 4l-4 14" />,
  strike: (
    <>
      <path d="M4 11h14" />
      <path d="M13 6.5C12.6 5.2 11.2 4.5 9.5 4.5 7.5 4.5 6 5.7 6 7.4c0 1 .6 1.8 1.6 2.3" />
      <path d="M9 15.4c.4 1.6 1.9 2.6 3.8 2.6 2.2 0 3.7-1.2 3.7-3" />
    </>
  ),
  code: <path d="M8 7l-4 5 4 5M14 7l4 5-4 5" />,
  h1: <path d="M4 5v12M11 5v12M4 11h7M16 9l2-1.5V17" />,
  h2: <path d="M4 5v12M11 5v12M4 11h7M15 9a2 2 0 0 1 4 0c0 2-4 3.5-4 6h4" />,
  bullet: (
    <>
      <circle cx="5" cy="7" r="1.4" />
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="5" cy="17" r="1.4" />
      <path d="M10 7h9M10 12h9M10 17h9" />
    </>
  ),
  ordered: (
    <>
      <path d="M3 6h2M3 11h2M3 16h2M7 6h9M7 11h9M7 16h9" />
    </>
  ),
  task: (
    <>
      <path d="M9 6.5l2 2 4-4" />
      <path d="M9 12.5l2 2 4-4" />
      <path d="M3 6.5h2M3 12.5h2M3 18.5h2" />
    </>
  ),
  quote: (
    <>
      <path d="M6 6c-2 0-3 1.6-3 3.6 0 1.8 1 3 2.4 3 1 0 1.8-.6 2-1.5" />
      <path d="M16 6c-2 0-3 1.6-3 3.6 0 1.8 1 3 2.4 3 1 0 1.8-.6 2-1.5" />
      <path d="M5.4 11v4.5c0 1.2.9 2 2.1 2h1.1" />
      <path d="M15.4 11v4.5c0 1.2.9 2 2.1 2h1.1" />
    </>
  ),
  table: (
    <>
      <rect x="3.5" y="4.5" width="15" height="13" rx="1.5" />
      <path d="M3.5 9.5h15M3.5 14.5h15M9 4.5v13M14 4.5v13" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="5" width="15" height="12" rx="1.8" />
      <circle cx="8.5" cy="9.5" r="1.4" />
      <path d="M4.5 15.5l4-4 3 3 2.5-2.5 4 4" />
    </>
  ),
  link: (
    <>
      <path d="M9.5 13.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5L11 7" />
      <path d="M12.5 8.5a3.5 3.5 0 0 0-5 0L5 11a3.5 3.5 0 0 0 5 5l1-1" />
    </>
  ),
  undo: (
    <>
      <path d="M8 7L4 11l4 4" />
      <path d="M4 11h9a5 5 0 0 1 0 10h-2" />
    </>
  ),
  redo: (
    <>
      <path d="M14 7l4 4-4 4" />
      <path d="M18 11H9a5 5 0 0 0 0 10h2" />
    </>
  ),
}

function Icon({ d, size = 16 }: { d: React.ReactNode; size?: number }) {
  return (
    <svg
      className="tb-icon"
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {d}
    </svg>
  )
}

export function Toolbar({
  editor,
  onPickImage,
  uploadState,
  compact = false,
}: ToolbarProps) {
  const [tableOpen, setTableOpen] = useState(false)
  const [highlightOpen, setHighlightOpen] = useState(false)
  const [colorOpen, setColorOpen] = useState(false)

  const btn = (active: boolean) => `tb-btn${active ? ' is-active' : ''}`

  return (
    <div className="toolbar">
      {/* 文字样式 */}
      <div className="tb-group">
        <button
          type="button"
          className={btn(editor.isActive('bold'))}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="加粗 ⌘B"
        >
          <Icon d={ICONS.bold} />
        </button>
        <button
          type="button"
          className={btn(editor.isActive('italic'))}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="斜体 ⌘I"
        >
          <Icon d={ICONS.italic} />
        </button>
        <button
          type="button"
          className={btn(editor.isActive('strike'))}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="删除线"
        >
          <Icon d={ICONS.strike} />
        </button>

        {/* 高亮 */}
        <div className="tb-pop-wrap">
          <button
            type="button"
            className={btn(editor.isActive('highlight'))}
            onClick={() => {
              setHighlightOpen((v) => !v)
              setColorOpen(false)
            }}
            title="高亮"
          >
            <span className="tb-icon-highlight">
              <Icon d={ICONS.bold} />
            </span>
          </button>
          {highlightOpen && (
            <div className="tb-pop tb-pop--colors">
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.color}
                  type="button"
                  className="tb-color"
                  style={{ background: c.color }}
                  title={c.name}
                  onClick={() => {
                    editor
                      .chain()
                      .focus()
                      .toggleHighlight({ color: c.color })
                      .run()
                    setHighlightOpen(false)
                  }}
                />
              ))}
              <button
                type="button"
                className="tb-color tb-color--clear"
                title="清除高亮"
                onClick={() => {
                  editor.chain().focus().unsetHighlight().run()
                  setHighlightOpen(false)
                }}
              >
                <Icon d={ICONS.strike} size={12} />
              </button>
            </div>
          )}
        </div>

        {/* 文字颜色 */}
        <div className="tb-pop-wrap">
          <button
            type="button"
            className={btn(!!editor.getAttributes('textStyle').color)}
            onClick={() => {
              setColorOpen((v) => !v)
              setHighlightOpen(false)
            }}
            title="文字颜色"
          >
            <span
              className="tb-icon-color"
              style={{ color: editor.getAttributes('textStyle').color || '#12161c' }}
            >
              A
            </span>
          </button>
          {colorOpen && (
            <div className="tb-pop tb-pop--colors">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c.color}
                  type="button"
                  className="tb-color"
                  style={{ background: c.color }}
                  title={c.name}
                  onClick={() => {
                    editor.chain().focus().setColor(c.color).run()
                    setColorOpen(false)
                  }}
                />
              ))}
              <button
                type="button"
                className="tb-color tb-color--clear"
                title="清除颜色"
                onClick={() => {
                  editor.chain().focus().unsetColor().run()
                  setColorOpen(false)
                }}
              >
                <Icon d={ICONS.strike} size={12} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 结构 */}
      <div className="tb-group">
        <button
          type="button"
          className={btn(editor.isActive('heading', { level: 1 }))}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          title="一级标题"
        >
          <Icon d={ICONS.h1} />
        </button>
        <button
          type="button"
          className={btn(editor.isActive('heading', { level: 2 }))}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="二级标题"
        >
          <Icon d={ICONS.h2} />
        </button>

        <button
          type="button"
          className={btn(editor.isActive('bulletList'))}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="无序列表"
        >
          <Icon d={ICONS.bullet} />
        </button>
        <button
          type="button"
          className={btn(editor.isActive('orderedList'))}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="有序列表"
        >
          <Icon d={ICONS.ordered} />
        </button>

        {!compact && (
          <>
            <button
              type="button"
              className={btn(editor.isActive('taskList'))}
              onClick={() => editor.chain().focus().toggleTaskList().run()}
              title="待办清单"
            >
              <Icon d={ICONS.task} />
            </button>
            <button
              type="button"
              className={btn(editor.isActive('blockquote'))}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              title="引用"
            >
              <Icon d={ICONS.quote} />
            </button>
            <button
              type="button"
              className={btn(editor.isActive('code'))}
              onClick={() => editor.chain().focus().toggleCode().run()}
              title="行内代码"
            >
              <Icon d={ICONS.code} />
            </button>
          </>
        )}
      </div>

      {/* 插入 */}
      <div className="tb-group">
        <div className="tb-pop-wrap">
          <button
            type="button"
            className={btn(editor.isActive('table'))}
            onClick={() => setTableOpen((v) => !v)}
            title="表格"
          >
            <Icon d={ICONS.table} />
          </button>
          {tableOpen && (
            <div className="tb-pop">
              <button
                type="button"
                onClick={() => {
                  editor
                    .chain()
                    .focus()
                    .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                    .run()
                  setTableOpen(false)
                }}
              >
                插入 3×3
              </button>
              <button
                type="button"
                onClick={() => {
                  editor
                    .chain()
                    .focus()
                    .insertTable({ rows: 2, cols: 4, withHeaderRow: true })
                    .run()
                  setTableOpen(false)
                }}
              >
                插入 2×4
              </button>
              <hr />
              <button
                type="button"
                disabled={!editor.can().addRowAfter()}
                onClick={() => editor.chain().focus().addRowAfter().run()}
              >
                下方加行
              </button>
              <button
                type="button"
                disabled={!editor.can().addColumnAfter()}
                onClick={() => editor.chain().focus().addColumnAfter().run()}
              >
                右方加列
              </button>
              <button
                type="button"
                disabled={!editor.can().deleteRow()}
                onClick={() => editor.chain().focus().deleteRow().run()}
              >
                删除当前行
              </button>
              <button
                type="button"
                disabled={!editor.can().deleteColumn()}
                onClick={() => editor.chain().focus().deleteColumn().run()}
              >
                删除当前列
              </button>
              <button
                type="button"
                disabled={!editor.can().mergeCells()}
                onClick={() => editor.chain().focus().mergeCells().run()}
              >
                合并单元格
              </button>
              <button
                type="button"
                disabled={!editor.can().splitCell()}
                onClick={() => editor.chain().focus().splitCell().run()}
              >
                拆分单元格
              </button>
              <button
                type="button"
                disabled={!editor.can().toggleHeaderRow()}
                onClick={() => editor.chain().focus().toggleHeaderRow().run()}
              >
                切换表头行
              </button>
              <button
                type="button"
                disabled={!editor.can().deleteTable()}
                onClick={() => editor.chain().focus().deleteTable().run()}
              >
                删除整表
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          className="tb-btn"
          onClick={onPickImage}
          title="插入图片"
        >
          <Icon d={ICONS.image} />
        </button>

        <button
          type="button"
          className="tb-btn"
          onClick={() => {
            const url = window.prompt('链接地址')
            if (url) editor.chain().focus().setLink({ href: url }).run()
          }}
          title="插入链接"
        >
          <Icon d={ICONS.link} />
        </button>
      </div>

      {/* 撤销重做 */}
      <div className="tb-group tb-group--end">
        <button
          type="button"
          className="tb-btn"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="撤销 ⌘Z"
        >
          <Icon d={ICONS.undo} />
        </button>
        <button
          type="button"
          className="tb-btn"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="重做 ⌘⇧Z"
        >
          <Icon d={ICONS.redo} />
        </button>
      </div>

      <div className="tb-group tb-group--right">
        {uploadState === 'uploading' && <span className="tb-status">上传中</span>}
        {uploadState === 'error' && (
          <span className="tb-status tb-status--error">上传失败</span>
        )}
      </div>
    </div>
  )
}
