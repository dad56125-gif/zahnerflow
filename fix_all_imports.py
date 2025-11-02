#!/usr/bin/env python3
import os
import re
import glob

directory = "apps/frontend/src"

# 获取所有ts和tsx文件
files = glob.glob(os.path.join(directory, '**/*.ts'), recursive=True)
files.extend(glob.glob(os.path.join(directory, '**/*.tsx'), recursive=True))

fixed_count = 0

for file_path in files:
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        original_content = content

        # 修复nodes/types路径
        content = re.sub(r"from\s+['\"]\.\.\/nodes\/types['\"]", r"from '../types/nodes'", content)
        content = re.sub(r"from\s+['\"]\.\.\.\/nodes\/types['\"]", r"from '../../types/nodes'", content)
        content = re.sub(r"from\s+['\"]\.\.\/\.\.\/\.\.\/nodes\/types['\"]", r"from '../../types/nodes'", content)

        # 修复stores路径
        content = re.sub(r"from\s+['\"]\.\.\/stores\/", r"from '../services/stores/", content)
        content = re.sub(r"from\s+['\"]\.\.\/\.\.\/stores\/", r"from '../../services/stores/", content)
        content = re.sub(r"from\s+['\"]\.\.\/\.\.\/\.\.\/stores\/", r"from '../../../services/stores/", content)

        # 修复workflow路径
        content = re.sub(r"from\s+['\"]\.\/workflow['\"]", r"from './features/workflow'", content)
        content = re.sub(r"from\s+['\"]\.\.\/workflow['\"]", r"from './features/workflow'", content)
        content = re.sub(r"from\s+['\"]\.\.\/\.\.\/workflow['\"]", r"from '../features/workflow'", content)

        # 修复furnace路径
        content = re.sub(r"from\s+['\"]\.\/furnace\/", r"from './features/furnace/", content)
        content = re.sub(r"from\s+['\"]\.\.\/furnace\/", r"from './features/furnace/", content)
        content = re.sub(r"from\s+['\"]\.\.\/\.\.\/furnace\/", r"from '../features/furnace/", content)

        # 修复mfc路径
        content = re.sub(r"from\s+['\"]\.\/mfc\/", r"from './features/mfc/", content)
        content = re.sub(r"from\s+['\"]\.\.\/mfc\/", r"from './features/mfc/", content)
        content = re.sub(r"from\s+['\"]\.\.\/\.\.\/mfc\/", r"from '../features/mfc/", content)

        # 修复loop内部路径
        content = re.sub(r"from\s+['\"]\.\.\/features\/loop['\"]", r"from '.'", content)
        content = re.sub(r"from\s+['\"]\.\.\/\.\.\/features\/loop['\"]", r"from '..'", content)
        content = re.sub(r"from\s+['\"]\.\.\/\.\.\/\.\.\/features\/loop['\"]", r"from '..'", content)

        # 修复services内部路径
        content = re.sub(r"from\s+['\"]\.\.\/services\/workflowService['\"]", r"from '../workflowService'", content)
        content = re.sub(r"from\s+['\"]\.\.\/services\/deviceService['\"]", r"from '../deviceService'", content)
        content = re.sub(r"from\s+['\"]\.\.\/services\/websocket\.service['\"]", r"from '../websocket.service'", content)
        content = re.sub(r"from\s+['\"]\.\.\/services\/layout['\"]", r"from '../layout'", content)
        content = re.sub(r"from\s+['\"]\.\.\/services\/api\/index['\"]", r"from './api'", content)
        content = re.sub(r"from\s+['\"]\.\.\/services\/hooks\/", r"from './hooks/", content)

        # 如果有修改，写回文件
        if content != original_content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            fixed_count += 1
            print(f"Fixed: {os.path.relpath(file_path, directory)}")

    except Exception as e:
        print(f"Error processing {file_path}: {e}")

print(f"\nTotal files fixed: {fixed_count}")
print("Import fixes completed!")
