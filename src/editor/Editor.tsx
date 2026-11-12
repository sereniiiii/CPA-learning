import { useEffect, useRef, useState, useCallback } from 'react'
import { EditorContent, useEditor, Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import { Placeholder, CharacterCount } from '@tiptap/extensions'
import type { JSONContent } from '@tiptap/core'
import { Toolbar } from './Toolbar'
import { uploadImage } from '../api'

interface EditorProps {
  content: string
  onChange: (json: JSONContent) => void
  onSave: () => void
  readOnly?: boolean
  /** 占位提示语，不同场景给不同引导 */
  placeholder?: string
  /** 紧凑模式：用于习题答题区这类嵌入场景 */
  compact?: boolean
}

export function RichEditor({
  content,
  onChange,
  onSave,
  readOnly,
  placeholder = '开始写点什么…',
  compact = false,
}: EditorProps) {
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'error'>('idle')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: false,
        codeBlock: { HTMLAttributes: { class: 'code-block' } },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Image.configure({
        allowBase64: false,
        HTMLAttributes: { class: 'editor-image' },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({
        table: {
          resizable: true,
          lastColumnResizable: false,
          HTMLAttributes: { class: 'editor-table' },
        },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      // 高亮：黄色荧光笔效果，适合标注关键公式与易错点
      Highlight.configure({ multicolor: true }),
      // 文字颜色：靠 TextStyle 提供底层能力
      TextStyle,
      Color,
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
      CharacterCount,
    ],
    content: parseContent(content),
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON())
    },
    editorProps: {
      attributes: {
        class: `editor-body${compact ? ' is-compact' : ''}`,
        spellcheck: 'false',
      },
    },
  })

  // 外部内容变化时同步进编辑器（切换页面）
  useEffect(() => {
    if (!editor) return
    const incoming = parseContent(content)
    if (JSON.stringify(incoming) !== JSON.stringify(editor.getJSON())) {
      editor.commands.setContent(incoming, { emitUpdate: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, editor])

  // Cmd/Ctrl + S 保存
  useEffect(() => {
    if (!editor) return
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        onSave()
      }
    }
    editor.view.dom.addEventListener('keydown', handler)
    return () => editor.view.dom.removeEventListener('keydown', handler)
  }, [editor, onSave])

  const insertImage = useCallback(
    async (file: File) => {
      if (!editor) return
      setUploadState('uploading')
      try {
        const dataUrl = await compressImage(file)
        const url = await uploadImage(dataUrl)
        editor.chain().focus().setImage({ src: url, alt: file.name }).run()
        setUploadState('idle')
      } catch (err) {
        console.error(err)
        setUploadState('error')
        setTimeout(() => setUploadState('idle'), 2500)
      }
    },
    [editor],
  )

  // 粘贴图片
  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            e.preventDefault()
            insertImage(file)
            return
          }
        }
      }
    }
    dom.addEventListener('paste', handler)
    return () => dom.removeEventListener('paste', handler)
  }, [editor, insertImage])

  // 拖拽图片
  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom
    const handler = (e: DragEvent) => {
      const files = e.dataTransfer?.files
      if (files && files.length > 0 && files[0].type.startsWith('image/')) {
        e.preventDefault()
        insertImage(files[0])
      }
    }
    dom.addEventListener('drop', handler)
    return () => dom.removeEventListener('drop', handler)
  }, [editor, insertImage])

  const handleFilePick = () => {
    fileInputRef.current?.click()
  }

  if (!editor) return null

  return (
    <div className={`editor-shell${compact ? ' is-compact' : ''}`}>
      {!readOnly && (
        <Toolbar
          editor={editor}
          onPickImage={handleFilePick}
          uploadState={uploadState}
        />
      )}
      <EditorContent editor={editor} />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) insertImage(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}

/** 内容以 Tiptap JSON 存储，便于无损还原表格、图片等结构 */
function parseContent(raw: string): JSONContent {
  if (!raw) return { type: 'doc', content: [{ type: 'paragraph' }] }
  try {
    const parsed = JSON.parse(raw)
    if (parsed && parsed.type === 'doc') return parsed
  } catch {
    /* 落到纯文本 */
  }
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: raw }] }],
  }
}

/** 浏览器端压缩图片，避免超出上传体积限制 */
async function compressImage(file: File, maxWidth = 1600, quality = 0.82): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxWidth / bitmap.width)
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const dataUrl = canvas.toDataURL('image/jpeg', quality)
  return dataUrl
}

export type { Editor }
