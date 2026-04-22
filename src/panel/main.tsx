import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TraceProvider } from './store/TraceContext'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TraceProvider>
      <App />
    </TraceProvider>
  </StrictMode>,
)
