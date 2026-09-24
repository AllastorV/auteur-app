import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { t } from '../../../packages/core/src/dil/arayuz';

const container = document.getElementById('root');
if (!container) throw new Error(t('#root bulunamadı'));

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
