/**
 * Furnace Hook迁移助手脚本
 *
 * 用于将旧的useFurnace Hook替换为优化版本
 * 确保严格遵循snake_case参数命名规范
 */

const fs = require('fs');
const path = require('path');

// 映射表：旧名称 -> 新名称
const naming_mappings = {
  // 状态属性映射
  'isLoading': 'loading',
  'connectionState': 'connection_status',
  'connection_state': 'connection_status', // 确保一致性
  'operationState': 'operation_status',
  'operation_state': 'operation_status',
  'lastUpdate': 'last_update',
  'pollCount': 'poll_count',
  'segmentOperation': 'segment_operation',
  'selectedPreset': 'selected_preset',
  'historyData': 'history_data',
  'historyParams': 'history_params',
  'rateLimitInfo': 'rate_limit_info',

  // 方法名映射
  'setTemperature': 'set_temperature',
  'setSegment': 'set_segment',
  'loadSegments': 'load_segments',
  'writeSegments': 'write_segments',
  'loadPresets': 'load_presets',
  'selectPreset': 'select_preset',
  'createPreset': 'create_preset',
  'updatePreset': 'update_preset',
  'deletePreset': 'delete_preset',
  'clonePreset': 'clone_preset',
  'applyPreset': 'apply_preset',
  'loadHistoryData': 'load_history_data',
  'updateHistoryParams': 'update_history_params',
  'refreshLogs': 'refresh_logs',
  'clearLogs': 'clear_logs',
  'addOperationLog': 'add_log',
  'addOperationLog': 'add_operation_log',

  // 接口名映射
  'FurnaceState': 'FinalFurnaceState',
  'FurnaceControls': 'FinalFurnaceControls',
};

/**
 * 替换文件中的命名
 */
function replace_namings(content) {
  let updated_content = content;

  // 替换导入
  updated_content = updated_content.replace(
    /import\s*\{?\s*([^}]*)\s*\}?\s*from\s*['"].*useFurnace['"]/g,
    (match, imports) => {
      const updated_imports = imports
        .split(',')
        .map(imp => {
          const trimmed = imp.trim();
          if (trimmed === 'useFurnace') {
            return 'useFurnaceFinal as useFurnace';
          } else if (naming_mappings[trimmed]) {
            return naming_mappings[trimmed];
          }
          return trimmed;
        })
        .join(', ');
      return `import { ${updated_imports} } from '../services/hooks/useFurnaceFinal'`;
    }
  );

  // 替换类型引用
  Object.keys(naming_mappings).forEach(old_name => {
    const new_name = naming_mappings[old_name];
    // 匹配单词边界，避免部分替换
    const regex = new RegExp(`\\b${old_name}\\b`, 'g');
    updated_content = updated_content.replace(regex, new_name);
  });

  return updated_content;
}

/**
 * 更新文件
 */
function update_file(file_path) {
  try {
    const content = fs.readFileSync(file_path, 'utf8');
    const updated_content = replace_namings(content);

    if (content !== updated_content) {
      fs.writeFileSync(file_path, updated_content, 'utf8');
      console.log(`✅ 已更新: ${file_path}`);
      return true;
    } else {
      console.log(`ℹ️  无需更新: ${file_path}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ 更新失败 ${file_path}:`, error.message);
    return false;
  }
}

/**
 * 查找需要更新的文件
 */
function find_files_to_update() {
  const src_dir = path.join(__dirname, '../../../src');
  const files_to_check = [];

  function scan_directory(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const full_path = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // 递归扫描子目录
          scan_directory(full_path);
        } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          // 检查文件是否包含useFurnace
          try {
            const content = fs.readFileSync(full_path, 'utf8');
            if (content.includes('useFurnace') ||
                content.includes('FurnaceState') ||
                content.includes('FurnaceControls')) {
              files_to_check.push(full_path);
            }
          } catch (error) {
            // 忽略读取错误
          }
        }
      }
    } catch (error) {
      // 忽略无法读取的目录
    }
  }

  scan_directory(src_dir);
  return files_to_check;
}

/**
 * 生成迁移报告
 */
function generate_migration_report(updated_files) {
  const report = {
    timestamp: new Date().toISOString(),
    total_files_checked: updated_files.length,
    files_updated: updated_files.filter(f => f.updated).length,
    files_list: updated_files,
    next_steps: [
      '1. 运行 TypeScript 类型检查: npm run type-check',
      '2. 运行测试: npm test',
      '3. 检查应用功能是否正常',
      '4. 删除旧的 useFurnace.ts 文件（可选）',
      '5. 清理未使用的导入和类型'
    ]
  };

  const report_path = path.join(__dirname, 'migration-report.json');
  fs.writeFileSync(report_path, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n📊 迁移报告已生成: ${report_path}`);

  return report;
}

/**
 * 主迁移函数
 */
function migrate() {
  console.log('🚀 开始Furnace Hook迁移...\n');

  // 查找需要更新的文件
  const files_to_update = find_files_to_update();
  console.log(`📁 找到 ${files_to_update.length} 个需要检查的文件\n`);

  // 更新文件
  const updated_files = [];
  for (const file_path of files_to_update) {
    const updated = update_file(file_path);
    updated_files.push({
      path: file_path,
      updated: updated
    });
  }

  // 生成报告
  const report = generate_migration_report(updated_files);

  console.log(`\n✨ 迁移完成!`);
  console.log(`- 总共检查: ${report.total_files_checked} 个文件`);
  console.log(`- 成功更新: ${report.files_updated} 个文件`);

  console.log('\n📋 下一步操作:');
  report.next_steps.forEach(step => console.log(`  ${step}`));
}

// 如果直接运行此脚本
if (require.main === module) {
  migrate();
}

module.exports = {
  migrate,
  replace_namings,
  find_files_to_update,
  naming_mappings
};