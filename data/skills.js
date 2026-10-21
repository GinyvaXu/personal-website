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
    "desc": "把一个模糊念头，用多轮快问快答（每轮 2~4 题 + 选项详解页）逐步磨成完整框架与启动计划；支持多产品线路线图、P 阶段 / G 决策门与名单时效核查，唯一正式产物是一份可续写的风暴稿。",
    "tags": ["头脑风暴", "规划", "提问式", "路线图"],
    "updated": "2026-10-21",
    "file": "share/skills/super-brainstorm/SKILL.md",
    "dlName": "super-brainstorm-SKILL.md",
    "size": "9.2 KB",
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
  },
  {
    "id": "group-meeting-brainstorm",
    "emoji": "🎭",
    "name": "组会脑暴",
    "badge": "opencode Skill",
    "cat": "协作",
    "desc": "让 5~6 个性格、专业、视角不同、带着私心和盲区的角色，由独立子智能体分别扮演，用真实组会的方式诊断、设计、压测、收束；产出决策日志、认领表、开发草案与可选逻辑架构图。不是一个人换声线。",
    "tags": ["多角色", "组会", "头脑风暴", "子智能体"],
    "updated": "2026-10-20",
    "file": "share/skills/group-meeting-brainstorm/SKILL.md",
    "dlName": "group-meeting-brainstorm-SKILL.md",
    "size": "13.3 KB",
    "files": 1,
    "github": "https://github.com/GinyvaXu/ginyva-share/tree/main/skills/group-meeting-brainstorm",
    "cmd": "mkdir -p ~/.config/opencode/skills/group-meeting-brainstorm && curl -fsSL -o ~/.config/opencode/skills/group-meeting-brainstorm/SKILL.md \"https://cdn.jsdelivr.net/gh/GinyvaXu/ginyva-share@main/skills/group-meeting-brainstorm/SKILL.md\""
  }
];
