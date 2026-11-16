import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { runMigrations } from './utils/storage.js'

// Migrate stored data BEFORE React mounts, so every useState initialiser in AppContext
// reads the already-migrated shape. Idempotent — safe to run on every reload.
runMigrations()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
