/* ============================================================
 * 软件落地页配置（每项目：主色 / Hero / 演示 / 功能 / 深度展示 / 下载说明）
 * 由 js/landing-core.js 渲染；页面位于 projects/<id>/index.html
 * 图片来源：../../assets/<project>/…（含程序化渲染的配图与动图）
 * ============================================================ */
window.LANDINGS = {

  /* ---------------- GinyScreen ---------------- */
  "ginyscreen": {
    short: "GinyScreen",
    accent: ["#22d3ee", "#0ea5e9"],
    heroTitle: "把屏幕，<em>递给远方的人</em>",
    heroSub: "自托管联机屏幕共享 + 语音：WebRTC P2P 直连，输入房号即加入——和朋友一起看视频、追剧、打游戏，无需注册、无需中转服务器。",
    trust: ["P2P 直连", "无需注册", "1080p60 可选", "免费使用"],
    heroMedia: "../../assets/ginyscreen/demo.gif",
    demoSub: "从建房到开看，三步就绪。",
    demo: [
      { label: "① 建房与加入", src: "../../assets/ginyscreen/login.png", caption: "输入昵称即可建房，朋友凭房号或 IP 加入。" },
      { label: "② 屏幕共享 + 语音", src: "../../assets/ginyscreen/room.png", caption: "共享可含系统声音，语音频道带 AEC 回声消除。" },
      { label: "③ 联机与画质（动图）", src: "../../assets/ginyscreen/demo.gif", caption: "1080p60 / 720p / 480p 随时切换；Radmin VPN 一键联机。" }
    ],
    featuresTitle: "一起看屏幕，也一起说话",
    featuresSub: "六个能力，覆盖从联机到画质的每一环。",
    features: [
      { icon: "🖥", title: "屏幕共享（含系统声音）", text: "共享窗口或整个桌面，可只转发该窗口的声音。" },
      { icon: "🎙", title: "内置语音频道", text: "说话指示灯、AEC 回声消除、逐人音量调节。" },
      { icon: "⚡", title: "WebRTC P2P 直连", text: "不经中转服务器，画面延迟取决于双方网络。" },
      { icon: "🎚", title: "画质随时切换", text: "1080p60 / 720p / 480p 在线切换，观看端自适应。" },
      { icon: "🔗", title: "内嵌联机三件套", text: "Radmin VPN 一键组网、SakuraFrp 穿透、公网 IP 直连。" },
      { icon: "🔄", title: "多镜像自动更新", text: "安装版带多镜像更新与 PE 校验，升级无感。" }
    ],
    deep: [
      { kicker: "SHARE", title: "把自己变成一台小型直播服务器", text: "创建房间 → 选择要共享的屏幕或窗口 → 朋友用浏览器或客户端加入；共享窗口时可只传该窗口的声音，看电影不会把通知音带过去。", bullets: ["全屏 / 系统级画中画", "画面比例自适应", "观看端浏览器直达，无需安装"], media: "../../assets/ginyscreen/room.png", caption: "房间界面 · 语音与屏幕共享" },
      { kicker: "VOICE", title: "像开黑一样自然地说话", text: "音频走 WebRTC，内置 AEC 回声消除与降噪；谁在说话一眼可见，每个人还能单独调音量。", bullets: ["说话指示灯", "逐人音量", "静音 / 免打扰"], media: "../../assets/ginyscreen/login.png", caption: "首页 · 输入昵称即可建房" },
      { kicker: "NETWORK", title: "不会联机？也帮你联好", text: "内嵌 Radmin VPN 一键组网（自动检测虚拟 IP 并填入）；也支持 SakuraFrp 公网穿透与纯 IP 直连。", bullets: ["Radmin VPN 内嵌", "SakuraFrp 穿透", "局域网 / 公网皆可"], media: "../../assets/ginyscreen/demo.gif", caption: "联机流程 · 动图演示" }
    ],
    dlSub: "免费使用 · P2P 直连 · 无需注册",
    os: "Windows 10 / 11",
    req: ["系统：Windows 10 / 11（64 位）", "联机：同一网络直连，或使用内置 Radmin VPN / 公网 IP", "安装：下载安装包 → 双击安装；覆盖安装即可升级"]
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
    heroMedia: "../../assets/gallery-manager/grid.png",
    demoSub: "浏览、标注、筛选，一条键盘流搞定。",
    demo: [
      { label: "① 图库与筛选", src: "../../assets/gallery-manager/grid.png", caption: "标签包含 / 排除组合筛选 + 5 档星级。" },
      { label: "② 缩略图与信息", src: "../../assets/gallery-manager/cards.png", caption: "文件名与标注信息一目了然，画布视图可拖拽缩放。" }
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
      { label: "② 战局全览", src: "../../assets/hexwar/battle.png", caption: "26×16 六边形战场，地形与士气尽收眼底。" }
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
