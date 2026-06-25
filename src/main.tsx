import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { APP_NAME, APP_VERSION, BUILD_DATE } from './version'

// eslint-disable-next-line no-console
console.info(
  `%c♟ ${APP_NAME} v${APP_VERSION}%c — built ${BUILD_DATE}`,
  'color:#c084fc;font-weight:bold;font-size:14px',
  'color:#9da0ad',
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
