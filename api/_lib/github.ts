/**
 * GitHub 仓库即数据库。
 *
 * 分支约定：
 *   main  —— 前端代码，由 Vercel 监听并部署
 *   data  —— 学习内容与图片，Vercel 不部署（见 vercel.json）
 *
 * 全部读写走 Git Data API（blobs → trees → commits → refs）：
 *   - 一次提交可原子写入多个文件
 *   - 分支不存在时自动创建
 *   - 无需维护文件 sha，天然避免并发写冲突
 *
 * 每次写入产生一个 commit —— 这既是「保存」，也是免费的时间旅行备份。
 */

export interface RepoConfig {
  owner: string
  repo: string
  branch: string
  token: string
}

export interface PageMeta {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  order: number
}

export interface IndexData {
  pages: PageMeta[]
}

const API = 'https://api.github.com'

function config(): RepoConfig {
  const owner = process.env.GH_OWNER
  const repo = process.env.GH_REPO
  const branch = process.env.GH_BRANCH || 'data'
  const token = process.env.GH_TOKEN
  if (!owner || !repo || !token) {
    throw new Error('缺少 GitHub 环境变量：GH_OWNER / GH_REPO / GH_TOKEN')
  }
  return { owner, repo, branch, token }
}

async function gh<T>(path: string, init?: RequestInit): Promise<T> {
  const cfg = config()
  const res = await fetch(`${API}/repos/${cfg.owner}/${cfg.repo}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'study-hub',
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`GitHub API ${res.status} ${path}: ${body.slice(0, 300)}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/* ---------- Git Data API ---------- */

interface BlobRef {
  sha: string
}

interface TreeRef {
  sha: string
}

interface CommitRef {
  sha: string
}

function authHeaders(): Record<string, string> {
  const cfg = config()
  return {
    Authorization: `Bearer ${cfg.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'study-hub',
  }
}

/** 读取分支头 commit；分支不存在返回 null */
async function getHead(branch: string): Promise<CommitRef | null> {
  const cfg = config()
  const res = await fetch(`${API}/repos/${cfg.owner}/${cfg.repo}/git/ref/heads/${branch}`, {
    headers: authHeaders(),
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GitHub API ${res.status} ref ${branch}`)
  const data = (await res.json()) as { object: { sha: string } }
  return { sha: data.object.sha }
}

/** 读取整棵目录树（递归） */
async function getTree(branch: string): Promise<Array<{ path: string; sha: string; size: number }>> {
  const cfg = config()
  const res = await fetch(`${API}/repos/${cfg.owner}/${cfg.repo}/git/trees/${branch}?recursive=1`, {
    headers: authHeaders(),
  })
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`GitHub API ${res.status} tree ${branch}`)
  const data = (await res.json()) as {
    tree: Array<{ path: string; sha: string; size?: number; type: string }>
  }
  return data.tree
    .filter((t) => t.type === 'blob')
    .map((t) => ({ path: t.path, sha: t.sha, size: t.size ?? 0 }))
}

/** 按 sha 读取 blob 原始字节 */
async function getBlob(sha: string): Promise<Buffer> {
  const cfg = config()
  const res = await fetch(`${API}/repos/${cfg.owner}/${cfg.repo}/git/blobs/${sha}`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status} blob ${sha}`)
  const data = (await res.json()) as { content: string }
  return Buffer.from(data.content.replace(/\n/g, ''), 'base64')
}

/**
 * 原子提交：一次 commit 写入多个文件。
 * files: { path, content: Buffer | string, delete?: boolean }[]
 */
async function commitFiles(
  files: Array<{ path: string; content: Buffer | string; delete?: boolean }>,
  message: string,
): Promise<string> {
  const cfg = config()
  const branch = cfg.branch

  const head = await getHead(branch)
  let baseTree: string | undefined
  if (head) {
    const commit = await gh<{ tree: TreeRef }>(`/git/commits/${head.sha}`)
    baseTree = commit.tree.sha
  }

  const treeEntries: Array<Record<string, string | null>> = []
  for (const file of files) {
    if (file.delete) {
      // 删除文件：sha 传 null 表示从树中移除该路径
      treeEntries.push({ path: file.path, mode: '100644', type: 'blob', sha: null })
      continue
    }
    const buffer = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf8')
    const blob = await gh<BlobRef>('/git/blobs', {
      method: 'POST',
      body: JSON.stringify({
        content: buffer.toString('base64'),
        encoding: 'base64',
      }),
    })
    treeEntries.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha })
  }

  const tree = await gh<TreeRef>('/git/trees', {
    method: 'POST',
    body: JSON.stringify({ base_tree: baseTree, tree: treeEntries }),
  })

  const commit = await gh<CommitRef>('/git/commits', {
    method: 'POST',
    body: JSON.stringify({
      message,
      tree: tree.sha,
      parents: head ? [head.sha] : [],
    }),
  })

  if (head) {
    await gh(`/git/refs/heads/${branch}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha, force: true }),
    })
  } else {
    await gh('/git/refs', {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
    })
  }

  return commit.sha
}

/* ---------- 业务层 ---------- */

const INDEX_PATH = 'data/index.json'

export async function readIndex(): Promise<IndexData> {
  const files = await getTree(config().branch)
  const entry = files.find((f) => f.path === INDEX_PATH)
  if (!entry) return { pages: [] }
  try {
    const text = (await getBlob(entry.sha)).toString('utf8')
    const parsed = JSON.parse(text) as IndexData
    return Array.isArray(parsed.pages) ? parsed : { pages: [] }
  } catch {
    return { pages: [] }
  }
}

export async function readFile(path: string): Promise<string | null> {
  const files = await getTree(config().branch)
  const entry = files.find((f) => f.path === path)
  if (!entry) return null
  return (await getBlob(entry.sha)).toString('utf8')
}

export async function readBinary(path: string): Promise<Buffer | null> {
  const files = await getTree(config().branch)
  const entry = files.find((f) => f.path === path)
  if (!entry) return null
  return getBlob(entry.sha)
}

export function pagePath(id: string): string {
  return `data/pages/${id}.json`
}

export async function readPage(id: string): Promise<{ content: string; meta: PageMeta } | null> {
  const index = await readIndex()
  const meta = index.pages.find((p) => p.id === id)
  if (!meta) return null
  const content = await readFile(pagePath(id))
  if (content === null) return null
  return { content, meta }
}

/** 写页面：正文与索引在同一个 commit 里，保证一致 */
export async function writePage(
  id: string,
  title: string,
  content: string,
  message: string,
): Promise<void> {
  const index = await readIndex()
  const meta = index.pages.find((p) => p.id === id)
  if (meta) {
    meta.title = title
    meta.updatedAt = new Date().toISOString()
  }
  await commitFiles(
    [
      { path: pagePath(id), content },
      { path: INDEX_PATH, content: JSON.stringify(index, null, 2) },
    ],
    message,
  )
}

export async function createPageRecord(
  id: string,
  title: string,
  content: string,
): Promise<PageMeta> {
  const index = await readIndex()
  const now = new Date().toISOString()
  const meta: PageMeta = {
    id,
    title,
    createdAt: now,
    updatedAt: now,
    order: index.pages.length,
  }
  index.pages.push(meta)
  await commitFiles(
    [
      { path: pagePath(id), content },
      { path: INDEX_PATH, content: JSON.stringify(index, null, 2) },
    ],
    `新建：${title}`,
  )
  return meta
}

export async function deletePageRecord(id: string): Promise<void> {
  const index = await readIndex()
  const meta = index.pages.find((p) => p.id === id)
  index.pages = index.pages.filter((p) => p.id !== id)
  index.pages.forEach((p, i) => {
    p.order = i
  })
  await commitFiles(
    [
      { path: pagePath(id), content: '', delete: true },
      { path: INDEX_PATH, content: JSON.stringify(index, null, 2) },
    ],
    `删除：${meta?.title ?? id}`,
  )
}

export async function writeAsset(name: string, data: Buffer): Promise<void> {
  await commitFiles([{ path: `data/assets/${name}`, content: data }], `上传图片：${name}`)
}

export async function listAssets(): Promise<Array<{ path: string; sha: string; size: number }>> {
  const files = await getTree(config().branch)
  return files.filter((f) => f.path.startsWith('data/assets/'))
}

export function slugify(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'untitled'
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
