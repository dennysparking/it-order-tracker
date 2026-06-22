import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import App from './App';
import ConfirmPage from './pages/ConfirmPage';
import RecipientPage from './pages/RecipientPage';
import './styles/index.css';

const path = window.location.pathname;
const confirmMatch = path.match(/^\/confirm\/([^/]+)$/);
// Single shared receiving page. Old per-name links (/recipient/Tami) still land here.
const receivingMatch = /^\/(receiving|recipient)(\/.*)?$/.test(path);

let root;
if (confirmMatch) {
  root = <ConfirmPage token={confirmMatch[1]} />;
} else if (receivingMatch) {
  root = <RecipientPage />;
} else {
  root = (
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(root);
