/* ============================================================
 * 软件落地页配置（每项目：主色 / Hero / 演示 / 功能 / 深度展示 / 下载说明）
 * 由 js/landing-core.js 渲染；页面位于 projects/<id>/index.html
 * 图片来源：../../assets/<project>/…（含程序化渲染的配图与动图）
 * ============================================================ */
window.LANDINGS = {

  /* ---------------- VIDAR ---------------- */
  "vidar": {
    short: "VIDAR",
    logo: "../../assets/vidar/icon.png",
    accent: ["#0ea5e9", "#14b8a6"],
    heroTitle: "把 B 站视频，<em>变成可读的知识文档</em>",
    heroSub: "本地语音识别 + 大模型整理：一条链接产出结构化摘要、分章节目录、精修逐字稿、思维大纲与打印级 PDF / Word / EPUB；自动省略广告、断点续跑、批量队列，全程在自己电脑上完成。",
    trust: ["本地 ASR（faster-whisper）", "广告自动省略", "报刊/论文 PDF 一键出", "断点续跑不白跑"],
    heroMedia: "../../assets/vidar/task-running.png",
    demoSub: "粘贴链接 → 出稿：几张图看懂全流程。",
    demo: [
      { label: "① 一条链接开跑", src: "../../assets/vidar/task-running.png", caption: "粘贴 BV 号/链接 → 自动解析、下载音频、识别、精修、成稿，右侧实时步骤与日志。" },
      { label: "② 批量队列", src: "../../assets/vidar/batch.png", caption: "多条视频排队处理：失败不中断，每条都可续跑、可停止、可重试失败项。" },
      { label: "③ 大模型接入向导", src: "../../assets/vidar/wizard.png", caption: "选服务商 → 填 Key → 连通测试，1 分钟完成；环境变量已提供 Key 时不落盘。" },
      { label: "④ 历史与断点续跑", src: "../../assets/vidar/history.png", caption: "每个任务记住进度：一键继续 / 从任意步骤重跑 / 进度徽标一目了然。" }
    ],
    featuresTitle: "从视频到文档，全流程自动化",
    featuresSub: "下载 → 识别 → 精修 → 广告省略 → 章节 → 摘要 → 排版导出；每一步都可单独重跑。",
    features: [
      { icon: "🎙️", title: "本地语音识别", text: "faster-whisper large-v3（CUDA 加速）：词级时间戳 + VAD 防幻觉 + 幻听短语过滤，隐私不外流。" },
      { icon: "✂️", title: "段级精修", text: "LLM 去口水词、纠错别字、统一术语；原文/精修双版本保留，时间戳零漂移可追溯。" },
      { icon: "🚫", title: "广告自动省略", text: "识别赞助口播/带货引导/产品植入（宁缺毋滥），成品直接省略并留「省略广告」记录文件。" },
      { icon: "🧠", title: "结构化总结", text: "一句话结论 + 核心要点 + 章节小结；要点带时间戳，可点击跳回 B 站对应位置。" },
      { icon: "📄", title: "打印级导出", text: "报刊风 / 论文风 PDF、Word、EPUB（微信读书）、SRT 字幕与 Markdown 全套。" },
      { icon: "🌍", title: "双语翻译", text: "外语视频自动检测语言逐段翻译；精修稿 / PDF / EPUB / Word / SRT 双语对照。" }
    ],
    deep: [
      { kicker: "LOCAL", title: "识别在本机，隐私不外流", text: "语音识别走本机 GPU（faster-whisper），只有文稿文本才交给大模型；不配 LLM 也能跑完整条逐字稿。", bullets: ["本地 CUDA 推理（N 卡）", "无显卡自动回退 CPU", "模型外置、按显存一键下载"], media: "../../assets/vidar/models.png", caption: "模型管理 · 按显存推荐档位" },
      { kicker: "ROBUST", title: "1 小时长视频也敢跑", text: "12 步状态机逐段落盘：暂停 / 继续 / 释放显存、崩溃后从检查点接着跑；ASR 甚至按时间点切片续识别，不从头再来。", bullets: ["暂停 / 继续 / 释放显存", "失败步骤独立重跑", "批量队列失败不中断"], media: "../../assets/vidar/history.png", caption: "历史页 · 进度与续跑" },
      { kicker: "EXPORT", title: "不只是摘要，是可打印的成品", text: "同一份文稿渲染成报刊风 / 论文风 PDF、Word、EPUB 电子书与双语 SRT；正文自动分语段、首行缩进两格，直接能读、能打印。", bullets: ["报刊风 / 论文风 PDF", "EPUB 导入微信读书", "双语对照排版"], media: "../../assets/vidar/task-running.png", caption: "一键出全套文档" }
    ],
    dlSub: "Windows 便携版 · 解压即用；语音模型与大模型 API 自行配置（可选免费额度服务商）",
    os: "Windows 10 / 11（64 位）· NVIDIA 显卡加速（可选）",
    req: [
      "便携版解压双击即用；GUI 与命令行（VIDAR-CLI.exe）双入口",
      "语音识别模型约 3GB：VIDAR-CLI.exe model download large-v3 一键下载",
      "N 卡用户：VIDAR-CLI.exe gpu install 安装 CUDA 运行时（可选，约 1.5GB）",
      "大模型：首次启动接入向导（OpenCode Go / DeepSeek / 硅基流动 / Kimi / 智谱 / 本地 Ollama）"
    ]
  },

  /* ---------------- Gracs ---------------- */
  "gracs": {
    short: "Gracs",
    accent: ["#22d3ee", "#6366f1"],
    heroTitle: "把屏幕，<em>递给远方的人</em>",
    heroSub: "云房间网页版打开即用：输昵称建房，6 位房间码或邀请链接让朋友（含手机）直接加入；画面走 WebRTC P2P 直连、端到端加密，开房者不需要公网 IP、不需要任何联机软件。",
    trust: ["☁️ 云房间免安装", "P2P 直连 · 端到端加密", "零外置联机软件", "🎧 按应用采声"],
    webUrl: "https://gracs.ginyva.site/",
    webLabel: "网页版立即使用",
    heroMedia: "../../assets/gracs/room.png",
    demoSub: "从打开网页到朋友进房，不到一分钟。",
    demo: [
      { label: "① 打开即建房", src: "../../assets/gracs/lobby.png", caption: "输昵称 → 云房间 → 自动生成房间码与邀请链接。" },
      { label: "② 邀请与加入", src: "../../assets/gracs/invite.png", caption: "链接 / 二维码 / 6 位码，手机扫码直接进。" },
      { label: "③ 一起看屏幕", src: "../../assets/gracs/room.png", caption: "多宫格观看、点击聚焦；共享可带系统声音（可按应用）。" },
      { label: "④ 房间聊天", src: "../../assets/gracs/chat.png", caption: "成员 / 聊天页签、未读徽标，重进房间保留最近记录。" }
    ],
    featuresTitle: "不用联机软件，也不用装东西",
    featuresSub: "云信令 + P2P 直连 + 内置中继兜底，把「联机」这件事从使用步骤里删掉。",
    features: [
      { icon: "☁️", title: "云房间（免安装）", text: "网页版打开即用，房间码 / 邀请链接 / 二维码进出，跨网络免组网。" },
      { icon: "🔒", title: "P2P 直连 · 端到端加密", text: "画面与声音不经服务器；打洞失败自动走中继，依然加密。" },
      { icon: "🛟", title: "零外置联机软件", text: "内置 STUN/TURN、UPnP/NAT-PMP 打洞与 IPv6 / 局域网直连。" },
      { icon: "🎞️", title: "双链路可选", text: "标准链路低延迟适合游戏；影院模式画质恒定适合看电影。" },
      { icon: "📶", title: "画质可控可观测", text: "五档画质实时切换，逐观看者自适应码率 + 实时质量面板。" },
      { icon: "📱", title: "手机也能看", text: "响应式界面、扫码进入、全屏兜底与 PWA，手机即观看端。" },
      { icon: "🎧", title: "按应用采声 · 无回音", text: "只采集选定应用的声音，语音软件不被采进去也不被静音。" },
      { icon: "💬", title: "房间文字聊天", text: "成员 / 聊天页签、未读徽标，重进房间保留最近记录。" }
    ],
    deep: [
      { kicker: "CLOUD", title: "开房者不再需要「可被连接」", text: "云房间把信令托管到 Cloudflare：开房不暴露 IP、不用端口映射、不用组网；邀请链接指向公网页版，朋友手机扫码就能进。", bullets: ["6 位房间码 / 邀请链接", "手机扫码直接加入", "媒体仍走 P2P 直连"], media: "../../assets/gracs/lobby.png", caption: "网页版进入页 · 云房间" },
      { kicker: "SHARE", title: "一起看电影，画面不抖", text: "影院模式用 WebCodecs + 服务器中继把码率固定住，弱网也不忽明忽暗；标准链路则把延迟压到最低，适合游戏与互动。", bullets: ["影院 1080p30 / 游戏 1080p60", "文字档优先保清晰度", "共享中随时切换"], media: "../../assets/gracs/room.png", caption: "房间 · 大屏观看" },
      { kicker: "AUDIO", title: "只分享想分享的声音", text: "音频源可选「整机 / 跟随共享窗口 / 指定应用」：指定应用时只采集该应用的声音；语音软件不会被采进去、也不会被静音——边看边聊不再有回音。声卡驱动不兼容时桌面版自动启用兼容采集。", bullets: ["指定应用采声（Windows 进程回环）", "跟随共享窗口（窗口声音隔离）", "语音软件不受影响", "声卡不兼容自动兜底"], media: "../../assets/gracs/invite.png", caption: "邀请朋友一起看" }
    ],
    dlSub: "网页版免安装 · Windows 桌面版支持影院模式与本机开房",
    os: "Windows 10 / 11 + 任意现代浏览器",
    req: [
      "网页版：Edge / Chrome / Safari 打开 gracs.ginyva.site 即用（共享屏幕需桌面浏览器）",
      "桌面版：Windows 10 / 11（64 位），安装包 / 便携版任选",
      "联机：云房间免设置；本机开房模式内置中继与 UPnP，严格网络自动兜底",
      "手机：扫码进入即可观看（手机浏览器不支持采集屏幕）"
    ]
  },

  /* ---------------- CloudBox ---------------- */
  "cloudbox": {
    short: "CloudBox",
    accent: ["#3b82f6", "#06b6d4"],
    heroTitle: "两台电脑之间，<em>隔空放文件</em>",
    heroSub: "把 Cloudflare R2、阿里云 OSS、腾讯云 COS 或自建 MinIO 变成你的私人网盘中转站：上传 / 下载 / 删除，文件夹自动双向同步。",
    trust: ["S3 兼容", "密钥只存本地", "单文件免安装", "自动更新"],
    heroMedia: "../../assets/cloudbox/demo.gif",
    demoSub: "配置一次，之后全自动。",
    demo: [
      { label: "① 配置向导", src: "../../assets/cloudbox/welcome.png", caption: "首次使用向导：四家服务商模板任选。" },
      { label: "② 云存储设置", src: "../../assets/cloudbox/settings.png", caption: "填入 Endpoint / Bucket / 密钥，Access Key 只存本地。" },
      { label: "③ 自动同步（动图）", src: "../../assets/cloudbox/demo.gif", caption: "上传 / 下载实时进度，文件夹双向同步。" }
    ],
    featuresTitle: "文件在两台电脑之间流动起来",
    featuresSub: "一个单文件工具，接上你自己选的云。",
    features: [
      { icon: "🔒", title: "密钥只存本地", text: "config.json 保存在本机且被 .gitignore 排除，不上传。" },
      { icon: "📦", title: "四家服务商模板", text: "R2 / OSS / COS / MinIO 配置向导，填几个字段就能用。" },
      { icon: "🔁", title: "文件夹自动同步", text: "指定目录双向同步，冲突自动保留双份副本。" },
      { icon: "📊", title: "实时进度反馈", text: "上传 / 下载 / 删除都有进度与结果提示。" },
      { icon: "🧳", title: "单文件便携版", text: "免安装 exe，拷到 U 盘或新电脑直接可用。" },
      { icon: "🔄", title: "自动更新", text: "内置 GitHub Releases 自动更新（多镜像 + PE 校验 + 静默升级）。" }
    ],
    deep: [
      { kicker: "CONFIG", title: "配置向导：4 家服务商，填完就用", text: "选择服务商模板 → 填入 Endpoint / Bucket / Access Key → 完成。密钥只保存在本地 config.json，不经过任何第三方。", bullets: ["R2 / OSS / COS / MinIO 模板", "字段校验与连通性测试", "换服务商随时重配"], media: "../../assets/cloudbox/settings.png", caption: "设置 · 云存储配置向导" },
      { kicker: "SYNC", title: "文件夹双向同步，冲突不丢数据", text: "指定两台电脑上的文件夹：本机新增自动上传，远端变更自动拉回；两边同时修改时保留双份副本，永远不覆盖丢内容。", bullets: ["双向自动同步", "冲突保留双份", "指定目录白名单"], media: "../../assets/cloudbox/demo.gif", caption: "自动同步 · 动图演示" },
      { kicker: "PORTABLE", title: "一个 exe，随身携带", text: "免安装单文件；配合自动更新链路，走到哪台电脑都是熟悉的最新版本。", bullets: ["单文件免安装", "多镜像自动更新", "兼容 R2 免费 10GB 额度"], media: "../../assets/cloudbox/welcome.png", caption: "欢迎页 · 首次使用向导" }
    ],
    dlSub: "免费使用 · 单文件免安装 · S3 兼容",
    os: "Windows 10 / 11",
    req: ["系统：Windows 10 / 11（64 位）", "云存储：任意 S3 兼容服务（推荐 Cloudflare R2，免费 10GB）", "安装：免安装，双击即用；删除即卸载"]
  },

  /* ---------------- Gallery Super Manager ---------------- */
  "gallery-manager": {
    short: "Gallery Manager",
    accent: ["#e879f9", "#fb923c"],
    heroTitle: "几千张图，<em>也能一眼找到</em>",
    heroSub: "本地优先的动漫 / 插画图库管理器：标注按图片内容指纹记录，改名、移动、换目录都不丢；标签包含 / 排除筛选、画布视图、可选 AI 自动打标。",
    trust: ["零 npm 依赖", "Windows 双击即用", "内容指纹标注", "自动备份"],
    heroMedia: "../../assets/gallery-manager/demo.gif",
    demoSub: "浏览、标注、筛选，一条键盘流搞定。",
    demo: [
      { label: "① 键盘流标注（动图）", src: "../../assets/gallery-manager/demo.gif", caption: "选图 → 打星 → 收藏，全程键盘流完成。" },
      { label: "② 图库与筛选", src: "../../assets/gallery-manager/grid.png", caption: "标签包含 / 排除组合筛选 + 5 档星级。" },
      { label: "③ 缩略图与信息", src: "../../assets/gallery-manager/cards.png", caption: "文件名与标注信息一目了然，画布视图可拖拽缩放。" }
    ],
    featuresTitle: "为「不会丢的标注」而设计",
    featuresSub: "图库工具的痛点不是看图，而是管理。",
    features: [
      { icon: "🧬", title: "内容指纹标注", text: "标注按 SHA-1 内容指纹记录，改名 / 移动 / 换目录都不丢。" },
      { icon: "🔍", title: "文件头格式嗅探", text: "不信任扩展名，按文件头判断真实格式。" },
      { icon: "🗂", title: "重复图自动折叠", text: "内容完全相同的图片自动合并，不重复占位。" },
      { icon: "⭐", title: "标签与星级筛选", text: "+包含 / −排除 组合筛选，1–5 星级 + 喜欢 / 待删。" },
      { icon: "🖼", title: "画布视图", text: "把图片铺成可拖拽缩放的画布，适合大图库快速浏览。" },
      { icon: "🤖", title: "可选 AI 自动打标", text: "接入 WD tagger（ONNX）本地打标，进入待复核队列。" }
    ],
    deep: [
      { kicker: "TAG", title: "键盘流标注，手不离键盘", text: "1–5 数字键打星、f 喜欢、d 待删、空格复核下一张；所有标注写入本地库，并保留 .bak 与每日快照。", bullets: ["键盘流标注", "批量导入导出", "自动备份（.bak + 每日快照 45 天）"], media: "../../assets/gallery-manager/cards.png", caption: "浏览 · 缩略图与标注信息" },
      { kicker: "FILTER", title: "包含 / 排除，组合出你要的那一张", text: "多维标签支持别名与同义词；组合筛选 + 星级过滤，再大的图库也能收敛到目标。", bullets: ["标签别名 / 同义词", "包含与排除组合", "画布视图拖拽缩放"], media: "../../assets/gallery-manager/grid.png", caption: "图库 · 筛选与网格" },
      { kicker: "SAFE", title: "本地优先，数据在你手里", text: "零 npm 依赖、无云同步；标注与索引都在本地，写入前自动备份，坏了可回滚。", bullets: ["零依赖，双击启动", "写入前留 .bak", "45 天每日快照"], media: "../../assets/gallery-manager/grid.png", caption: "图库 · 筛选与网格" }
    ],
    dlUrl: "https://github.com/GinyvaXu/anime-gallery-manager/archive/refs/heads/main.zip",
    dlLabel: "下载源码包（GitHub）",
    dlSub: "开源（MIT）· 本地优先 · 零依赖",
    os: "Windows（可选 Node 18+）",
    req: ["运行：下载源码包解压，双击启动（Windows 自带 GDI+ 缩略图）", "可选：Node 18+ 与 ONNX 模型用于本地 AI 打标", "数据：图库与标注全部保存在本地"]
  },

  /* ---------------- 守望圣山 ---------------- */
  "hexwar": {
    short: "守望圣山",
    accent: ["#f59e0b", "#ef4444"],
    heroTitle: "在六边形战场上，<em>掷出你的骰子</em>",
    heroSub: "回合制战棋：兵营部署、城镇经济、士气与溃散、地形克制——7 类兵种、概率伤害分档，支持在线与热座双人对战。",
    trust: ["回合制战棋", "双人对战", "地图编辑器", "自动更新"],
    heroMedia: "../../assets/hexwar/battle.png",
    demoSub: "部署、开打、编辑——一局战棋的全部。",
    demo: [
      { label: "① 战前部署", src: "../../assets/hexwar/deploy.png", caption: "兵营部署 · 兵种与出生点。" },
      { label: "② 战局全览", src: "../../assets/hexwar/battle.png", caption: "26×16 六边形战场，地形与士气尽收眼底。" },
      { label: "③ 战斗演示（动图）", src: "../../assets/hexwar/demo.gif", caption: "选择骠骑兵 → 行军 → 冲锋 → 敌方溃散撤离。" }
    ],
    featuresTitle: "致敬经典兵棋的六个理由",
    featuresSub: "小巧的体积，完整的战棋回合。",
    features: [
      { icon: "⬡", title: "六边形 26×16 战场", text: "移动 / 射程 / 地形一览无余，支持拖拽查看任意角落。" },
      { icon: "🎲", title: "概率伤害分档", text: "100% / 75% / 50% / 20% 四档命中，拒绝无脑莽夫。" },
      { icon: "🚩", title: "士气与溃散", text: "士气归零的部队自动撤回兵营重整，途中可被拦截打灭。" },
      { icon: "🏘", title: "城镇经济", text: "3×3 区域可扩建至 5×5；农田 / 铁矿 / 木材 + 税收稳定度。" },
      { icon: "🧰", title: "编辑器与 JSON", text: "地图 / 兵种编辑器，支持 JSON 导入导出与分享。" },
      { icon: "🔄", title: "多镜像自动更新", text: "per-user 静默安装，国内镜像更新链路。" }
    ],
    deep: [
      { kicker: "ARMY", title: "7 类兵种，各有脾气", text: "线列步兵、骠骑兵、猎兵、胸甲骑兵、步炮兵、掷弹兵、近卫步兵——近战 / 远程 / 防御 / 移动 / 射程各有数值，地形克制与上坡下坡都会改变结果。", bullets: ["骑兵士气优势（高 40 点攻击 +50%）", "重骑兵上下坡消耗与增益", "炮兵重创震慑"], media: "../../assets/hexwar/deploy.png", caption: "战前部署 · 兵种与出生点" },
      { kicker: "MORALE", title: "士气、溃散与光环", text: "部队会因伤亡与侧翼威胁掉士气；归零即溃散回营。士官光环、兵种光环给周边友军加成——阵型本身就是战术。", bullets: ["溃散回归兵营", "士气光环范围加成", "建筑占领与稳定度"], media: "../../assets/hexwar/battle.png", caption: "战局全览 · 26×16 战场" },
      { kicker: "EDITOR", title: "把战场交给你自己", text: "内置地图编辑器与兵种编辑器：自建地形、调整数值，JSON 导入导出，和朋友交换你们的战场设计。", bullets: ["地图编辑器", "兵种编辑器", "JSON 交换分享"], media: "../../assets/hexwar/deploy.png", caption: "战前部署 · 地图与出生点设置" }
    ],
    dlSub: "免费体验版 · Windows 一键安装 · 自动更新",
    os: "Windows 10 / 11",
    req: ["系统：Windows 10 / 11（64 位）", "运行库：WebView2（Windows 11 已内置）", "安装：下载安装包 → 双击；覆盖安装即可升级"]
  },

  /* ---------------- 诺丁汉警长 ---------------- */
  "nottingham-game": {
    short: "诺丁汉警长",
    accent: ["#22c55e", "#eab308"],
    heroTitle: "吹牛、贿赂，<em>或者被查</em>",
    heroSub: "《诺丁汉警长》桌游联机版：3–5 人派对博弈，经典规则 + 皇家赏赐 + 黑市任务，支持 AI 商人、断线重连与 TCP 直连联机。",
    trust: ["3–5 人联机", "AI 商人陪玩", "模组系统", "中英双语"],
    heroMedia: "../../assets/nottingham/demo.gif",
    demoSub: "装袋、宣布、查验——一局的心理博弈。",
    demo: [
      { label: "① 市场与装袋（动图）", src: "../../assets/nottingham/demo.gif", caption: "从市场拿货装进袋子：合法货物 vs 违禁品。" },
      { label: "② 宣布与查验", src: "../../assets/nottingham/bribe.png", caption: "向警长宣布货物；他可以放行，也可以开袋查验。" }
    ],
    featuresTitle: "一张桌子上的六个心眼",
    featuresSub: "把吹牛、贿赂、检查的心理博弈搬上屏幕。",
    features: [
      { icon: "🧺", title: "经典吹牛与查验", text: "宣布的货物 vs 实际货物；查验对了警长收罚金，错了要赔偿。" },
      { icon: "👑", title: "皇家赏赐与黑市", text: "皇家货物高分高风险；黑市任务带来额外变数。" },
      { icon: "🤖", title: "三档 AI 对手", text: "人不够也能开局：从陪练到硬核随你挑。" },
      { icon: "🌐", title: "联机不掉线", text: "断线重连 + 结算返回房间；TCP 直连联机，无需服务器。" },
      { icon: "🧩", title: "模组系统", text: "mods/ 目录 + mod.json + ModAPI；损坏模组自动跳过不崩溃。" },
      { icon: "🎨", title: "界面与动效", text: "按钮手感 / 面板层次 / 暖色渐变 / 可关闭的转场动画。" }
    ],
    deep: [
      { kicker: "HAGGLE", title: "核心博弈：从市场到警长", text: "从市场挑选货物装袋 → 向警长宣布 → 警长选择放行或查验；查验错误要赔偿，收取的贿赂也要掂量后果——每一轮都是一次读心。", bullets: ["宣布 / 查验 / 罚金", "贿赂与信誉", "结算返回房间"], media: "../../assets/nottingham/board.png", caption: "市场与装袋 · 界面一览" },
      { kicker: "ONLINE", title: "3–5 人联机派对", text: "房间制联机支持断线重连；人不够时有 AI 商人补位，群里喊一嗓子就能开局。", bullets: ["TCP 直连联机", "断线重连", "AI 商人补位"], media: "../../assets/nottingham/demo.gif", caption: "联机对局 · 动图演示" },
      { kicker: "MODS", title: "模组与双语", text: "内置模组管理界面：启用 / 禁用 / 刷新，加载错误直接显示；ModAPI 支持加合法货、加违禁品、加皇家货与补丁式修改。", bullets: ["mods/ + mod.json", "ModAPI 四类接口", "中英文界面"], media: "../../assets/nottingham/bribe.png", caption: "宣布与贿赂 · 界面一览" }
    ],
    dlSub: "免费体验版 · Windows 一键安装 · 支持联机",
    os: "Windows 10 / 11",
    req: ["系统：Windows 10 / 11（64 位）", "联机：TCP 直连（内网 / 公网 / 虚拟组网均可）", "安装：下载安装包 → 双击；控制面板可完整卸载"]
  },

  /* ---------------- ClaudeFloat ---------------- */
  "claude-float": {
    short: "ClaudeFloat",
    accent: ["#8b5cf6", "#0a84ff"],
    heroTitle: "一键，<em>唤醒 Claude Code</em>",
    heroSub: "AgentFloat 的前身：精致的 Windows 桌面悬浮按钮，点击即启动 Claude Code；毛玻璃双主题、贴边吸附、系统托盘、API 余额监控与自动更新。",
    trust: ["毛玻璃双主题", "一键启动", "API 余额监控", "自动更新"],
    heroMedia: "../../assets/claudefloat/demo.gif",
    demoSub: "一颗小球，省去每天的重复操作。",
    demo: [
      { label: "① 一键启动（动图）", src: "../../assets/claudefloat/demo.gif", caption: "点击悬浮球 → Claude Code 立即就绪。" },
      { label: "② 悬浮球外观", src: "../../assets/claudefloat/ball.png", caption: "毛玻璃质感，亮 / 暗双主题。" }
    ],
    featuresTitle: "小而顺手的六个细节",
    featuresSub: "它只做一件事：让启动 Claude Code 变成一次点击。",
    features: [
      { icon: "🫧", title: "毛玻璃浮窗", text: "亮 / 暗双主题，iOS 风格拟态与细腻阴影。" },
      { icon: "🚀", title: "一键启动", text: "点击即启动 Claude Code，省去开终端敲命令。" },
      { icon: "📌", title: "贴边吸附", text: "拖到屏幕边缘自动收纳，不挡视野。" },
      { icon: "🗂", title: "托盘常驻 + 开机自启", text: "随手可用，也可以安静待在托盘里。" },
      { icon: "📊", title: "API 余额监控", text: "余额低于阈值自动变色提醒。" },
      { icon: "🔄", title: "安装包 + 便携版", text: "两种分发方式，内置 GitHub Releases 自动更新。" }
    ],
    deep: [
      { kicker: "LAUNCH", title: "单击即启", text: "悬浮球常驻桌面：点击启动 Claude Code；也可以拖拽、贴边、最小化到托盘——它不会打扰你，但一直都在。", bullets: ["单击启动", "自由拖拽 / 贴边吸附", "支持开机自启"], media: "../../assets/claudefloat/demo.gif", caption: "一键启动 · 动图演示" },
      { kicker: "THEME", title: "双主题毛玻璃", text: "亮色清透、暗色沉稳；跟随系统或手动切换，桌面上的一件小摆设也值得好看。", bullets: ["亮 / 暗双主题", "跟随系统", "细腻阴影与高光"], media: "../../assets/claudefloat/ball.png", caption: "悬浮球外观" },
      { kicker: "UPDATE", title: "安静地保持最新", text: "内置 GitHub Releases 自动更新；API 余额监控常驻托盘，提醒你该充值的时候不装死。", bullets: ["自动更新", "API 余额变色提醒", "安装包 / 便携版双分发"], media: "../../assets/claudefloat/demo.gif", caption: "启动全流程 · 动图演示" }
    ],
    dlSub: "免费使用 · 安装包 + 便携版",
    os: "Windows 10 / 11",
    req: ["系统：Windows 10 / 11（64 位）", "前置：已安装 Claude Code CLI（npm install -g @anthropic-ai/claude-code）", "安装：安装包或便携版任选；覆盖安装即可升级"]
  }
};
