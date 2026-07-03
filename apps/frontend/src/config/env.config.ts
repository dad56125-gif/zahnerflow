import { getDesktopRuntimeBaseUrl } from '../desktopBridge';

// 环境配置
export const config = {
  // 开发环境下，WebSocket 使用相对路径以便 Vite 代理工作
  // 生产环境下使用当前 origin
  wsUrl: process.env.NODE_ENV === 'production'
    ? window.location.origin
    : window.location.origin, // 使用相对路径，让 Vite 代理处理
};

// 导出便捷函数
export const getWsUrl = () => getDesktopRuntimeBaseUrl() || config.wsUrl;
