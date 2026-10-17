import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import UpdatePrompt from './app/UpdatePrompt';
import './app/styles.css';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <UpdatePrompt />
  </React.StrictMode>,
);
