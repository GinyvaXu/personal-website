/* ============================================================
 * Skills 仓库数据（与 share/skills/ 镜像文件一一对应）
 * 新增一个技能：把技能目录放进 share/skills/<id>/，并在下面加一条记录
 * ============================================================ */
window.SKILLS = [
  {
    "id": "super-brainstorm",
    "emoji": "🧠",
    "name": "超级头脑风暴",
    "badge": "opencode Skill",
    "cat": "效率",
    "desc": "把一个模糊念头，用多轮快问快答（每轮 2~4 题 + 选项详解页）逐步磨成完整框架与启动计划；唯一产物是一份可续写的风暴稿，越聊越清晰。",
    "tags": ["头脑风暴", "规划", "提问式"],
    "updated": "2026-10-08",
    "file": "share/skills/super-brainstorm/SKILL.md",
    "dlName": "super-brainstorm-SKILL.md",
    "size": "4.5 KB",
    "files": 1,
    "github": "https://github.com/GinyvaXu/ginyva-share/tree/main/skills/super-brainstorm",
    "cmd": "mkdir -p ~/.config/opencode/skills/super-brainstorm && curl -fsSL -o ~/.config/opencode/skills/super-brainstorm/SKILL.md \"https://cdn.jsdelivr.net/gh/GinyvaXu/ginyva-share@main/skills/super-brainstorm/SKILL.md\""
  },
  {
    "id": "projectdock-dev",
    "emoji": "🖥",
    "name": "ProjectDock 开发规范",
    "badge": "opencode Skill",
    "cat": "开发",
    "desc": "面向 ProjectDock（FastAPI + pywebview + iOS 风格 Web UI 桌面工具）的迭代开发规范：架构地图、新增功能流程、构建发布链路与常见坑；做同类桌面工具项目可参考。",
    "tags": ["项目规范", "Python", "发布流程"],
    "updated": "2026-10-11",
    "file": "share/skills/projectdock-dev/SKILL.md",
    "dlName": "projectdock-dev-SKILL.md",
    "size": "2.8 KB",
    "files": 1,
    "github": "https://github.com/GinyvaXu/ginyva-share/tree/main/skills/projectdock-dev",
    "cmd": "mkdir -p ~/.config/opencode/skills/projectdock-dev && curl -fsSL -o ~/.config/opencode/skills/projectdock-dev/SKILL.md \"https://cdn.jsdelivr.net/gh/GinyvaXu/ginyva-share@main/skills/projectdock-dev/SKILL.md\""
  }
];
