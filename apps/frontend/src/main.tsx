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

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
