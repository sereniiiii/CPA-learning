# CPA Learning

一个私人学习站：**2026 注会 CPA《轻一》· 财务成本管理**教材内容库 + 富文本学习工具。

- **教材内容** —— 三册 907 页原文解析为 20 章 / 221 考点 / 353 例题，难度与 5 年热点信号全部取自教材原文
- **学习机制** —— 间隔重复 1/3/7/14/30/60 天、掌握度衰减、错因归档、交错出题
- **可写** —— 我的笔记支持富文本、插图、表格
- **数据存哪** —— GitHub 仓库的 `data` 分支，每次保存 = 一次 commit，git 历史就是备份
- **跑在哪** —— Vercel（Hobby 免费版），静态前端 + Serverless API
- **谁能看** —— 需口令登录

线上：https://cpa-learning-eta.vercel.app

## 六个区域

| 区域 | 内容 |
|---|---|
| 今日 | 到期重排 + 未解决错题 + 新内容，交错出题 |
| 教材库 | 章 → 节 → 考点树；左侧目录树 + 右侧章节卡片 |
| 主观题 | 下册第三部分 17 个专题 + 手写训练区 + 三档自评 |
| 复习 | 全部到期队列，按逾期程度排序 |
| 错题本 | 按错因标签分组（概念混淆 / 没记住 / 计算失误 / 看错题 / 表述陷阱） |
| 归档 | 已掌握但会衰减的考点，按衰减程度排序 |
| 我的笔记 | 自己写的富文本内容 |

## 内容呈现：按知识点切分的原书图，不是整页

**整页截图等于让用户自己翻书** —— 没有结构、没有定位、没有检索价值。
所以教材内容按「考点 / 例题 / 点拨」切成独立图块，每块一张：

| 块类型 | 数量 | 说明 |
|---|---|---|
| 知识点 | 209 | 以「考点NN」标题为界的完整知识块，含表格、公式、辨析 |
| 例题 | 341 | 每道例题独立成块，含题干、选项、解析 |
| 点拨 / 辨析 | 274 | 教材的小提示块，归到所属考点下 |

**874 块，100% 归并到 221 个考点**，跨页延续自动合并。

### 怎么切的

1. `pypdf` 的 `extract_text(visitor_text=...)` 拿每个文字块的坐标
2. 找「考点NN」「【例题N·类型】」「解析/点拨/辨析」的 y 坐标 → 切分边界
3. `PdfWriter` 设 cropbox 裁成独立 PDF → `sips -Z 1500` 转 PNG
4. 矢量文字渲染，比截图清晰，且天然没有页眉水印

坐标要点：visitor 给的是**基线**，文字上边界 ≈ 基线 + 字号×0.82，
不按这个算会把标题行切掉半行字。

### 内容库结构（按科目分目录，多科目共用）

| 路径 | 内容 |
|---|---|
| `data/subjects.json` | 科目清单（id / 名称 / 章数 / 封面色） |
| `data/subjects/<科目>/index.json` | 章节目录 + 考情速览信号 + 每个考点的块列表 |
| `data/subjects/<科目>/chapters/chNN.json` | 单章详情 |
| `data/subjects/<科目>/subjectives/` | 主观题 17 专题 |
| `data/subjects/<科目>/blocks/*.png` | 知识块图（874 张，274 MB） |
| `data/subjects/<科目>/blocks.json` | 块索引（类型 / 来源页 / 标签） |
| `data/userdata.json` | 学习进度 + 用户数据（覆盖层、批注、自加题、习题作答） |

### 保留在数据里的结构化信息

OCR 文字层完全不入库（表格被拍平、公式符号损坏、页眉页码混入，读到的顺序是错的）。
只保留清洗过的元数据：

- 章名、节名、考点名
- 难度标记、5 年热点次数
- 常考题型、近 5 年平均分值、建议学习时长、教材主要变化
- 来源页码

正文、例题题干、解析、习题 —— 一律看知识块图。

### 呈现规则

- 同一页有多道例题 → 合并成一张图，不重复显示
- 章末同步习题 → 独立区块，左原书右作答
- 主观题 → 独立成区，17 个专题各有原书页翻阅 + 手写训练区

## 多科目

内容库按科目分目录，`data/subjects.json` 是科目清单。
侧栏顶部有科目切换器，切换只换科目，不换布局。
新增一个科目只需：

1. 把该科目的 PDF 拆页 → 切块 → 归并（`scripts/` 里的三个脚本可直接复用）
2. 内容放 `data/subjects/<科目id>/`
3. 在 `data/subjects.json` 加一条

## 批注

可以在任意考点写批注，归属自动带科目 / 章 / 节 / 考点。
汇总显示按 **科目 → 章 → 节 → 考点** 归类，**不按时间排序**。
点批注可直接跳回对应考点。

批注正文是富文本（表格、图片、高亮、颜色）。

## 题目可以编辑

四个入口，都在考点详情页：

1. **改写考点名称** —— 覆盖显示，教材原名保留在内容库里，随时可还原
2. **解析笔记** —— 自己的思路、易错点
3. **答案与卡点** —— 记答案 + 记卡在哪
4. **自加新题** —— 单选/多选/计算分析/综合，含选项、答案、解析

另有「已对照原书核对过」勾选（文档 7.3 的 status 字段：已核 / 待核 / 草稿）。

编辑采用**覆盖层**实现（`UserOverlay`），不改教材原文。好处：
教材永远可重新解析、导出时能区分「教材原文」与「你的修改」、重新抽取教材不会丢用户数据。

## 学习数据同步

学习进度与用户数据存 `data/userdata.json`，写入即一个 commit。
本地立即生效（不等网络），防抖 1.5 秒后写云端；断网时降级为纯本地。
iPhone 与 Mac 无缝切换。

## 目录结构

```
study-hub/
├── api/                  Vercel Serverless Functions
│   ├── _lib/
│   │   ├── auth.ts       双层鉴权：签名 cookie + 时序安全口令比对
│   │   └── github.ts     GitHub 仓库即数据库（Git Data API）
│   ├── session.ts        登录 / 登出 / 状态检查
│   ├── textbook.ts       教材内容库读取（索引 / 章节 / 主观题 / 截图）
│   ├── userdata.ts        学习进度与用户数据的云端同步
│   ├── pages.ts          我的笔记：列表 / 新建 / 保存 / 删除
│   ├── page.ts           单页读取
│   ├── asset.ts          图片上传与读取
│   ├── export.ts         数据导出
│   └── import.ts         数据导入
├── src/
│   ├── App.tsx           主界面：四区导航 + 状态编排
│   ├── api.ts            前端 API 封装
│   ├── learning.ts       学习机制：间隔重复 / 掌握度 / 错题 / 交错队列
��   ├── types.ts          数据类型
│   ├── views/
│   │   ├── TodayView.tsx     今日
│   │   ├── LibraryView.tsx   库
│   │   ├── ReviewView.tsx    复习 / 错题本 / 归档 / 错因选择器
│   │   ├── PointView.tsx     考点详情 + 自测
│   │   ├── PageBrowser.tsx   原书页浏览器（翻页 / 放大）
│   │   ├── SubjectiveView.tsx 主观题集训
│   │   ├── EditPanel.tsx     题目编辑（覆盖层 / 自加题）
│   │   └── MyNotes.tsx       我的笔记
│   ├── editor/
│   │   ├── Editor.tsx    Tiptap 编辑器（表格 / 图片 / 待办）
│   │   └── Toolbar.tsx   工具栏
│   └── index.css         视觉样式
├── scripts/              教材处理流水线（可重跑）
│   ├── extract-textbook.py  PDF → 文本（layout 模式）
│   ├── parse-textbook.py    文本 → 结构化内容库
│   ├── parse_points.py      考点行解析
│   ├── parse_framework.py   考点框架解析
│   ├── parse-subjectives.py 主观题 17 专题解析
│   ├── docx2md.py           docx → Markdown
│   └── verify-learning.mjs  学习机制自测
└── vercel.json           构建配置 + 路由
```

## 教材内容库

内容来自 `data` 分支：

| 路径 | 内容 |
|---|---|
| `data/index.json` | 章节目录（36 KB，含难度、热点、题型、平均分值） |
| `data/chapters/chNN.json` | 单章详情（考点正文 + 例题） |
| `data/subjectives.json` | 主观题集训（288 页） |
| `data/shots/*.jpg` | 原书截图（183 张，1400px / q72，约 210 KB/张） |

### 为什么大量内容走截图

OCR 扫描件的文字层不是可信来源。以下情形一律用截图保真，不做文字转写：

- 表格被拍平（行列关系丢失）
- 公式符号损坏（百分号变问号）
- 双栏串行（正文与例题框交错）
- 页眉页码混入（选项值被篡改）
- 长数字串（数值不可信）

每条内容带 `status` 字段（已核 / 待核 / 草稿），带公式与数值的题目需人工对照原书核过后才标为「已核」。

## 分支约定

| 分支 | 内容 | Vercel 行为 |
|---|---|---|
| `main` | 前端代码 | 每次 push 自动部署 |
| `data` | 教材内容与图片 | **不部署**（`vercel.json` 中已排除） |

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

### 第三层：本机每日自动备份（脚本已就位，需你运行一次安装）

`scripts/local-backup.sh` 每天从 GitHub 拉取 `data` 分支，存到 `~/Documents/CPA-learning-backup/`：
- `latest/` —— 最新快照
- `snapshots/YYYYMMDD-HHMMSS/` —— 历史归档，保留最近 30 份

**安装方式**（在你自己 Terminal 里跑一次）：

```bash
bash /Users/seren/WorkBuddy/2026-11-12-00-20-32/study-hub/scripts/install-backup-job.sh
```

它会装好 plist、注册到 launchd（每天 12:30 自动跑）、并立即执行一次验证。
日志在 `~/Library/Logs/cpa-backup.log`。

卸载：`launchctl bootout gui/$(id -u)/com.serenii.cpa-backup`

> 注：WorkBuddy 沙箱无法执行 `launchctl load`（报 `Load failed: 5`），
> 必须由你在自己的 Terminal 里跑上面那条命令。

### 第四层：腾讯云 COS 异地备份（需额外配置）

`.github/workflows/backup.yml` 已写好（每日 UTC 15:00 = 北京时间 23:00），
会打包 `data` 分支并上传到 COS，同时存一份 Release 附件。

**但它现在推不上去** —— GitHub 拒绝没有 `workflow` 权限的 token 提交 CI 文件
（Fine-grained PAT 默认没有这项权限）。启用需要两步：

1. 给 token 加权限：Settings → Developer settings → Fine-grained tokens → `study-hub`
   → Permissions → Repository permissions → **Workflows** → Read and write
2. 在仓库 Settings → Secrets → Actions 添加四个变量：
   `COS_SECRET_ID`、`COS_SECRET_KEY`、`COS_REGION`、`COS_BUCKET`

（腾讯云 COS 需先在控制台开通存储桶并拿到密钥。免费额度足够个人使用。）

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
