import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AuthGate from './components/Auth/AuthGate.jsx'
import './index.css'

// AuthGate migrates stored data BEFORE the app mounts (after loading it from the online database
// when there is one), so every useState initialiser in AppContext reads the migrated shape.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </React.StrictMode>,
)
