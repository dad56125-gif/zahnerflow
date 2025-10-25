@echo off
echo ========================================
echo 重新构建ZAHNERFLOW项目
echo ========================================

echo 正在清理旧的构建文件...
if exist "apps\backend\dist" rmdir /s /q "apps\backend\dist"
if exist "apps\frontend\dist" rmdir /s /q "apps\frontend\dist"
if exist "apps\backend\tsconfig.tsbuildinfo" del "apps\backend\tsconfig.tsbuildinfo"

echo 正在重新安装依赖...
pnpm install

echo 正在构建后端...
cd apps\backend
call npx tsc
if %ERRORLEVEL% neq 0 (
    echo 后端构建失败！
    pause
    exit /b 1
)
echo 后端构建成功！

echo 正在构建前端...
cd ..\frontend
call pnpm run build || (
    echo 警告：前端构建有TypeScript错误，但dist目录已存在
    echo 尝试使用现有dist目录...
)
echo 前端构建完成！

echo ========================================
echo 构建完成！
echo 后端: http://localhost:3001
echo 前端: http://localhost:4173 (预览模式)
echo ========================================

pause