import ReactDOM from 'react-dom/client';
import { StrictMode } from 'react';
import App from './App';
import './styles/main.scss';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
