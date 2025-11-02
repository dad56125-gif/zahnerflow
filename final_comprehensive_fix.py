#!/usr/bin/env python3
import os
import re
import glob

def fix_all_imports():
    """最终综合修复所有导入路径"""

    # 批量替换规则
    replacements = [
        # 修复hooks路径
        (r"from\s+['\"]\.\.\/hooks\/", r"from '../services/hooks/"),
        (r"from\s+['\"]\.\.\/\.\.\/hooks\/", r"from '../../services/hooks/"),
        (r"from\s+['\"]\.\.\/\.\.\/\.\.\/hooks\/", r"from '../../../services/hooks/"),

        # 修复api路径
        (r"from\s+['\"]\.\.\/api['\"]", r"from '../services/api'"),
        (r"from\s+['\"]\.\.\/\.\.\/api['\"]", r"from '../../services/api'"),
        (r"from\s+['\"]\.\.\/\.\.\/\.\.\/api['\"]", r"from '../../../services/api'"),

        # 修复nodes/types路径
        (r"from\s+['\"]\.\.\/nodes\/types['\"]", r"from '../types/nodes'"),
        (r"from\s+['\"]\.\.\/\.\.\/nodes\/types['\"]", r"from '../../types/nodes'"),
        (r"from\s+['\"]\.\.\/\.\.\/\.\.\/nodes\/types['\"]", r"from '../../../types/nodes'"),

        # 修复types/devices路径
        (r"from\s+['\"]\.\.\/types\/devices['\"]", r"from '../types/devices'"),
        (r"from\s+['\"]\.\.\/\.\.\/types\/devices['\"]", r"from '../../types/devices'"),
        (r"from\s+['\"]\.\.\/\.\.\/\.\.\/types\/devices['\"]", r"from '../../../types/devices'"),

        # 修复layout路径
        (r"from\s+['\"]\.\.\/layout['\"]", r"from '../services/layout'"),
        (r"from\s+['\"]\.\.\/\.\.\/layout['\"]", r"from '../../services/layout'"),

        # 修复websocket路径
        (r"from\s+['\"]\.\.\/websocket\.service['\"]", r"from '../websocket.service'"),
        (r"from\s+['\"]\.\.\/\.\.\/websocket\.service['\"]", r"from '../../websocket.service'"),
        (r"from\s+['\"]\.\.\/\.\.\/\.\.\/websocket\.service['\"]", r"from '../../../websocket.service'"),

        # 修复TemperatureChart路径
        (r"from\s+['\"]\.\.\/TemperatureChart['\"]", r"from '../../TemperatureChart'"),

        # 修复stores路径
        (r"from\s+['\"]\.\.\/stores\/", r"from '../services/stores/"),
        (r"from\s+['\"]\.\.\/\.\.\/stores\/", r"from '../../services/stores/"),

        # 修复types/nodes路径
        (r"from\s+['\"]\.\.\/types\/nodes['\"]", r"from '../types/nodes'"),
        (r"from\s+['\"]\.\.\/\.\.\/types\/nodes['\"]", r"from '../../types/nodes'"),
    ]

    directory = "apps/frontend/src"
    files = glob.glob(os.path.join(directory, '**/*.ts'), recursive=True)
    files.extend(glob.glob(os.path.join(directory, '**/*.tsx'), recursive=True))

    fixed_count = 0

    for file_path in files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            original = content

            # 应用所有替换规则
            for pattern, replacement in replacements:
                content = re.sub(pattern, replacement, content)

            if content != original:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                fixed_count += 1
                rel_path = os.path.relpath(file_path, directory)
                print(f"Fixed: {rel_path}")

        except Exception as e:
            print(f"Error: {file_path}: {e}")

    print(f"\nTotal files fixed: {fixed_count}")
    print("Final comprehensive fix completed!")

if __name__ == "__main__":
    fix_all_imports()
