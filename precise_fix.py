#!/usr/bin/env python3
import os
import re
import glob

def get_file_depth(file_path):
    """计算文件在src目录下的深度"""
    rel_path = os.path.relpath(file_path, "apps/frontend/src")
    return rel_path.count(os.sep)

def fix_file_imports(file_path):
    """根据文件深度修复导入路径"""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content
    depth = get_file_depth(file_path)

    # 根据文件深度计算相对路径
    prefix = "../" * depth

    # 修复所有导入
    # hooks路径
    content = re.sub(r"from\s+['\"]\.\/hooks\/", f"from '{prefix}hooks/", content)
    content = re.sub(r"from\s+['\"]\.\.\/hooks\/", f"from '{prefix}hooks/", content)
    content = re.sub(r"from\s+['\"]\.\.\/\.\.\/hooks\/", f"from '{prefix}hooks/", content)
    content = re.sub(r"from\s+['\"]\.\.\/\.\.\/\.\.\/hooks\/", f"from '{prefix}hooks/", content)

    # nodes/types路径
    content = re.sub(r"from\s+['\"]\.\.\/nodes\/types['\"]", f"from '{prefix}types/nodes'", content)
    content = re.sub(r"from\s+['\"]\.\.\.\/nodes\/types['\"]", f"from '{prefix}types/nodes'", content)
    content = re.sub(r"from\s+['\"]\.\.\/\.\.\/\.\.\/nodes\/types['\"]", f"from '{prefix}types/nodes'", content)
    content = re.sub(r"from\s+['\"]\.\.\/\.\.\/\.\.\/\.\.\/nodes\/types['\"]", f"from '{prefix}types/nodes'", content)

    # layout路径
    content = re.sub(r"from\s+['\"]\.\.\/layout['\"]", f"from '{prefix}services/layout'", content)
    content = re.sub(r"from\s+['\"]\.\.\/\.\.\/layout['\"]", f"from '{prefix}services/layout'", content)

    # api路径
    content = re.sub(r"from\s+['\"]\.\.\/api['\"]", f"from '{prefix}api'", content)
    content = re.sub(r"from\s+['\"]\.\.\/\.\.\/api['\"]", f"from '{prefix}api'", content)
    content = re.sub(r"from\s+['\"]\.\.\/\.\.\/\.\.\/api['\"]", f"from '{prefix}api'", content)

    # websocket路径
    content = re.sub(r"from\s+['\"]\.\.\/websocket\.service['\"]", f"from '{prefix}websocket.service'", content)

    # types/devices路径
    content = re.sub(r"from\s+['\"]\.\.\/types\/devices['\"]", f"from '{prefix}types/devices'", content)
    content = re.sub(r"from\s+['\"]\.\.\/\.\.\/types\/devices['\"]", f"from '{prefix}types/devices'", content)

    # utils/geometry路径
    content = re.sub(r"from\s+['\"]\.\.\/\.\.\/\.\.\/utils\/geometry['\"]", f"from '{prefix}utils/geometry'", content)
    content = re.sub(r"from\s+['\"]\.\.\/\.\.\/\.\.\/\.\.\/utils\/geometry['\"]", f"from '{prefix}utils/geometry'", content)

    return content != original

def main():
    directory = "apps/frontend/src"
    files = glob.glob(os.path.join(directory, '**/*.ts'), recursive=True)
    files.extend(glob.glob(os.path.join(directory, '**/*.tsx'), recursive=True))

    fixed_count = 0

    for file_path in files:
        if fix_file_imports(file_path):
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()

                original = content
                depth = get_file_depth(file_path)
                prefix = "../" * depth

                # hooks路径
                content = re.sub(r"from\s+['\"]\.\/hooks\/", f"from '{prefix}hooks/", content)
                content = re.sub(r"from\s+['\"]\.\.\/hooks\/", f"from '{prefix}hooks/", content)
                content = re.sub(r"from\s+['\"]\.\.\/\.\.\/hooks\/", f"from '{prefix}hooks/", content)

                # nodes/types路径
                content = re.sub(r"from\s+['\"]\.\.\/nodes\/types['\"]", f"from '{prefix}types/nodes'", content)
                content = re.sub(r"from\s+['\"]\.\.\.\/nodes\/types['\"]", f"from '{prefix}types/nodes'", content)
                content = re.sub(r"from\s+['\"]\.\.\/\.\.\/\.\.\/nodes\/types['\"]", f"from '{prefix}types/nodes'", content)
                content = re.sub(r"from\s+['\"]\.\.\/\.\.\/\.\.\/\.\.\/nodes\/types['\"]", f"from '{prefix}types/nodes'", content)

                # layout路径
                content = re.sub(r"from\s+['\"]\.\.\/layout['\"]", f"from '{prefix}services/layout'", content)

                # api路径
                content = re.sub(r"from\s+['\"]\.\.\/api['\"]", f"from '{prefix}api'", content)
                content = re.sub(r"from\s+['\"]\.\.\/\.\.\/api['\"]", f"from '{prefix}api'", content)

                # websocket路径
                content = re.sub(r"from\s+['\"]\.\.\/websocket\.service['\"]", f"from '{prefix}websocket.service'", content)

                # types/devices路径
                content = re.sub(r"from\s+['\"]\.\.\/types\/devices['\"]", f"from '{prefix}types/devices'", content)

                # utils/geometry路径
                content = re.sub(r"from\s+['\"]\.\.\/\.\.\/\.\.\/utils\/geometry['\"]", f"from '{prefix}utils/geometry'", content)

                # TemperatureChart (可能是错误引用)
                content = re.sub(r"from\s+['\"]\.\.\/TemperatureChart['\"]", f"from '{prefix}components/features/furnace/TemperatureChart'", content)

                if content != original:
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(content)
                    fixed_count += 1
                    rel_path = os.path.relpath(file_path, directory)
                    print(f"Fixed: {rel_path} (depth: {depth})")

            except Exception as e:
                print(f"Error: {file_path}: {e}")

    print(f"\nTotal fixed: {fixed_count}")

if __name__ == "__main__":
    main()
