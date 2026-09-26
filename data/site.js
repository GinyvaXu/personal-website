/* ============================================================
 * 站点信息（个人信息 + 社交链接）
 * ------------------------------------------------------------
 * 这是一个「长得像 JSON」的 JS 数据文件，网站的所有个人信息都在这。
 * 更新方法：直接编辑下面的内容，保存后重新打开 index.html
 * 即可看到变化（或按 README.md 发布到 GitHub Pages）。
 *
 * 填写注意：
 *   - 所有值都要用英文双引号 " 包起来
 *   - 字段之间用英文逗号 , 分隔
 *   - "name"      主显示名（页脚、头像 alt、默认标题用）
 *   - "names"     轮换显示的名字列表（Hero 与顶部导航会轮流切换）
 *   - "tagline"   Hero 副标题
 *   - "about"     关于我段落
 *   - "danmaku"   首页弹幕配置（开启步骤见 README「弹幕」一节）
 *   - 社交链接不需要的，留空 "" 即可（对应的图标会自动隐藏）
 * ============================================================ */
window.SITE_DATA = {
  "name": "Ginyva",
  "names": ["Ginyva", "八奈見真尋"],
  "avatar": "assets/我的头像.jpg",
  "tagline": "无尽界限",
  "about": "你好，我是 Ginyva / 八奈見真尋，一个爱折腾的独立开发者。当前主力项目是 ProjectDock（项目坞）——把本地项目收进 iOS 风格的界面，统一管理版本、构建、备份与发布，并让 AI agent 直接参与开发闭环。围绕它还有一整套自研工具链：AI 桌面浮窗助手 AgentFloat、自托管联机开黑工具 GinyScreen、跨设备云存储 CloudBox、本地插画图库管理器，以及《守望圣山》战棋与《诺丁汉警长》桌游电子化。一切美好的事物都是曲折地接近自己的目标，一切笔直都是骗人的，所有真理都是弯曲的。",
  "socials": {
    "github": "https://github.com/GinyvaXu",
    "steam": "https://steamcommunity.com/profiles/76561198965163771/",
    "email": "kuangshi.xu@icloud.com",
    "wechat": "",
    "qq": "2272367258",
    "bilibili": "https://space.bilibili.com/494464519",
    "weibo": "",
    "douyin": ""
  },
  "danmaku": {
    "enabled": true,
    "demo": true,
    "supabaseUrl": "https://nqyzlbqqxpwjxfrxhqnn.supabase.co",
    "supabaseAnonKey": "sb_publishable_1Pwm_xixqJWBA2Dz7ZkeHQ_cFmwwUGV",
    "pollMs": 15000,
    "maxVisible": 20
  }
};
