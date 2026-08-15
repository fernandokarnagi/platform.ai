import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AppRoutes from '@routes/index';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRoutes />
  </StrictMode>,
);
