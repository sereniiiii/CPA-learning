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

5. **访问口令**

   应用层已内置口令登录（`ACCESS_PASSWORD` 环境变量），默认口令 `cpa-2026`。
   正式使用前请在 Vercel 环境变量里改掉：

   Project → Settings → Environment Variables → 找到 `ACCESS_PASSWORD` → Edit → 改成新口令 → Save，
   然后重新部署（环境变量变更不影响已有部署）。

   **关于 Vercel 部署门禁（Deployment Protection）：** 本项目默认不开启。
   原因是 Vercel 登录页在境内访问较慢，会拖慢整体打开速度；数据本身在 GitHub 私有仓库里，
   API 层有 HMAC 签名 cookie 保护，两道应用层机制已经足够。若你更看重「即使口令泄露也打不开」，
   可在 Project → Security → Deployment Protection 开启 All Deployments（2026-09-09 起全套餐免费）。

## 当前线上地址

- 站点：https://cpa-learning-eta.vercel.app
- 项目名：`cpa-learning`（Vercel）
- 仓库：https://github.com/sereniiiii/CPA-learning

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

三层保护，从松到紧：

### 第一层：Git 历史（自动，随时可用）

每次保存都是一个 commit，误删误改立刻可回滚。无需任何操作。

```bash
git clone https://github.com/sereniiiii/CPA-learning.git
cd CPA-learning && git checkout data
```

单个文件回滚：GitHub 网页端看 `data` 分支的 commit 历史 → 找到目标版本 → `Revert this commit`。

### 第二层：JSON 导出（手动，一键）

侧边栏右下角有「导出 / 导入」两个按钮（默认半透明，鼠标移上去才明显）。

- **导出** —— 下载一个 `cpa-learning-日期.json` 文件，包含全部笔记正文（富文本 JSON 格式，
  表格、图片引用都完整保留）和所有图片的 base64 内嵌。**这是完整的离线副本**，
  存到微信收藏、网盘、邮箱都随意。
- **导入** —— 选择之前导出的 JSON 文件即可恢复。会弹窗让你选模式：
  - **确定 = 合并**：覆盖同名笔记，保留其他笔记
  - **取消 = 完全还原**：先清空现有内容，再按文件还原

导出文件是纯文本 JSON，可以直接用文本编辑器查看，也能被脚本处理。

### 第三层：自动定时备份（需额外配置）

`.github/workflows/backup.yml` 已写好（每日 UTC 15:00 = 北京时间 23:00），
但**提交它需要 GitHub token 带 `workflow` 权限**，当前 token 没有，故未上传。

配置好权限后推上去即可生效，它会：
1. 把 `data` 分支打包成 tar.gz
2. 存为 GitHub Release 附件（本地兜底）
3. 若配置了腾讯云 COS 密钥，同时上传到 COS（异地备份）

COS 需要在仓库 Settings → Secrets → Actions 添加四个变量：
`COS_SECRET_ID`、`COS_SECRET_KEY`、`COS_REGION`、`COS_BUCKET`。

## 注意事项

- Hobby 套餐仅限个人非商业用途；一旦收费或接商业客户需升级 Pro
- `GH_TOKEN` 只存在于 Vercel 环境变量，绝不能写进前端代码
- 仓库目前是 **public**。改成 private 后 Hobby 仍可正常部署（个人账户下的私有仓库支持），
  但笔记内容在 `data` 分支，改私有前建议先确认 Vercel 已绑定该仓库

## 技术要点（踩过的坑）

**为什么代码在 main、内容在 data 两个分支**

内容通过 API 在运行时读取，不需要重新构建。若混在一个分支，每保存一次笔记就触发一次 Vercel 部署，
免费额度 100 次/天会很快烧光。`vercel.json` 中已配置 `git.deploymentEnabled.data = false`。

**GitHub 数据层的三个关键点**

1. **读取必须走 head commit → tree → blob**，不能直接读分支树或 Contents API。
   分支引用刚更新时，分支树快照与 Contents API（CDN 缓存）都可能返回旧内容，
   导致「新建笔记后立刻保存」报 404。

2. **提交要重建整棵树**，不能用 `base_tree` 继承。
   `base_tree` 不接受 `sha: null` 的删除项（返回 422），删除只能靠「不把路径列进新树」实现。

3. **Tree API 接受带斜杠的完整路径**（如 `data/pages/x.json`），会自动创建中间目录，
   不需要手动构建层级。

**ESM 模式下的相对导入**

`package.json` 设了 `"type": "module"`，ESM 规范要求相对导入带扩展名。
`api/` 下的导入必须写成 `./_lib/auth.js`（不是 `./_lib/auth`），
否则运行时抛 `ERR_MODULE_NOT_FOUND`，所有 API 函数全挂。

**Vercel 环境变量 API 的写入格式**

必须一次性 POST **数组**，且用 `type: "encrypted"` + `visibility: "config"`，
`value` 传明文（Vercel 自己加密存储）。逐条 POST 单个对象会导致值被双层加密，运行时读到密文。

**本地代理**

本机有两个代理端口：`127.0.0.1:65532`（系统代理，GitHub 可通）、
`127.0.0.1:64756`（WorkBuddy 内置，GitHub 不通）。
git push 需显式指定：
```bash
git -c http.proxy=http://127.0.0.1:65532 push
```

- 删页面的操作会写入 git 历史，可回滚，不是真删除

<!-- 触发重新部署以应用环境变量 -->

<!-- 触发重新部署：修正 Vercel 框架预设 -->

<!-- 修正环境变量格式 -->

<!-- 关闭 Vercel 部署门禁，保留应用层口令鉴权 -->

<!-- 触发重新部署以应用新口令 -->

<!-- 应用新的访问口令 -->
