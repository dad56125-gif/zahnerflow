#!/usr/bin/env python3

file_path = "src/components/FilePathManagerUI.tsx"

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix line 95 (index 94)
if lines[94].strip().endswith("|| '"):
    lines[94] = lines[94].replace("|| '", "|| ''")

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print(f"Fixed line 95 in {file_path}")
