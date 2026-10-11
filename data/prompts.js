/* ============================================================
 * 提示词仓库数据（与 share/prompts/ 镜像文件一一对应）
 * 新增一个提示词：把 txt 放进 share/prompts/<id>.txt，并在下面加一条记录
 * ============================================================ */
window.PROMPTS = [
  {
    "id": "c-tutor-prompt",
    "emoji": "📘",
    "title": "C 语言导师 · C-Tutor",
    "cat": "编程",
    "desc": "一份自包含的导师提示词：交给任何 AI Agent 即可开始辅导 C 语言——审查代码、讲解原理、陪你做练习；内置指令前缀体系（review / fix / test / debug / quiz…）与中文注释编码纪律。",
    "tags": ["C 语言", "编程教学", "指令化"],
    "updated": "2026-10-11",
    "file": "share/prompts/c-tutor-prompt.txt",
    "dlName": "C-Tutor-Prompt.txt",
    "chars": "9,750 字",
    "github": "https://github.com/GinyvaXu/ginyva-share/blob/main/prompts/c-tutor-prompt.txt"
  }
];
