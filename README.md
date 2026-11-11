# CPA Learning

一个私人学习站：富文本编辑（文字 / 图片 / 表格）、云端备份、手机电脑同步。

- **数据存哪** —— GitHub 仓库的 `data` 分支，每次保存 = 一次 commit，git 历史就是备份
- **跑在哪** —— Vercel（Hobby 免费版），静态前端 + Serverless API
- **谁能看** —— 需口令登录

## 目录结构

```
study-hub/
├── api/                  Vercel Serverless Functions
│   ├── _lib/
│   │   ├── auth.ts       双层鉴权：签名 cookie + 时序安全口令比对
│   │   └── github.ts     GitHub 仓库即数据库（Git Data API）
│   ├── session.ts        登录 / 登出 / 状态检查
│   ├── pages.ts          页面列表 / 新建 / 保存 / 删除
│   ├── page.ts           单页读取
│   └── asset.ts          图片上传与读取
├── src/
│   ├── App.tsx           主界面：侧栏 + 编辑区 + 自动保存
│   ├── api.ts            前端 API 封装
│   ├── index.css         视觉样式
│   └── editor/
│       ├── Editor.tsx    Tiptap 编辑器（表格 / 图片 / 待办）
│       └── Toolbar.tsx   工具栏
├── vercel.json           构建配置 + 路由
└── .env.example          环境变量模板
```

## 分支约定

| 分支 | 内容 | Vercel 行为 |
|---|---|---|
| `main` | 前端代码 | 每次 push 自动部署 |
| `data` | 学习内容与图片 | **不部署**（`vercel.json` 中已排除） |

分开是必须的：内容通过 API 在运行时读取，不需要重新构建。若混在一个分支，每保存一次笔记就会触发一次部署，免费额度 100 次/天很快烧光。

## 本地开发

```bash
npm install
cp .env.example .env.local   # 填入真实值
npx vercel dev                # 同时启动前端与 API
```

## 部署到 Vercel

1. **准备 GitHub Token**

   GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate：

   | 项 | 值 |
   |---|---|
   | Repository access | Only select repositories → 选 `CPA-learning` |
   | Permissions → Contents | Read and write |

2. **推送代码**

   ```bash
   git remote add origin https://github.com/sereniiiii/CPA-learning.git
   git push -u origin main
   ```

3. **Vercel 导入仓库**

   vercel.com → Add New → Project → 导入 `CPA-learning` → Framework 选 Vite → Deploy

4. **配置环境变量**

   Project → Settings → Environment Variables，添加 `.env.example` 里的 6 个变量（Production / Preview / Development 三个环境都加）。

5. **开启登录门禁**

   Project → Security → Deployment Protection → 选 **All Deployments** → 保存。

   从 2026-09-09 起，这项在所有套餐（含免费 Hobby）均不额外收费。访客需用有权限的 Vercel 账号登录。

   应用层还有一道口令（`ACCESS_PASSWORD`），两道锁独立生效。

## 境内访问

`*.vercel.app` 域名在大陆访问较慢甚至超时。改善方案（按代价递增）：

1. 绑定自定义域名，DNS 托管到 Cloudflare 并开启橙云代理 —— 约 ¥60-80/年
2. 保持免费域名，接受偶尔打不开

服务器在境外，不需要 ICP 备案。

## 免费额度参考

| 项目 | Hobby 额度 |
|---|---|
| Vercel 带宽 | 100 GB/月 |
| Vercel 函数调用 | 100 万次/月 |
| Vercel 部署 | 100 次/天 |
| GitHub API | 认证后 5,000 次/小时 |
| GitHub Actions | 私有仓库 2,000 分钟/月 |

个人学习用量远低于任一上限。

## 备份与恢复

内容全部在 `data` 分支，每个 commit 都是一个完整快照。

```bash
git clone https://github.com/sereniiiii/CPA-learning.git
cd CPA-learning && git checkout data
```

回滚单个文件：在 GitHub 网页端看 `data` 分支的 commit 历史，找到目标版本 → `Revert this commit`。

## 注意事项

- Hobby 套餐仅限个人非商业用途；一旦收费或接商业客户需升级 Pro
- `GH_TOKEN` 只存在于 Vercel 环境变量，绝不能写进前端代码
- 删页面的操作会写入 git 历史，可回滚，不是真删除

<!-- 触发重新部署以应用环境变量 -->

<!-- 触发重新部署：修正 Vercel 框架预设 -->
