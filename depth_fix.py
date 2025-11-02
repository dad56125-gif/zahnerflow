#!/usr/bin/env python3
import os
import re
import glob

def get_file_depth_from_src(file_path):
    """获取文件相对src的深度"""
    rel_path = os.path.relpath(file_path, "apps/frontend/src")
    return rel_path.count(os.sep)

def fix_depth_errors():
    """修复深度计算错误"""

    directory = "apps/frontend/src"
    files = glob.glob(os.path.join(directory, '**/*.ts'), recursive=True)
    files.extend(glob.glob(os.path.join(directory, '**/*.tsx'), recursive=True))

    fixed_count = 0

    for file_path in files:
        depth = get_file_depth_from_src(file_path)

        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            original = content

            # 根据深度计算正确的相对路径
            prefix_src = "../" * depth  # 到src根目录
            prefix_services = "../" * (depth - 1) + "services/" if depth > 1 else "services/"
            prefix_types = "../" * depth + "types/"
            prefix_hooks = "../" * (depth - 1) + "services/hooks/" if depth > 1 else "services/hooks/"
            prefix_api = "../" * (depth - 1) + "services/api/" if depth > 1 else "services/api/"

            # 修复types/nodes路径（到src根目录）
            if depth >= 3:
                content = re.sub(r"from\s+['\"]\.\.\/\.\.\/\.\.\/types\/nodes['\"]", f"from '{prefix_src}types/nodes'", content)
            if depth >= 4:
                content = re.sub(r"from\s+['\"]\.\.\/\.\.\/\.\.\/\.\.\/types\/nodes['\"]", f"from '{prefix_src}types/nodes'", content)

            # 修复types/devices路径
            if depth >= 3:
                content = re.sub(r"from\s+['\"]\.\.\/\.\.\/types\/devices['\"]", f"from '{prefix_src}types/devices'", content)
            if depth >= 4:
                content = re.sub(r"from\s+['\"]\.\.\/\.\.\/\.\.\/\.\.\/types\/devices['\"]", f"from '{prefix_src}types/devices'", content)

            # 修复websocket路径（从services/stores到services）
            if depth >= 2:
                content = re.sub(r"from\s+['\"]\.\.\/\.\.\/websocket\.service['\"]", f"from '{prefix_services}websocket.service'", content)

            if content != original:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                fixed_count += 1
                rel_path = os.path.relpath(file_path, directory)
                print(f"Fixed depth errors in: {rel_path}")

        except Exception as e:
            print(f"Error processing {file_path}: {e}")

    print(f"\nTotal depth errors fixed: {fixed_count}")

if __name__ == "__main__":
    fix_depth_errors()
