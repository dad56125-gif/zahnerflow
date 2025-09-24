import ReactDOM from 'react-dom/client';
import { StrictMode } from 'react';
import App from './App';
import './styles/globals.css';
import { workflowWebSocketService } from './services/websocket.service';

// 创建 React 根节点
const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

// 应用启动时检查连接状态
const initializeApp = async () => {
  // WebSocket连接由 StateLinkageManager 管理，确保它被初始化
  // 这会触发WebSocket连接和服务检测
};

// 渲染应用
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);

// 开发环境设置
if (process.env.NODE_ENV === 'development') {
  console.log('ZahnerFlow 开发模式 | 高级玻璃态设计系统已应用 | 交互式动态效果已启用');

  // 全局错误处理
  window.addEventListener('error', (event) => {
    console.error('应用错误:', event.error?.message || String(event.error));
  });

  // 未处理的 Promise 错误
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Promise 错误:', event.reason?.message || String(event.reason));
  });
}

// 生产环境优化
if (process.env.NODE_ENV === 'production') {
  // 禁用右键菜单
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  
  // 禁用开发者工具快捷键
  document.addEventListener('keydown', (e) => {
    if (
      (e.ctrlKey && e.shiftKey && e.key === 'I') ||
      (e.ctrlKey && e.shiftKey && e.key === 'J') ||
      (e.ctrlKey && e.key === 'U') ||
      (e.key === 'F12')
    ) {
      e.preventDefault();
    }
  });
}

// 应用版本信息
const APP_VERSION = '2.0.0';
const BUILD_DATE = new Date().toISOString();

console.log(`ZahnerFlow v${APP_VERSION} | 构建时间: ${BUILD_DATE} | 高级玻璃态设计系统 | 交互式动态效果 | 电化学工作流编辑器 | 现代化用户界面`);

// 在应用启动时初始化
initializeApp();