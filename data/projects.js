/* ============================================================
 * 项目列表（本文件是网站的「项目数据库」）
 * ------------------------------------------------------------
 * 如何新增一个项目：
 *   1. 复制下面任意一条 { ... }, 并粘贴到数组的最前面
 *   2. 修改其中的字段：
 *      - "id"         唯一英文标识（随意，如 "my-new-project"）
 *      - "name"       项目名称
 *      - "type"       分类：软件 / 游戏 / PPT / 文稿
 *      - "status"     状态：已完成 / 进行中
 *      - "featured"   当前主力项目（true 会显示在主页「主力项目」模块，建议只置 1 个）
 *      - "summary"    卡片上的一句话简介
 *      - "detail"     详情弹窗中的详细介绍（可写多句）
 *      - "tech"       技术标签，如 ["Python", "PyQt5"]
 *      - "highlights" 亮点列表（可选，留空 [] 即可）
 *      - "links"      外部链接，如 [{"label":"GitHub 仓库","url":"https://..."}]；
 *                     每个项目建议至少放一个 GitHub 仓库地址
 *      - "lastUpdate" 最新一次更新日志（会显示在卡片和详情弹窗里）
 *   3. 保存文件，重新打开 index.html 或按 README.md 发布即可
 *
 * 注意：所有内容用英文双引号；数组元素之间用英文逗号。
 * ============================================================ */
window.PROJECTS = [
  {
    "id": "agent-float",
    "name": "AgentFloat · AI Agent 桌面悬浮助手",
    "type": "软件",
    "status": "进行中",
    "featured": true,
    "summary": "通用多能 AI Agent 桌面悬浮助手：毛玻璃浮窗 + 双通道环绕菜单 + Skills 辅助窗 + API 用量监控 + AI 快报，一个浮窗唤醒整个 AI 工作流。",
    "detail": "一颗毛玻璃小球收纳你的整个 AI 工作流：点击即启动任意 Agent（Claude Code / Codex CLI / 自定义命令），悬停或长按唤出环形菜单，4/6/8 扇区随心分配动作；内置 Skills 辅助窗（本机 skills 扫描 + 中英对照）、通用 JSONPath 的 API 余额监控（低余额变色警告）、多源聚合的 AI 快报（Hacker News / GitHub Trending / 少数派 / 量子位 / arXiv + 本地 Agent 摘要）、剪贴板历史与自定义命令面板。支持亮/暗双主题、自由拖拽、贴边吸附、系统托盘、开机自启与全局热键 Ctrl+Alt+C。",
    "tech": ["Python", "PyQt5", "JSONPath", "PyInstaller", "Inno Setup"],
    "highlights": ["毛玻璃浮窗 · 双主题", "环绕菜单扇区自选", "通用多 Agent 启动", "Skills 辅助窗", "API 余额监控", "AI 快报聚合"],
    "links": [
      {"label": "GitHub 仓库", "url": "https://github.com/GinyvaXu/AgentFloat"},
      {"label": "发布页", "url": "https://github.com/GinyvaXu/AgentFloat/releases"}
    ],
    "lastUpdate": "v1.3.0 · 2026-08-09 — 安装/卸载/自动更新链路重构、设置页新增更新卡片、多项 UI 修复"
  },
  {
    "id": "claude-float",
    "name": "ClaudeFloat 桌面浮窗启动器",
    "type": "软件",
    "status": "已完成",
    "summary": "AgentFloat 的前身：一键启动 Claude Code 的毛玻璃桌面悬浮启动器。",
    "detail": "AgentFloat 的前身作品。精致的 Windows 桌面悬浮按钮，一键启动 Claude Code；iOS 风格毛玻璃外观，支持亮色/暗色双主题、自由拖拽、边缘吸附、系统托盘、开机自启；内置 API 用量余额监控与 GitHub Releases 自动更新，提供安装包与便携版两种分发方式。",
    "tech": ["Python", "PyQt", "PyInstaller", "GitHub Releases"],
    "highlights": ["毛玻璃双主题", "API 余额监控", "自动更新", "安装包 + 便携版"],
    "links": [
      {"label": "GitHub 仓库", "url": "https://github.com/GinyvaXu/ClaudeFloat"},
      {"label": "发布页", "url": "https://github.com/GinyvaXu/ClaudeFloat/releases"}
    ],
    "lastUpdate": "v2.0.0 · 2026-08-01 — API 监控模块拆分重构为 5 个独立模块、构建系统升级、修复多项 Bug"
  },
  {
    "id": "seat-arranger",
    "name": "考试座位表自动排列",
    "type": "软件",
    "status": "已完成",
    "summary": "考场座位随机分配系统，支持标签约束，一键生成 Excel 座位表。",
    "detail": "通用考场随机分配系统（v2.2.0.2），基于 Python 3.12 + PyQt5 + openpyxl；支持按标签约束规则随机排座，输出 Excel 座位表，并记录运行日志。",
    "tech": ["Python", "PyQt5", "openpyxl"],
    "highlights": ["标签约束排座", "Excel 输出", "运行日志"],
    "links": [
      {"label": "GitHub 仓库", "url": "https://github.com/GinyvaXu/SeatArranger"}
    ],
    "lastUpdate": "v2.2.0.2 · 2026-07-17 — 标签复选框显示人数统计、遗漏学生弹窗警告；自 v2.2 起支持标签约束排列系统"
  },
  {
    "id": "webp2pdf",
    "name": "图片批量转 PDF 工具",
    "type": "软件",
    "status": "已完成",
    "summary": "将 WEBP / ZIP 等格式的图片批量转换为 PDF 的桌面小工具。",
    "detail": "桌面图片转换工具，支持将 WEBP、ZIP 等格式的图片批量合并转换为 PDF；图形化界面操作，支持多语言（中文 / English）、封面预览与代理设置。",
    "tech": ["Python", "PyQt5", "Pillow", "reportlab"],
    "highlights": ["批量转换", "图形界面", "多语言"],
    "links": [],
    "lastUpdate": "v3 · 2026-07-30 — 新增导出全部/选中功能、失败自动重试、多语言界面，修复若干交互问题"
  },
  {
    "id": "nottingham-game",
    "name": "诺丁汉警长 · 桌游电子化",
    "type": "游戏",
    "status": "进行中",
    "summary": "把《诺丁汉警长》吹牛贿赂桌游做成 3–5 人联机派对游戏，Godot 4 开发中。",
    "detail": "桌游电子化企画：将《诺丁汉警长》的吹牛、贿赂、检查心理博弈搬上屏幕，目标支持 3–5 人联机（可补 AI 商人）；采用 Godot 4 引擎，已产出完整企画书与初期资源、构建产物。",
    "tech": ["Godot 4", "GDScript", "多人联机"],
    "highlights": ["完整企画书", "吹牛贿赂玩法", "联机架构设计"],
    "links": [
      {"label": "GitHub 仓库", "url": "https://github.com/GinyvaXu/SheriffOfNottingham---Ultimate"},
      {"label": "发布页", "url": "https://github.com/GinyvaXu/SheriffOfNottingham---Ultimate/releases"}
    ],
    "lastUpdate": "v1.7.4 · 2026-08-03 — 修复 6 人局崩溃、字体加载校验、超长名字省略号截断"
  }
];
