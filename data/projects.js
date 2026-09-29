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
 *      - "screenshots" 界面截图数组（可选），如 [{"src": "assets/xxx/1.png", "caption": "说明"}]
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
    "id": "project-dock",
    "name": "ProjectDock · 项目坞",
    "type": "软件",
    "status": "进行中",
    "featured": true,
    "screenshots": [
      {"src": "assets/projectdock/main.png", "caption": "ProjectDock 主界面"}
    ],
    "summary": "本地项目文件管理器 · iOS 风格 · 内置 AI 项目助手 · 全自动版本与归档管理",
    "detail": "把你的所有项目文件夹收进一个清爽的 iOS 风格界面，统一创建、初始化、管理版本与构建产物，并让 AI agent 直接帮你干活——先备份，再执行，后报告。内置 软件/网站/游戏/PPT/文稿/脚本/其他 7 类项目预设，一键初始化骨架（README/VERSION/CHANGELOG/.gitignore/AGENTS.md）+ git init + 首次提交，可选自动创建并推送 GitHub 仓库；每个项目可一键生成 iOS 风格图标或上传自定义图片；SQLite 索引 + 磁盘扫描双轨管理，读取 VERSION/CHANGELOG/versions 直接呈现版本迭代、更新日志与构建产物；发布向导一条龙（版本号 → 更新日志 → 构建 → git tag → 提交）；内置 AI 助手（pi / Claude Code 可切换），流式回显 + 任务前自动备份 + 任务后 Git 报告；每个项目独立 AI 操作日志时间线；备份一键快照/恢复（路径穿越防护）；工具只创建与归档，永不擅自删除。v1.1–v1.3 再进化：GitHub 远程仓库管理（内置登录、README 内嵌渲染、一键创建并推送）、总控台 AI 助手对话（多轮上下文 + pdchoice 可点击决策卡片 + 全屏对话）、技术栈文档 TECHSTACK.md（技术栈 Tab / 在线编辑 / AI 撰写 / CLI 子命令）。",
    "tech": ["Python 3.12", "FastAPI", "SQLite", "pywebview", "HTML/CSS/JS", "PyInstaller", "Inno Setup"],
    "highlights": ["iOS 风格毛玻璃 UI", "7 类项目预设一键初始化", "图标生成管线", "GitHub 仓库管理", "版本与构建管理", "发布向导", "AI 助手对话 + 决策卡片", "技术栈文档 TECHSTACK", "备份恢复", "合规化检查"],
    "page": "projects/projectdock/",
    "downloads": [
      {"label": "Windows 安装包", "url": "https://dl.ginyva.site/releases/projectdock/latest/ProjectDock_Setup_v1.3.1.exe", "size": "18.5 MB"}
    ],
    "links": [
      {"label": "GitHub 仓库", "url": "https://github.com/GinyvaXu/ProjectDock"},
      {"label": "发布页", "url": "https://github.com/GinyvaXu/ProjectDock/releases"}
    ],
    "lastUpdate": "v1.3.1 · 2026-08-15 — 技术栈文档 TECHSTACK.md 上线（技术栈 Tab / AI 撰写 / CLI 子命令）；总控台 AI 对话与 Agent 选择卡片；160 测试通过 / 覆盖率 83.32%"
  },
  {
    "id": "agent-float",
    "name": "AgentFloat · AI Agent 桌面悬浮助手",
    "type": "软件",
    "status": "进行中",
    "featured": false,
    "screenshots": [
      {"src": "assets/agentfloat/about.png", "caption": "设置页 · 关于"},
      {"src": "assets/agentfloat/api-light.png", "caption": "API 用量 · 浅色"},
      {"src": "assets/agentfloat/api-dark.png", "caption": "API 用量 · 深色"}
    ],
    "summary": "通用多能 AI Agent 桌面悬浮助手：毛玻璃浮窗 + 双通道环绕菜单 + Web 套壳设置 + Agent 一键安装 + API 用量监控 + AI 快报，一个浮窗唤醒整个 AI 工作流。",
    "detail": "一颗毛玻璃小球收纳你的整个 AI 工作流：点击即启动任意 Agent（Claude Code / Codex CLI / Pi / DeepSeek Harness 可切换），悬停或长按唤出环形菜单，4/6/8 扇区随心分配动作；内置 Skills 辅助窗（本机 skills 扫描 + 中英对照）、通用 JSONPath 的 API 余额监控（低余额变色警告）、多源聚合的 AI 快报（Hacker News / GitHub Trending / 少数派 / 量子位 / arXiv + 本地 Agent 摘要）、剪贴板历史与自定义命令面板。支持亮/暗双主题、自由拖拽、贴边吸附、系统托盘、开机自启与全局热键 Ctrl+Alt+C。v2.x 大升级：设置 / API 用量 / AI 快报整体迁移为 Web 套壳界面（FastAPI + pywebview，Apple 风格侧边栏 + SSE 实时推送）；统一 Agent 启动器新增 DeepSeek Harness（dsh，Web UI 模式自动就绪并打开浏览器）；Web 设置新增「Agent 安装」模块，一键安装 / 升级 / 卸载（npm 全局安装，国内镜像优先自动回退官方源）。",
    "tech": ["Python", "PyQt5", "FastAPI", "pywebview", "JSONPath", "PyInstaller", "Inno Setup"],
    "highlights": ["毛玻璃浮窗 · 双主题", "环绕菜单扇区自选", "统一多 Agent 启动（含 dsh）", "Agent 一键安装 / 升级", "Web 套壳设置界面", "Skills 辅助窗", "API 余额监控", "AI 快报聚合"],
    "page": "projects/agentfloat/",
    "downloads": [
      {"label": "Windows 安装包（beta）", "url": "https://dl.ginyva.site/releases/agentfloat/latest/AgentFloat-Setup-3.0.0.exe", "size": "45.2 MB"}
    ],
    "links": [
      {"label": "GitHub 仓库", "url": "https://github.com/GinyvaXu/AgentFloat"},
      {"label": "发布页", "url": "https://github.com/GinyvaXu/AgentFloat/releases"}
    ],
    "lastUpdate": "v2.2.0 · 2026-08-16 — Web 设置新增 Agent 安装模块（Claude Code / Codex / Pi / DeepSeek Harness 一键装升卸）；Web 套壳界面与多项稳定性修复"
  },
  {
    "id": "ginyscreen",
    "name": "GinyScreen · 一起看屏幕",
    "type": "软件",
    "status": "进行中",
    "featured": false,
    "screenshots": [
      {"src": "assets/ginyscreen/login.png", "caption": "首页 · 输入昵称即可建房"},
      {"src": "assets/ginyscreen/room.png", "caption": "房间 · 语音与屏幕共享"}
    ],
    "summary": "自托管联机屏幕共享 + 语音：和朋友一起看视频 / 电影 / 游戏，输入房号即加入，WebRTC P2P 直连、无需注册。",
    "detail": "把自己变成一台小型直播服务器：创建房间分享屏幕（可同时传系统声音），朋友用浏览器或客户端输入 IP:端口即加入；WebRTC P2P mesh 直连，画质可选 1080p60 / 720p / 480p 并支持在线切换，观看端有全屏与系统级画中画、画面比例自适应；内置语音频道（说话指示灯、AEC 回声消除、逐人音量），共享窗口时可只传该窗口的声音；内嵌 Radmin VPN 一键联机（自动检测虚拟 IP 并填入），也支持 SakuraFrp 公网穿透；Electron 三形态分发（Debug / 便携 / 安装），安装版带多镜像自动更新与 PE 校验。",
    "tech": ["Node.js", "Electron", "WebRTC", "Socket.IO", "Radmin VPN", "NSIS"],
    "highlights": ["屏幕共享（含系统声音）", "内置语音 + AEC 回声消除", "Radmin VPN 内嵌联机", "全屏 / 系统级画中画", "房间聊天", "多镜像自动更新"],
    "page": "projects/ginyscreen/",
    "downloads": [
      {"label": "Windows 安装包", "url": "https://dl.ginyva.site/releases/ginyscreen/latest/GinyScreen-Setup-v1.5.1.exe", "size": "130 MB"},
      {"label": "便携版", "url": "https://dl.ginyva.site/releases/ginyscreen/latest/GinyScreen-Portable-v1.5.1.exe", "size": "129.8 MB"},
      {"label": "Debug 版", "url": "https://dl.ginyva.site/releases/ginyscreen/latest/GinyScreen-Debug-v1.5.1.exe", "size": "129.8 MB"}
    ],
    "links": [
      {"label": "GitHub 仓库", "url": "https://github.com/GinyvaXu/GinyScreen"},
      {"label": "发布页", "url": "https://github.com/GinyvaXu/GinyScreen/releases"}
    ],
    "lastUpdate": "v1.5.1 · 2026-08-16 — 房间聊天上线、切换服务器免重启、Radmin 联机自动启动修复；自动更新全链路（多镜像 + PE 校验）启用"
  },
  {
    "id": "cloudbox",
    "name": "CloudBox · 跨设备云存储",
    "type": "软件",
    "status": "进行中",
    "featured": false,
    "screenshots": [
      {"src": "assets/cloudbox/welcome.png", "caption": "欢迎页 · 首次使用向导"},
      {"src": "assets/cloudbox/settings.png", "caption": "设置 · 云存储配置向导"}
    ],
    "summary": "个人跨设备云存储：两台电脑之间随时上传 / 下载 / 删除文件，S3 兼容（R2 / OSS / COS / MinIO），支持文件夹自动同步。",
    "detail": "把 Cloudflare R2（免费 10GB）、阿里云 OSS、腾讯云 COS 或自建 MinIO 变成你的私人网盘中转站：上传 / 下载 / 删除带实时进度，指定文件夹自动双向同步（冲突自动保留双份副本）；配置向导内置四家服务商模板，Access Key 只存本地 config.json 且被 .gitignore 排除；单文件免安装 exe，内置 GitHub Releases 自动更新（多镜像 + PE 校验 + 静默升级）。路线图：分片上传、拖拽上传、更细的同步过滤。",
    "tech": ["Python 3.12", "pywebview", "boto3", "S3 API", "PyInstaller"],
    "highlights": ["S3 兼容（R2 / OSS / COS / MinIO）", "文件夹自动同步 + 冲突双份", "上传下载实时进度", "便携单文件免安装", "GitHub Releases 自动更新"],
    "page": "projects/cloudbox/",
    "downloads": [
      {"label": "Windows 便携版（debug）", "url": "https://dl.ginyva.site/releases/cloudbox/latest/CloudBox_debug_v0.1.0.exe", "size": "158 MB"}
    ],
    "links": [
      {"label": "GitHub 仓库", "url": "https://github.com/GinyvaXu/cloudbox-portable"},
      {"label": "发布页", "url": "https://github.com/GinyvaXu/cloudbox-portable/releases"}
    ],
    "lastUpdate": "v0.1.0 · 2026-09-02 — 首个版本：云文件管理、文件夹自动同步、四家服务商配置向导、自动更新链路"
  },
  {
    "id": "gallery-manager",
    "name": "Gallery Super Manager · 本地图库管理器",
    "type": "软件",
    "status": "进行中",
    "featured": false,
    "screenshots": [
      {"src": "assets/gallery-manager/grid.png", "caption": "图库 · 筛选与网格"},
      {"src": "assets/gallery-manager/cards.png", "caption": "浏览 · 缩略图与文件名信息"}
    ],
    "summary": "本地优先的动漫 / 插画图库管理器：内容指纹标注、标签包含 / 排除筛选、画布视图、可选 AI 自动打标，零 npm 依赖。",
    "detail": "给几千张图库做一个「不会丢标注」的相册：标注按图片内容指纹（SHA-1）记录，改名、移动、换目录都不丢；不信任扩展名，按文件头嗅探真实格式；内容完全相同的图自动折叠；0.5–5 星级 + 多维标签（支持别名与同义词），筛选支持 +包含 / −排除 组合；键盘流标注（1–5 星、f 喜欢、d 待删、空格复核下一张）；画布视图把图片铺成可拖拽缩放的画布；批量导入导出、自动备份（每次写入留 .bak、每天快照保留 45 天）；可选接入 WD tagger（ONNX）本地 AI 打标并进入待复核队列。Node 原生模块 + 系统 GDI+ 生成缩略图，无需 npm install，Windows 双击即用。",
    "tech": ["Node.js 18+", "原生 HTML/CSS/JS", "GDI+", "ONNX（可选）", "本地优先"],
    "highlights": ["内容指纹标注（改名不丢）", "文件头格式嗅探", "重复图折叠", "标签包含 / 排除筛选", "画布视图", "可选 AI 自动打标", "自动备份"],
    "page": "projects/gallery/",
    "links": [
      {"label": "GitHub 仓库", "url": "https://github.com/GinyvaXu/anime-gallery-manager"}
    ],
    "lastUpdate": "2026-09-14 · 首版开源（MIT）— 内容指纹标注、标签筛选、画布视图、可选 ONNX 自动打标"
  },
  {
    "id": "hexwar",
    "name": "守望圣山 · 回合制战棋",
    "type": "游戏",
    "status": "进行中",
    "featured": false,
    "screenshots": [
      {"src": "assets/hexwar/deploy.png", "caption": "战前部署 · 兵种与出生点"},
      {"src": "assets/hexwar/battle.png", "caption": "战局全览 · 26×16 六边形战场"}
    ],
    "summary": "六边形 2D 战棋：兵营部署、城镇经济、士气与溃散、地形克制，双人对战（在线 / 热座），Windows 一键安装与自动更新。",
    "detail": "一款致敬经典兵棋的 2D 回合制战棋 Demo：26×16 六边形战场，7 类兵种（线列步兵 / 骠骑兵 / 猎兵 / 胸甲骑兵 / 步炮兵 / 掷弹兵 / 近卫步兵）各有近战 / 远程 / 防御 / 移动 / 射程数值；概率伤害分档（100% / 75% / 50% / 20%），士气与溃散（归零部队自动撤回兵营重整、可被打灭）、骑兵士气优势（高 40 点攻击 +50%）、重骑兵上下坡消耗与增益、炮兵重创震慑、士官光环；城镇 3×3 区域化并可扩建至 5×5，建筑可占领，农田 / 铁矿 / 木材与税收稳定度构成经济；内置地图编辑器与兵种编辑器，支持 JSON 导入导出分享；pywebview + WebView2 桌面应用，per-user 静默安装 + 国内多镜像自动更新（可配 Gitee 镜像）。下一步计划迁移 Godot 4.x。",
    "tech": ["Python", "pywebview", "WebView2", "原生 JS Canvas", "PyInstaller", "Inno Setup"],
    "highlights": ["六边形战棋", "士气 / 溃散 / 光环", "地形克制与概率伤害", "城镇经济与建筑占领", "地图 / 兵种编辑器", "多镜像自动更新"],
    "page": "projects/hexwar/",
    "downloads": [
      {"label": "Windows 安装包", "url": "https://dl.ginyva.site/releases/hexwar/latest/HexWarDemo-Setup-1.1.1.exe", "size": "17.6 MB"}
    ],
    "links": [
      {"label": "GitHub 仓库", "url": "https://github.com/GinyvaXu/HexWarDemo"},
      {"label": "发布页", "url": "https://github.com/GinyvaXu/HexWarDemo/releases"}
    ],
    "lastUpdate": "v1.1.1 · 2026-08-16 — 城镇区域化扩建、溃散回归兵营、士气光环、建筑占领；地图改为鼠标拖拽查看，编辑器支持 JSON 交换"
  },
  {
    "id": "nottingham-game",
    "name": "诺丁汉警长 · 桌游电子化",
    "type": "游戏",
    "status": "进行中",
    "featured": false,
    "summary": "把《诺丁汉警长》吹牛贿赂桌游做成 3–5 人联机派对游戏，Godot 4 开发中。",
    "detail": "桌游电子化企画：将《诺丁汉警长》的吹牛、贿赂、检查心理博弈搬上屏幕，目标支持 3–5 人联机（可补 AI 商人）；采用 Godot 4 引擎，已产出完整企画书与初期资源、构建产物。v1.7.x 完成局内界面重做与动效打磨（按钮手感 / 面板层次 / 暖色渐变背景 / 转场动画可关），地图与模组体系同步迭代。",
    "tech": ["Godot 4", "GDScript", "多人联机"],
    "highlights": ["完整企画书", "吹牛贿赂玩法", "联机架构设计", "动效与界面打磨"],
    "page": "projects/nottingham/",
    "downloads": [
      {"label": "Windows 安装包", "url": "https://dl.ginyva.site/releases/nottingham/latest/SheriffOfNottingham-Setup-1.7.5.exe", "size": "32.6 MB"}
    ],
    "links": [
      {"label": "GitHub 仓库", "url": "https://github.com/GinyvaXu/SheriffOfNottingham---Ultimate"},
      {"label": "发布页", "url": "https://github.com/GinyvaXu/SheriffOfNottingham---Ultimate/releases"}
    ],
    "lastUpdate": "v1.7.5 · 2026-08-09 — 界面美化与动效打磨（按钮手感 / 面板层次 / 暖色渐变 / 可关闭的转场动画），模组版本同步 1.7.5"
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
    "page": "projects/claudefloat/",
    "downloads": [
      {"label": "安装包", "url": "https://dl.ginyva.site/releases/claudefloat/latest/ClaudeFloat_Setup.exe", "size": "62.9 MB"},
      {"label": "便携版", "url": "https://dl.ginyva.site/releases/claudefloat/latest/ClaudeFloat.exe", "size": "52.5 MB"},
      {"label": "Debug 版", "url": "https://dl.ginyva.site/releases/claudefloat/latest/ClaudeFloat_debug.exe", "size": "52.5 MB"}
    ],
    "links": [
      {"label": "GitHub 仓库", "url": "https://github.com/GinyvaXu/ClaudeFloat"},
      {"label": "发布页", "url": "https://github.com/GinyvaXu/ClaudeFloat/releases"}
    ],
    "lastUpdate": "v2.0.0 · 2026-08-01 — API 监控模块拆分重构为 5 个独立模块、构建系统升级、修复多项 Bug"
  }
];
