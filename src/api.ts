/** 与 Vercel Functions 通信的统一封装 */

export interface PageMeta {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  order: number
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  })
  if (!res.ok) {
    let message = `请求失败（${res.status}）`
    try {
      const body = (await res.json()) as { error?: string }
      if (body?.error) message = body.error
    } catch {
      /* 保留默认信息 */
    }
    throw new Error(message)
  }
  return (await res.json()) as T
}

/* ---------- 会话 ---------- */

export async function checkSession(): Promise<boolean> {
  try {
    const data = await request<{ authenticated: boolean }>('/api/session')
    return data.authenticated
  } catch {
    return false
  }
}

export async function login(password: string): Promise<void> {
  await request('/api/session', {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
}

export async function logout(): Promise<void> {
  await request('/api/session', { method: 'DELETE' })
}

/* ---------- 我的笔记（可写） ---------- */

export async function listPages(): Promise<PageMeta[]> {
  const data = await request<{ pages: PageMeta[] }>('/api/pages')
  return data.pages
}

export async function getPage(id: string): Promise<{ content: string; meta: PageMeta }> {
  return request(`/api/page?id=${encodeURIComponent(id)}`)
}

export async function createPage(title: string, content = ''): Promise<PageMeta> {
  const data = await request<{ page: PageMeta }>('/api/pages', {
    method: 'POST',
    body: JSON.stringify({ title, content }),
  })
  return data.page
}

export async function savePage(id: string, title: string, content: string): Promise<PageMeta> {
  const data = await request<{ page: PageMeta }>('/api/pages', {
    method: 'PUT',
    body: JSON.stringify({ id, title, content }),
  })
  return data.page
}

export async function deletePage(id: string): Promise<void> {
  await request('/api/pages', {
    method: 'DELETE',
    body: JSON.stringify({ id }),
  })
}

/* ---------- 图片 ---------- */

export async function uploadImage(dataUrl: string): Promise<string> {
  const data = await request<{ id: string; url: string }>('/api/asset', {
    method: 'POST',
    body: JSON.stringify({ data: dataUrl }),
  })
  return data.url
}

/* ---------- 教材内容库 ---------- */

export const learningApi = {
  getSubjects: () =>
    request<import('./types').Subject[]>('/api/textbook?kind=subjects'),

  getIndex: (subject = 'cwc') =>
    request<import('./types').SubjectLibrary>(
      `/api/textbook?kind=index&subject=${encodeURIComponent(subject)}`,
    ),

  getChapter: (id: string, subject = 'cwc') =>
    request<import('./types').Chapter>(
      `/api/textbook?kind=chapter&id=${encodeURIComponent(id)}&subject=${encodeURIComponent(subject)}`,
    ),

  getSubjectives: () =>
    request<{
      pages: Array<{
        source: { volume: string; pdfPage: number; printPage: number }
        text: string
      }>
    }>('/api/textbook?kind=subjectives'),

  getSubjectiveIndex: (subject = 'cwc') =>
    request<{
      topics: Array<{
        id: string
        num: number
        title: string
        source: { volume: string; pdfPage: number; printPage: number }
        pageCount: number
      }>
    }>(`/api/textbook?kind=subjectiveIndex&subject=${encodeURIComponent(subject)}`),

  getSubjectiveTopic: (id: string, subject = 'cwc') =>
    request<{
      id: string
      num: number
      title: string
      source: { volume: string; pdfPage: number; printPage: number }
      pages: Array<{ pdfPage: number; text: string }>
    }>(
      `/api/textbook?kind=subjectiveTopic&id=${encodeURIComponent(id)}&subject=${encodeURIComponent(subject)}`,
    ),

  /** 知识块索引：文件名 → 元数据（类型、来源页、标签） */
  getBlockIndex: (subject = 'cwc') =>
    request<Record<string, {
      kind: 'point' | 'example' | 'label'
      volume: string
      pdfPage: number
      label: string
      exampleNo: number | null
    }>>(`/api/textbook?kind=blockIndex&subject=${encodeURIComponent(subject)}`),

  shotUrl: (name: string, subject = 'cwc') =>
    `/api/textbook?kind=shot&name=${encodeURIComponent(name)}&subject=${encodeURIComponent(subject)}`,
}

/* ---------- 导入导出 ---------- */

export interface ExportBundle {
  version: number
  exportedAt: string
  pages: Array<{ id: string; title: string; content: string }>
  assets: Record<string, string>
}

export async function exportAll(
  onProgress?: (done: number, total: number) => void,
): Promise<ExportBundle> {
  const manifest = await request<Omit<ExportBundle, 'assets'>>('/api/export')

  const assetIds = new Set<string>()
  for (const page of manifest.pages) {
    const matches = page.content.match(/\/api\/asset\?id=([a-zA-Z0-9._-]+)/g) ?? []
    for (const m of matches) {
      const id = m.split('id=')[1]
      if (id) assetIds.add(id)
    }
  }

  const ids = [...assetIds]
  const assets: Record<string, string> = {}

  const CONCURRENCY = 5
  let done = 0
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      batch.map(async (id) => {
        try {
          const res = await fetch(`/api/asset?id=${encodeURIComponent(id)}`)
          if (!res.ok) return null
          const blob = await res.blob()
          const base64 = await blobToBase64(blob)
          return [id, base64] as const
        } catch {
          return null
        }
      }),
    )
    for (const r of results) {
      if (r) assets[r[0]] = r[1]
      done += 1
      onProgress?.(done, ids.length)
    }
  }

  return { ...manifest, assets }
}

export async function importAll(
  bundle: ExportBundle,
  mode: 'merge' | 'replace',
): Promise<{ pages: number; assets: number; removed: number }> {
  return request('/api/import', {
    method: 'POST',
    body: JSON.stringify({ pages: bundle.pages, assets: bundle.assets, mode }),
  })
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(blob)
  })
}
