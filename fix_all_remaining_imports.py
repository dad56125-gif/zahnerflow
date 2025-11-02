#!/usr/bin/env python3
import os
import re
import glob

def fix_imports_in_file(file_path):
    """修复单个文件的导入路径"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        original_content = content

        # 修复nodes/types路径
        content = re.sub(r"from\s+['\"]\.\.\/nodes\/types['\"]", r"from '../types/nodes'", content)
        content = re.sub(r"from\s+['\"]\.\.\.\/nodes\/types['\"]", r"from '../../types/nodes'", content)
        content = re.sub(r"from\s+['\"]\.\.\/\.\.\/\.\.\/nodes\/types['\"]", r"from '../../types/nodes'", content)
        content = re.sub(r"from\s+['\"]\.\/nodes\/types['\"]", r"from './types/nodes'", content)

        # 修复stores路径
        content = re.sub(r"from\s+['\"]\.\.\/stores\/", r"from '../services/stores/", content)
        content = re.sub(r"from\s+['\"]\.\.\/\.\.\/stores\/", r"from '../../services/stores/", content)
        content = re.sub(r"from\s+['\"]\.\.\/\.\.\/\.\.\/stores\/", r"from '../../../services/stores/", content)
        content = re.sub(r"from\s+['\"]\.\/stores\/", r"from './services/stores/", content)

        # 修复layout路径
        content = re.sub(r"from\s+['\"]\.\.\/layout['\"]", r"from '../services/layout'", content)
        content = re.sub(r"from\s+['\"]\.\.\/\.\.\/layout['\"]", r"from '../../services/layout'", content)
        content = re.sub(r"from\s+['\"]\.\/layout['\"]", r"from './services/layout'", content)

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

        # 修复loop路径
        content = re.sub(r"from\s+['\"]\.\.\/features\/loop['\"]", r"from '.'", content)
        content = re.sub(r"from\s+['\"]\.\.\/\.\.\/features\/loop['\"]", r"from '..'", content)
        content = re.sub(r"from\s+['\"]\.\.\/\.\.\/\.\.\/features\/loop['\"]", r"from '..'", content)
        content = re.sub(r"from\s+['\"]\.\/loops['\"]", r"from './features/loop'", content)

        # 修复hooks路径
        content = re.sub(r"from\s+['\"]\.\.\/services\/hooks\/", r"from '../hooks/", content)
        content = re.sub(r"from\s+['\"]\.\.\/\.\.\/services\/hooks\/", r"from '../../hooks/", content)
        content = re.sub(r"from\s+['\"]\.\/hooks\/", r"from './hooks/", content)

        # 修复api路径
        content = re.sub(r"from\s+['\"]\.\.\/services\/api\/index['\"]", r"from '../api'", content)
        content = re.sub(r"from\s+['\"]\.\.\/\.\.\/services\/api\/index['\"]", r"from '../../api'", content)

        # 修复websocket路径
        content = re.sub(r"from\s+['\"]\.\.\/websocket\.service['\"]", r"from '../websocket.service'", content)
        content = re.sub(r"from\s+['\"]\.\.\/\.\.\/websocket\.service['\"]", r"from '../../websocket.service'", content)

        # 修复TemperatureChart路径
        content = re.sub(r"from\s+['\"]\.\.\/TemperatureChart['\"]", r"from './TemperatureChart'", content)

        # 修复devices路径
        content = re.sub(r"from\s+['\"]\.\.\/\.\.\/\.\.\/types\/devices['\"]", r"from '../../../types/devices'", content)
        content = re.sub(r"from\s+['\"]\.\.\/types\/devices['\"]", r"from '../types/devices'", content)

        # 修复features内部路径
        content = re.sub(r"from\s+['\"]\.\/features\/workflow\/index['\"]", r"from './workflow'", content)
        content = re.sub(r"from\s+['\"]\.\/features\/furnace\/index['\"]", r"from './furnace'", content)
        content = re.sub(r"from\s+['\"]\.\/features\/mfc\/index['\"]", r"from './mfc'", content)

        return content != original_content

    except Exception as e:
        print(f"Error processing {file_path}: {e}")
        return False

def main():
    directory = "apps/frontend/src"
    files = glob.glob(os.path.join(directory, '**/*.ts'), recursive=True)
    files.extend(glob.glob(os.path.join(directory, '**/*.tsx'), recursive=True))

    fixed_count = 0

    for file_path in files:
        if fix_imports_in_file(file_path):
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()

                original_content = content

                # 应用所有修复
                # 修复nodes/types路径
                content = re.sub(r"from\s+['\"]\.\.\/nodes\/types['\"]", r"from '../types/nodes'", content)
                content = re.sub(r"from\s+['\"]\.\.\.\/nodes\/types['\"]", r"from '../../types/nodes'", content)
                content = re.sub(r"from\s+['\"]\.\.\/\.\.\/\.\.\/nodes\/types['\"]", r"from '../../types/nodes'", content)
                content = re.sub(r"from\s+['\"]\.\/nodes\/types['\"]", r"from './types/nodes'", content)

                # 修复stores路径
                content = re.sub(r"from\s+['\"]\.\.\/stores\/", r"from '../services/stores/", content)
                content = re.sub(r"from\s+['\"]\.\.\/\.\.\/stores\/", r"from '../../services/stores/", content)
                content = re.sub(r"from\s+['\"]\.\.\/\.\.\/\.\.\/stores\/", r"from '../../../services/stores/", content)
                content = re.sub(r"from\s+['\"]\.\/stores\/", r"from './services/stores/", content)

                # 修复layout路径
                content = re.sub(r"from\s+['\"]\.\.\/layout['\"]", r"from '../services/layout'", content)
                content = re.sub(r"from\s+['\"]\.\.\/\.\.\/layout['\"]", r"from '../../services/layout'", content)
                content = re.sub(r"from\s+['\"]\.\/layout['\"]", r"from './services/layout'", content)

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

                # 修复loop路径
                content = re.sub(r"from\s+['\"]\.\.\/features\/loop['\"]", r"from '.'", content)
                content = re.sub(r"from\s+['\"]\.\.\/\.\.\/features\/loop['\"]", r"from '..'", content)
                content = re.sub(r"from\s+['\"]\.\.\/\.\.\/\.\.\/features\/loop['\"]", r"from '..'", content)
                content = re.sub(r"from\s+['\"]\.\/loops['\"]", r"from './features/loop'", content)

                # 修复hooks路径
                content = re.sub(r"from\s+['\"]\.\.\/services\/hooks\/", r"from '../hooks/", content)
                content = re.sub(r"from\s+['\"]\.\.\/\.\.\/services\/hooks\/", r"from '../../hooks/", content)
                content = re.sub(r"from\s+['\"]\.\/hooks\/", r"from './hooks/", content)

                # 修复api路径
                content = re.sub(r"from\s+['\"]\.\.\/services\/api\/index['\"]", r"from '../api'", content)
                content = re.sub(r"from\s+['\"]\.\.\/\.\.\/services\/api\/index['\"]", r"from '../../api'", content)

                # 修复websocket路径
                content = re.sub(r"from\s+['\"]\.\.\/websocket\.service['\"]", r"from '../websocket.service'", content)
                content = re.sub(r"from\s+['\"]\.\.\/\.\.\/websocket\.service['\"]", r"from '../../websocket.service'", content)

                # 修复TemperatureChart路径
                content = re.sub(r"from\s+['\"]\.\.\/TemperatureChart['\"]", r"from './TemperatureChart'", content)

                # 修复devices路径
                content = re.sub(r"from\s+['\"]\.\.\/\.\.\/\.\.\/types\/devices['\"]", r"from '../../../types/devices'", content)
                content = re.sub(r"from\s+['\"]\.\.\/types\/devices['\"]", r"from '../types/devices'", content)

                # 修复features内部路径
                content = re.sub(r"from\s+['\"]\.\/features\/workflow\/index['\"]", r"from './workflow'", content)
                content = re.sub(r"from\s+['\"]\.\/features\/furnace\/index['\"]", r"from './furnace'", content)
                content = re.sub(r"from\s+['\"]\.\/features\/mfc\/index['\"]", r"from './mfc'", content)

                # 如果有修改，写回文件
                if content != original_content:
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(content)
                    fixed_count += 1
                    rel_path = os.path.relpath(file_path, directory)
                    print(f"Fixed: {rel_path}")

            except Exception as e:
                print(f"Error writing {file_path}: {e}")

    print(f"\nTotal files fixed: {fixed_count}")
    print("All import fixes completed!")

if __name__ == "__main__":
    main()
