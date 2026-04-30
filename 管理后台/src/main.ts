import App from './App.vue'
import { createApp } from 'vue'
import { initStore } from './store'                 // Store
import { initRouter } from './router'               // Router
import language from './locales'                    // 国际化
import '@styles/core/tailwind.css'                  // tailwind
import '@styles/index.scss'                         // 样式
import '@utils/sys/console.ts'                      // 控制台输出内容
import { setupGlobDirectives } from './directives'
import { setupErrorHandle } from './utils/sys/error-handle'
import { setupBizComponents } from './components/biz'
import { setupSentry } from './utils/sentry'        // P9/W2.C.2 Sentry 真发送

document.addEventListener(
  'touchstart',
  function () {},
  { passive: false }
)

/* P9/W2.C.2：Sentry 真发送初始化（DSN 由 Vite env 注入；空 DSN 自动跳过） */
const viteEnv = import.meta.env as unknown as Record<string, string | undefined>
setupSentry({
  dsn: viteEnv.VITE_SENTRY_DSN ?? '',
  environment: viteEnv.VITE_APP_ENV ?? viteEnv.MODE ?? 'development',
  release: viteEnv.VITE_APP_VERSION ?? '0.1.0'
})

const app = createApp(App)
initStore(app)
initRouter(app)
setupGlobDirectives(app)
setupErrorHandle(app)
setupBizComponents(app)

app.use(language)
app.mount('#app')