import ReactDOM from 'react-dom/client';
import { StrictMode } from 'react';
import App from './App';
import '@fontsource/oxanium/400.css';
import '@fontsource/oxanium/500.css';
import '@fontsource/oxanium/600.css';
import '@fontsource/oxanium/700.css';
import '@fontsource/oxanium/800.css';
import '@fontsource-variable/noto-sans-sc';
import './styles/main.scss';
import { useAppStore } from './state/appStore';

// persist 使用同步本地存储；首次渲染前恢复主题，避免刷新时闪回暗色。
document.documentElement.dataset.theme = useAppStore.getState().theme;

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
