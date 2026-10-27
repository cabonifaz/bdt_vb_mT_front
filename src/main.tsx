import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/base.css';
import './i18n';
import App from './App';
import { startTableLabels } from './lib/tableLabels';

startTableLabels();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
