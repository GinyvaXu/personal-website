@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   个人网站 · 一键发布更新
echo ============================================
echo.
where git >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Git。请先安装：https://git-scm.com/download/win
  echo        安装后重新双击本文件即可。
  pause
  exit /b 1
)
git add -A
if errorlevel 1 goto :err
git diff --cached --quiet
if %errorlevel%==0 (
  echo [提示] 没有检测到任何更改，无需发布。
  echo        如需先部署，请按 README.md 完成首次设置。
  pause
  exit /b 0
)
git commit -m "网站更新 %date% %time%"
if errorlevel 1 goto :err
git push
if errorlevel 1 goto :err
echo.
echo [完成] 已发布！等待 1-3 分钟后，网页会自动更新。
echo        网址：https://ginyvaxu.github.io/personal-website/
pause
exit /b 0

:err
echo.
echo [失败] 发布未成功，请查看上面的错误信息，
echo        或阅读 README.md 中的「部署与更新」说明。
pause
exit /b 1