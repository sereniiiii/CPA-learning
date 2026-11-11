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

/* ---------- 页面 ---------- */

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

export async function savePage(
  id: string,
  title: string,
  content: string,
): Promise<PageMeta> {
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
