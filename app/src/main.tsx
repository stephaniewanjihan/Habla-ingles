import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App'

registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    // 回到前台就查一次新版本;常驻后台的 PWA 每 15 分钟也查一次
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void registration.update()
    })
    setInterval(() => void registration.update(), 15 * 60 * 1000)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
