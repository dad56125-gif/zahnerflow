#!/bin/bash
# 导入路径修复脚本

echo "开始修复导入路径错误..."

# 1. 修复nodes/types → types/nodes
echo "1. 修复 nodes/types 路径..."
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i "s|from '\.\.\.\/nodes/types'|from '../../types/nodes'|g"
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i "s|from '\.\.\/nodes/types'|from '../types/nodes'|g"
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i "s|from '\.\.\/\.\.\/\.\.\/nodes/types'|from '../../types/nodes'|g"

# 2. 修复stores → services/stores
echo "2. 修复 stores 路径..."
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i "s|from '\.\.\/stores|from '../services/stores|g"
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i "s|from '\.\.\/\.\.\/stores|from '../../services/stores|g"
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i "s|from '\.\.\/\.\.\/\.\.\/stores|from '../../../services/stores|g"

# 3. 修复workflow路径
echo "3. 修复 workflow 路径..."
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i "s|from '\.\/workflow'|from './features/workflow'|g"
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i "s|from '\.\.\/workflow'|from './features/workflow'|g"
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i "s|from '\.\.\/\.\.\/workflow'|from '../features/workflow'|g"

# 4. 修复furnace路径
echo "4. 修复 furnace 路径..."
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i "s|from '\.\/furnace|from './features/furnace|g"
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i "s|from '\.\.\/furnace|from './features/furnace|g"
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i "s|from '\.\.\/\.\.\/furnace|from '../features/furnace|g"

# 5. 修复mfc路径
echo "5. 修复 mfc 路径..."
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i "s|from '\.\/mfc|from './features/mfc|g"
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i "s|from '\.\.\/mfc|from './features/mfc|g"
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i "s|from '\.\.\/\.\.\/mfc|from '../features/mfc|g"

# 6. 修复loop路径 (内部引用)
echo "6. 修复 loop 内部路径..."
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i "s|from '\.\.\/features\/loop'|from '.'|g"
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i "s|from '\.\.\/\.\.\/features\/loop'|from '..'|g"
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i "s|from '\.\.\/\.\.\/\.\.\/features\/loop|from '..'|g"

# 7. 修复services内部路径
echo "7. 修复 services 内部路径..."
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i "s|from '\.\.\/services\/workflowService|from '../workflowService'|g"
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i "s|from '\.\.\/services\/deviceService|from '../deviceService'|g"
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i "s|from '\.\.\/services\/websocket.service|from '../websocket.service'|g"
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i "s|from '\.\.\/services\/layout|from '../layout'|g"
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i "s|from '\.\.\/services\/api/index|from './api'|g"
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i "s|from '\.\.\/services\/hooks|from './hooks'|g"

echo "修复完成！"
echo "请运行 npm run build 来验证修复结果"