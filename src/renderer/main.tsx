import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/index.css';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
