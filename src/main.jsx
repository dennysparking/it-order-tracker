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
const recipientMatch = path.match(/^\/recipient\/([^/]+)$/);

let root;
if (confirmMatch) {
  root = <ConfirmPage token={confirmMatch[1]} />;
} else if (recipientMatch) {
  root = <RecipientPage name={decodeURIComponent(recipientMatch[1])} />;
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
