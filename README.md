# 个人网站（Personal Website）

一个零依赖、纯静态的个人网站：展示个人信息、社交链接和你的项目作品集。

- **在线地址**（部署后）：`https://ginyvaxu.github.io/personal-website/`
- **本地预览**：双击 `index.html` 即可（无需安装任何东西，断网也能看）

## 功能特点

- 浅色简约风格，带轻盈动效（滚动渐现、卡片悬浮、弹窗过渡）
- 「主力项目」模块：置顶隆重展示当前主力项目（如 AgentFloat，带玻璃小球演示动画）
- 名字在 Ginyva / 八奈見真尋 之间轮换显示（Hero 与顶部导航）
- 项目以「卡片 + 点击弹出详情」的形式逐一展示，每个项目都带 GitHub 仓库链接
- 数据驱动：新增项目只需在 `data/projects.js` 里加一条记录
- 社交链接：GitHub、Steam 必显示，微信 / QQ / 邮箱 / B 站 / 微博 / 抖音 选填（留空自动隐藏）
- 手机 / 平板 / 电脑自适应

## 文件结构

```
index.html        网站主页（一般不用改）
css/style.css     样式与动画（一般不用改）
js/main.js        页面逻辑（一般不用改）
data/site.js      个人信息 + 社交链接 ← 改这里
data/projects.js  项目列表 ← 改这里
assets/           存放头像、项目截图等图片
填写信息.txt       信息填写模板（填好后可让我帮你更新网站）
发布更新.bat      本地一键发布到 GitHub Pages
README.md         本文档
```

## 修改个人信息

打开 `data/site.js`，直接改对应字段即可（姓名、头像、简介、社交链接）。
社交链接不需要的留空 `""`，对应图标会自动隐藏。

- `name`：主显示名（页脚、头像 alt、默认标题）
- `names`：轮换显示的名字列表，例如 `["Ginyva", "八奈見真尋"]`，网页会自动轮流切换
- `tagline`：Hero 大标题下方的一句话（当前为「无尽界限」）

> 也可以直接修改根目录的 `填写信息.txt`，然后告诉我「填写完成」，我帮你同步到网站。

## 新增一个项目

打开 `data/projects.js`，复制任意一条 `{ ... },` 粘贴到数组最前面，改好字段即可。
文件顶部有详细的字段说明（名称、分类、状态、简介、详情、技术栈、亮点、链接、最近更新日志）。

- 想让某个项目成为「当前主力」：给它加 `"featured": true`（建议同时只置 1 个），它会出现在主页「主力项目」模块并带「主力」角标
- 每个项目建议至少放一个 GitHub 仓库链接（`links` 里 `label` 含 GitHub 的会直接显示在卡片右下角）

## 部署到 GitHub Pages（第一次）

1. 打开 https://github.com 并登录（你的账号：`GinyvaXu`）。
2. 点击右上角 `+` → `New repository`：
   - Repository name 填：`personal-website`
   - 选择 **Public**（公开，别人才能访问）
   - 其他选项保持默认，点 `Create repository`
3. 把本文件夹里的所有文件上传到仓库（两种方式任选）：
   - **网页上传**：进入仓库 → `Add file` → `Upload files` → 把网站全部文件拖进去 → `Commit changes`
   - **本地推送**（需要装 Git，见「本地一键更新」）：按下面第 4 节操作
4. 开启网页托管：
   - 仓库页面 → `Settings` → 左侧 `Pages`
   - `Build and deployment` → Source 选 `Deploy from a branch`
   - Branch 选 `main`，目录选 `/ (root)`，点 `Save`
5. 等待 1–3 分钟，打开 `https://ginyvaxu.github.io/personal-website/` 即可访问。

> 小提示：部署完成后，可以用手机流量（不连自家 Wi-Fi）打开上面的网址，
> 确认别人也能正常访问。

## 日常更新（两种方式任选）

### 方式一：本地一键发布（推荐，需要先装 Git）

1. 安装 Git：https://git-scm.com/download/win（一路默认下一步）
2. 首次配置远程仓库（只需一次）：
   - 在本文件夹空白处点右键 → `Open Git Bash here`（或打开 PowerShell 并进入本文件夹）
   - 依次执行：
     ```
     git init
     git add -A
     git commit -m "首次提交"
     git branch -M main
     git remote add origin https://github.com/GinyvaXu/personal-website.git
     git push -u origin main
     ```
   - 如果 GitHub 要求登录，会弹出浏览器窗口，按提示授权即可
3. 以后每次改完内容，**双击 `发布更新.bat`**，等 1–3 分钟网页自动更新。

### 方式二：GitHub 网页版编辑（不装任何东西，手机上也能改）

1. 手机或电脑浏览器打开 `https://github.com/GinyvaXu/personal-website`
2. 进入 `data` 文件夹 → 打开 `site.js` 或 `projects.js`
3. 点铅笔图标 ✏️ 编辑，改完后点 `Commit changes`（可写一句说明）
4. 等待 1–3 分钟，网页自动更新。

## 让朋友访问

把网址发给对方即可：`https://ginyvaxu.github.io/personal-website/`
（因为是公开仓库，任何人打开这个网址都能看到你的网页）

## 自定义域名（可选，以后想用再弄）

在 `Settings → Pages → Custom domain` 里填你的域名，
并按提示到域名服务商添加一条 CNAME 解析记录即可（需购买域名）。

## 常见问题

- **为什么数据文件是 `.js` 而不是 `.json`？**
  因为双击本地打开时，浏览器禁止读取本地的 JSON 文件（安全限制）。
  用 `.js` 数据文件可以保证「双击即可预览」，且 GitHub 网页版编辑方式完全一样。
- **改完内容网页没变化？**
  GitHub Pages 更新需要 1–3 分钟；浏览器里按 `Ctrl + F5` 强制刷新。
- **发布更新.bat 提示失败？**
  检查 Git 是否安装、是否已完成「首次配置远程仓库」步骤；
  也可以看 README 的「部署到 GitHub Pages」部分。
- **不想公开某个项目？**
  在 `data/projects.js` 里删掉对应那条 `{ ... },` 即可。

## 隐私提示

仓库和网页是公开的，请勿在网站文件（含数据文件）中填写身份证号、密码等敏感信息。