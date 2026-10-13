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
    "id": "vidar",
    "name": "VIDAR · 维达",
    "type": "软件",
    "status": "进行中",
    "featured": false,
    "screenshots": [
      {"src": "assets/vidar/task-running.png", "caption": "任务页 · 一键出全套文档"},
      {"src": "assets/vidar/batch.png", "caption": "批量队列 · 多视频排队处理"},
      {"src": "assets/vidar/wizard.png", "caption": "LLM 接入向导 · 1 分钟配置"},
      {"src": "assets/vidar/history.png", "caption": "历史 · 断点续跑与重跑"},
      {"src": "assets/vidar/models.png", "caption": "模型管理 · 按显存推荐"}
    ],
    "summary": "把 B 站视频变成可读、可检索、可打印的知识文档：本地识别 + 大模型整理，自动省略广告，一条链接产出摘要/章节/逐字稿/大纲与 PDF·Word·EPUB。",
    "detail": "输入一条 B 站链接，VIDAR 自动完成：解析 → 只下音频 → 本地语音识别（faster-whisper，词级时间戳 + VAD 防幻觉）→ LLM 段级精修（原文/精修双版本可追溯）→ 广告识别与省略（成品省略、另存「省略广告版」记录）→ 章节切分 → map-reduce 摘要（结论 + 要点 + 章节小结，可跳回视频时间）→ 语段编辑（文章体排版、首行缩进两格）→ 关键帧截图 → 导出 Markdown / 报刊风与论文风 PDF / Word / EPUB / SRT 全套。支持外语视频自动翻译（双语对照）、多条视频批量队列、全流水线暂停 / 继续 / 释放显存、检查点续跑（ASR 按时间切片续识别）、模型管理与 LLM 接入向导。",
    "tech": ["Python 3.12", "PySide6", "faster-whisper", "yt-dlp", "ReportLab", "PyInstaller"],
    "highlights": ["本地语音识别（CUDA）", "广告自动省略", "结构化摘要 + 章节时间戳", "报刊/论文 PDF + Word + EPUB", "双语翻译对照", "批量队列", "断点续跑 / 暂停释放", "LLM 接入向导"],
    "page": "projects/vidar/",
    "downloads": [
      {"label": "Windows 便携版", "url": "https://github.com/GinyvaXu/VIDAR/releases/latest", "size": "约 179 MB"}
    ],
    "links": [
      {"label": "GitHub 仓库", "url": "https://github.com/GinyvaXu/VIDAR"},
      {"label": "发布页", "url": "https://github.com/GinyvaXu/VIDAR/releases"}
    ],
    "lastUpdate": "v0.14.0 · 2026-10-13 — 应用图标换新（清新薄荷）+ 全量代码审查 23 项修复（续跑时间戳 / 分P串档 / 广告变更下游重算 / 导出排版等）"
  },
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
      {"label": "Windows 安装包", "url": "https://github.com/GinyvaXu/ProjectDock/releases/download/v1.3.1/ProjectDock_Setup_v1.3.1.exe", "size": "18.5 MB"}
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
      {"src": "assets/agentfloat/orb-demo.gif", "caption": "环绕菜单动效 · 动图演示"},
      {"src": "assets/agentfloat/about.png", "caption": "设置页 · 关于（AF-2 新图标）"},
      {"src": "assets/agentfloat/api-light.png", "caption": "API 用量 · 浅色"},
      {"src": "assets/agentfloat/api-dark.png", "caption": "API 用量 · 深色"}
    ],
    "summary": "通用多能 AI Agent 桌面悬浮助手：毛玻璃浮窗 + 双通道环绕菜单 + Web 套壳设置 + Agent 一键安装 + API 用量监控 + AI 快报，一个浮窗唤醒整个 AI 工作流。",
    "detail": "一颗毛玻璃小球收纳你的整个 AI 工作流：点击即启动任意 Agent（Claude Code / Codex CLI / Pi / DeepSeek Harness 可切换），悬停或长按唤出环形菜单，4/6/8 扇区随心分配动作；内置 Skills 辅助窗（本机 skills 扫描 + 中英对照）、通用 JSONPath 的 API 余额监控（低余额变色警告）、多源聚合的 AI 快报（Hacker News / GitHub Trending / 少数派 / 量子位 / arXiv + 本地 Agent 摘要）、剪贴板历史与自定义命令面板。支持亮/暗双主题、自由拖拽、贴边吸附、系统托盘、开机自启与全局热键 Ctrl+Alt+C。v2.x 大升级：设置 / API 用量 / AI 快报整体迁移为 Web 套壳界面（FastAPI + pywebview，Apple 风格侧边栏 + SSE 实时推送）；统一 Agent 启动器新增 DeepSeek Harness（dsh，Web UI 模式自动就绪并打开浏览器）；Web 设置新增「Agent 安装」模块，一键安装 / 升级 / 卸载（npm 全局安装，国内镜像优先自动回退官方源）。v3.x 大版本：交互内核重写（启动提速约 7–10 倍、体量大幅瘦身），全流程弹簧动效与游戏式手势、环形菜单重做；新增 Agent 进程面板、API 用量页重构（手动拉取 / 多平台预设）、本地账户与 API Key 保险箱（加密托管 + 配置导出导入）、启动动画，并随附 Inno Setup 正式安装包（按用户安装、自带卸载）。v3.7.0 起启用 AF-2 全新品牌图标（旋涡徽记）：应用、托盘、安装器、任务栏与 Web 控制台品牌全部统一，浮球内部旋涡同步换新。v3.8.0 完成安全加固：本地接口鉴权（外部网页无法越权调用本地 API）+ 更新包 SHA256 完整性校验。",
    "tech": ["Python", "PyQt5", "FastAPI", "pywebview", "JSONPath", "PyInstaller", "Inno Setup"],
    "highlights": ["毛玻璃浮窗 · 双主题", "全流程弹簧动效 + 游戏式手势", "统一多 Agent 启动（含 dsh）", "本地账户 + API Key 保险箱", "Agent 进程面板", "Agent 一键安装 / 升级", "API 余额监控", "AI 快报聚合", "启动动画与正式安装包"],
    "page": "projects/agentfloat/",
    "downloads": [
      {"label": "Windows 安装包", "url": "https://github.com/GinyvaXu/AgentFloat/releases/download/v3.8.0/AgentFloat-Setup-3.8.0.exe", "size": "40.8 MB"}
    ],
    "links": [
      {"label": "GitHub 仓库", "url": "https://github.com/GinyvaXu/AgentFloat"},
      {"label": "发布页", "url": "https://github.com/GinyvaXu/AgentFloat/releases"}
    ],
    "lastUpdate": "v3.8.0 · 2026-10-07 — 安全加固（本地接口鉴权 / 更新包 SHA256 校验）+ 体验优化（设计令牌统一、多屏热插拔自愈、进程检测提速约 15 倍）"
  },
  {
    "id": "gracs",
    "name": "Gracs · 格瑞克斯（一起看屏幕）",
    "type": "软件 + 网页版",
    "status": "进行中",
    "featured": false,
    "screenshots": [
      {"src": "assets/gracs/lobby.png", "caption": "网页版 · 打开即用，输昵称建房/加入"},
      {"src": "assets/gracs/room.png", "caption": "房间 · 多宫格观看，系统声音一起看"},
      {"src": "assets/gracs/invite.png", "caption": "邀请 · 房间码 / 邀请链接 / 二维码"}
    ],
    "summary": "自托管屏幕共享：云房间网页版打开即用，6 位码 / 邀请链接让朋友（含手机）直接加入；媒体 WebRTC P2P 直连不经服务器，零外置联机软件，打洞失败自动走中继。",
    "detail": "Gracs（格瑞克斯）是一款自托管的屏幕共享工具：房间里谁都能开播，其他人跟着看，一起看视频、电影与游戏画面。网页版提供「云房间」——打开 gracs.ginyva.site 输入昵称就能建房，把 6 位房间码或邀请链接/二维码发给朋友（手机也可以）直接加入，开房者不需要公网 IP、不需要安装任何联机软件；画面与声音走 WebRTC P2P 直连、端到端加密，打洞失败自动走中继。零外置软件联机：内置 STUN/TURN、UPnP/NAT-PMP 自动端口映射与 IPv6/局域网直连，网络诊断页逐项给出人话结论。双链路：标准链路低延迟适合游戏；影院模式（WebCodecs 服务器中继）画质恒定适合看电影（桌面版开房）。画质档位（自动 / 电影 / 游戏 / 文字 / 省流）可实时切换，每位观看者独立自适应码率，质量面板实时显示码率、帧率、RTT、丢包、直连或中继与声音状态。观看端支持全屏（含手机 CSS 兜底）、系统级画中画、画面比例与逐人音量；桌面版为 Windows exe，内嵌服务器与系统声音，带多镜像自动更新。",
    "tech": ["WebRTC", "WebCodecs", "Cloudflare Workers", "Node.js", "Electron", "PWA"],
    "highlights": ["☁️ 云房间：免安装网页版，邀请链接/扫码即加入", "手机/平板直接观看（响应式 + 全屏兜底）", "标准链路 + 影院模式双链路", "画质实时切换 + 质量面板", "零外置软件联机（内置中继 / UPnP / IPv6）", "系统声音一起看（浏览器 / 桌面版）"],
    "page": "projects/gracs/",
    "downloads": [
      {"label": "网页版（免安装）", "url": "https://gracs.ginyva.site/", "size": "打开即用"},
      {"label": "Windows 桌面版", "url": "https://github.com/GinyvaXu/Gracs/releases/latest", "size": "见 Release"}
    ],
    "links": [
      {"label": "网页版直接使用", "url": "https://gracs.ginyva.site/"},
      {"label": "GitHub 仓库", "url": "https://github.com/GinyvaXu/Gracs"},
      {"label": "发布页", "url": "https://github.com/GinyvaXu/Gracs/releases"}
    ],
    "lastUpdate": "v2.2.0 · 2026-10-08 — 云房间网页版上线（gracs.ginyva.site 打开即用、邀请链接/扫码即加入）+ 系统声音不可用时自动仅画面降级"
  },
  {
    "id": "cloudbox",
    "name": "CloudBox · 跨设备云存储",
    "type": "软件",
    "status": "进行中",
    "featured": false,
    "screenshots": [
      {"src": "assets/cloudbox/demo.gif", "caption": "动图演示 · 文件夹自动同步"},
      {"src": "assets/cloudbox/welcome.png", "caption": "欢迎页 · 首次使用向导"},
      {"src": "assets/cloudbox/settings.png", "caption": "设置 · 云存储配置向导"}
    ],
    "summary": "个人跨设备云存储：两台电脑之间随时上传 / 下载 / 删除文件，S3 兼容（R2 / OSS / COS / MinIO），支持文件夹自动同步。",
    "detail": "把 Cloudflare R2（免费 10GB）、阿里云 OSS、腾讯云 COS 或自建 MinIO 变成你的私人网盘中转站：上传 / 下载 / 删除带实时进度，指定文件夹自动双向同步（冲突自动保留双份副本）；配置向导内置四家服务商模板，Access Key 只存本地 config.json 且被 .gitignore 排除；单文件免安装 exe，内置 GitHub Releases 自动更新（多镜像 + PE 校验 + 静默升级）。路线图：分片上传、拖拽上传、更细的同步过滤。",
    "tech": ["Python 3.12", "pywebview", "boto3", "S3 API", "PyInstaller"],
    "highlights": ["S3 兼容（R2 / OSS / COS / MinIO）", "文件夹自动同步 + 冲突双份", "上传下载实时进度", "便携单文件免安装", "GitHub Releases 自动更新"],
    "page": "projects/cloudbox/",
    "downloads": [
      {"label": "Windows 便携版（debug）", "url": "https://github.com/GinyvaXu/cloudbox-portable/releases/download/v0.1.0/CloudBox_debug_v0.1.0.exe", "size": "158 MB"}
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
      {"src": "assets/gallery-manager/demo.gif", "caption": "动图演示 · 键盘流标注"},
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
      {"src": "assets/hexwar/demo.gif", "caption": "动图演示 · 行军与冲锋"},
      {"src": "assets/hexwar/deploy.png", "caption": "战前部署 · 兵种与出生点"},
      {"src": "assets/hexwar/battle.png", "caption": "战局全览 · 26×16 六边形战场"}
    ],
    "summary": "六边形 2D 战棋：兵营部署、城镇经济、士气与溃散、地形克制，双人对战（在线 / 热座），Windows 一键安装与自动更新。",
    "detail": "一款致敬经典兵棋的 2D 回合制战棋 Demo：26×16 六边形战场，7 类兵种（线列步兵 / 骠骑兵 / 猎兵 / 胸甲骑兵 / 步炮兵 / 掷弹兵 / 近卫步兵）各有近战 / 远程 / 防御 / 移动 / 射程数值；概率伤害分档（100% / 75% / 50% / 20%），士气与溃散（归零部队自动撤回兵营重整、可被打灭）、骑兵士气优势（高 40 点攻击 +50%）、重骑兵上下坡消耗与增益、炮兵重创震慑、士官光环；城镇 3×3 区域化并可扩建至 5×5，建筑可占领，农田 / 铁矿 / 木材与税收稳定度构成经济；内置地图编辑器与兵种编辑器，支持 JSON 导入导出分享；pywebview + WebView2 桌面应用，per-user 静默安装 + 国内多镜像自动更新（可配 Gitee 镜像）。下一步计划迁移 Godot 4.x。",
    "tech": ["Python", "pywebview", "WebView2", "原生 JS Canvas", "PyInstaller", "Inno Setup"],
    "highlights": ["六边形战棋", "士气 / 溃散 / 光环", "地形克制与概率伤害", "城镇经济与建筑占领", "地图 / 兵种编辑器", "多镜像自动更新"],
    "page": "projects/hexwar/",
    "downloads": [
      {"label": "Windows 安装包", "url": "https://github.com/GinyvaXu/HexWarDemo/releases/download/v1.1.1/HexWarDemo-Setup-1.1.1.exe", "size": "17.6 MB"}
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
    "screenshots": [
      {"src": "assets/nottingham/demo.gif", "caption": "动图演示 · 市场装袋与查验"},
      {"src": "assets/nottingham/board.png", "caption": "市场与装袋 · 挑选过境货物"},
      {"src": "assets/nottingham/bribe.png", "caption": "宣布与查验 · 警长的抉择"}
    ],
    "summary": "把《诺丁汉警长》吹牛贿赂桌游做成 3–5 人联机派对游戏，Godot 4 开发中。",
    "detail": "桌游电子化企画：将《诺丁汉警长》的吹牛、贿赂、检查心理博弈搬上屏幕，目标支持 3–5 人联机（可补 AI 商人）；采用 Godot 4 引擎，已产出完整企画书与初期资源、构建产物。v1.7.x 完成局内界面重做与动效打磨（按钮手感 / 面板层次 / 暖色渐变背景 / 转场动画可关），地图与模组体系同步迭代。",
    "tech": ["Godot 4", "GDScript", "多人联机"],
    "highlights": ["完整企画书", "吹牛贿赂玩法", "联机架构设计", "动效与界面打磨"],
    "page": "projects/nottingham/",
    "downloads": [
      {"label": "Windows 安装包", "url": "https://github.com/GinyvaXu/SheriffOfNottingham---Ultimate/releases/download/v1.7.5/SheriffOfNottingham-Setup-1.7.5.exe", "size": "32.6 MB"}
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
    "screenshots": [
      {"src": "assets/claudefloat/demo.gif", "caption": "动图演示 · 一键启动"},
      {"src": "assets/claudefloat/ball.png", "caption": "悬浮球外观 · 毛玻璃双主题"}
    ],
    "summary": "AgentFloat 的前身：一键启动 Claude Code 的毛玻璃桌面悬浮启动器。",
    "detail": "AgentFloat 的前身作品。精致的 Windows 桌面悬浮按钮，一键启动 Claude Code；iOS 风格毛玻璃外观，支持亮色/暗色双主题、自由拖拽、边缘吸附、系统托盘、开机自启；内置 API 用量余额监控与 GitHub Releases 自动更新，提供安装包与便携版两种分发方式。",
    "tech": ["Python", "PyQt", "PyInstaller", "GitHub Releases"],
    "highlights": ["毛玻璃双主题", "API 余额监控", "自动更新", "安装包 + 便携版"],
    "page": "projects/claudefloat/",
    "downloads": [
      {"label": "安装包", "url": "https://github.com/GinyvaXu/ClaudeFloat/releases/download/v2.0.0/ClaudeFloat_Setup.exe", "size": "62.9 MB"},
      {"label": "便携版", "url": "https://github.com/GinyvaXu/ClaudeFloat/releases/download/v2.0.0/ClaudeFloat.exe", "size": "52.5 MB"},
      {"label": "Debug 版", "url": "https://github.com/GinyvaXu/ClaudeFloat/releases/download/v2.0.0/ClaudeFloat_debug.exe", "size": "52.5 MB"}
    ],
    "links": [
      {"label": "GitHub 仓库", "url": "https://github.com/GinyvaXu/ClaudeFloat"},
      {"label": "发布页", "url": "https://github.com/GinyvaXu/ClaudeFloat/releases"}
    ],
    "lastUpdate": "v2.0.0 · 2026-08-01 — API 监控模块拆分重构为 5 个独立模块、构建系统升级、修复多项 Bug"
  }
];
