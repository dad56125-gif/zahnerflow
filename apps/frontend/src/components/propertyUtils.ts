// 深度比较两个对象是否相等
// 用于判断当前参数是否与默认参数一致
export const isDeepEqual = (obj1: any, obj2: any): boolean => {
  if (obj1 === obj2) return true;
  
  if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) {
    return false;
  }

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) {
    if (!keys2.includes(key) || !isDeepEqual(obj1[key], obj2[key])) {
      return false;
    }
  }

  return true;
};

// 科学计数法及单位后缀解析函数
// 支持 k, m, M, u, μ, n 等后缀
export const parseScientificNotation = (input: string): number => {
  if (!input) return 0;
  
  const trimmed = input.trim().toLowerCase();
  
  const multipliers: Record<string, number> = {
    'k': 1000,
    'm': 0.001,
    'M': 1000000, // 注意：在 trim().toLowerCase() 后，'M' 会变成 'm'，这里逻辑需要微调
    // 由于 toLowerCase() 的存在，M 和 m 无法区分。
    // 通常电路模拟中 m=milli, M=mega。
    // 为了更准确，我们应该在小写化之前判断，或者约定 m=milli, meg=mega，或者 k=kilo。
    // 在本项目的上下文中，为了兼容性，通常 m 视为 milli (1e-3)。
    // 如果输入明确是 '10M'，toLowerCase 变成了 '10m'。
    // 修正策略：先判断后缀，再转换数字部分。
  };

  // 更严谨的解析逻辑
  const lastChar = input.trim().slice(-1); // 保留大小写
  const numPart = parseFloat(input.trim().slice(0, -1));

  if (isNaN(numPart)) {
    // 尝试直接解析整个字符串（没有后缀的情况）
    return parseFloat(input) || 0;
  }

  switch (lastChar) {
    case 'k':
    case 'K':
      return numPart * 1000;
    case 'm':
      return numPart * 0.001;
    case 'M':
      return numPart * 1000000;
    case 'u':
    case 'μ':
      return numPart * 0.000001;
    case 'n':
    case 'N':
      return numPart * 0.000000001;
    default:
      return parseFloat(input) || 0;
  }
};