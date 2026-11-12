import { useState } from 'react'
import type { Editor } from '@tiptap/react'

interface ToolbarProps {
  editor: Editor
  onPickImage: () => void
  uploadState: 'idle' | 'uploading' | 'error'
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
  { color: '#12161c', name: '墨' },
  { color: '#b32334', name: '红' },
  { color: '#9a5b00', name: '橙' },
  { color: '#0b7a4b', name: '绿' },
  { color: '#2f5fd0', name: '蓝' },
  { color: '#6b3ba8', name: '紫' },
]

export function Toolbar({ editor, onPickImage, uploadState }: ToolbarProps) {
  const [tableOpen, setTableOpen] = useState(false)
  const [highlightOpen, setHighlightOpen] = useState(false)
  const [colorOpen, setColorOpen] = useState(false)

  const btn = (active: boolean) => `tb-btn${active ? ' is-active' : ''}`

  return (
    <div className="toolbar">
      <div className="tb-group">
        <button
          type="button"
          className={btn(editor.isActive('bold'))}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="加粗 ⌘B"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          className={btn(editor.isActive('italic'))}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="斜体 ⌘I"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          className={btn(editor.isActive('strike'))}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="删除线"
        >
          <s>S</s>
        </button>
        <button
          type="button"
          className={btn(editor.isActive('code'))}
          onClick={() => editor.chain().focus().toggleCode().run()}
          title="行内代码"
        >
          {'</>'}
        </button>
      </div>

      <div className="tb-group">
        <button
          type="button"
          className={btn(editor.isActive('heading', { level: 1 }))}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          title="一级标题"
        >
          H1
        </button>
        <button
          type="button"
          className={btn(editor.isActive('heading', { level: 2 }))}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="二级标题"
        >
          H2
        </button>
        <button
          type="button"
          className={btn(editor.isActive('heading', { level: 3 }))}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="三级标题"
        >
          H3
        </button>
      </div>

      <div className="tb-group">
        <button
          type="button"
          className={btn(editor.isActive('bulletList'))}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="无序列表"
        >
          •—
        </button>
        <button
          type="button"
          className={btn(editor.isActive('orderedList'))}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="有序列表"
        >
          1.
        </button>
        <button
          type="button"
          className={btn(editor.isActive('taskList'))}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          title="待办清单"
        >
          ☑
        </button>
        <button
          type="button"
          className={btn(editor.isActive('blockquote'))}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="引用"
        >
          ”
        </button>

        {/* 高亮 */}
        <div className="tb-group tb-group--table">
          <button
            type="button"
            className={btn(editor.isActive('highlight'))}
            onClick={() => setHighlightOpen((v) => !v)}
            title="高亮"
          >
            <mark className="tb-mark">高</mark>
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
                ×
              </button>
            </div>
          )}
        </div>

        {/* 文字颜色 */}
        <div className="tb-group tb-group--table">
          <button
            type="button"
            className={btn(!!editor.getAttributes('textStyle').color)}
            onClick={() => setColorOpen((v) => !v)}
            title="文字颜色"
          >
            <span
              className="tb-color-label"
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
                ×
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="tb-group tb-group--table">
        <button
          type="button"
          className={btn(editor.isActive('table'))}
          onClick={() => setTableOpen((v) => !v)}
          title="表格"
        >
          表格
        </button>
        {tableOpen && (
          <div className="tb-pop">
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
                setTableOpen(false)
              }}
            >
              插入 3×3
            </button>
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().insertTable({ rows: 2, cols: 4, withHeaderRow: true }).run()
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

      <div className="tb-group">
        <button type="button" className="tb-btn" onClick={onPickImage} title="插入图片">
          图片
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
          链接
        </button>
      </div>

      <div className="tb-group tb-group--right">
        {uploadState === 'uploading' && <span className="tb-status">上传中</span>}
        {uploadState === 'error' && <span className="tb-status tb-status--error">上传失败</span>}
      </div>
    </div>
  )
}
