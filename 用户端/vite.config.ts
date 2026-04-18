import { defineConfig, loadEnv } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import path from 'node:path'

/**
 * 用户端 Vite 构建配置
 * 功能：集成 uni-app Vite 插件，按 mode 加载 env/.env.[mode]，配置路径别名。
 * 参数：Vite 注入的 ConfigEnv（mode、command、ssrBuild、isPreview）
 * 返回值：UserConfig Vite 用户配置对象
 * 用途：支持 `uni -p mp-weixin`（dev）与 `uni build -p mp-weixin`（生产）
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, 'env'), 'VITE_')
  return {
    envDir: path.resolve(__dirname, 'env'),
    envPrefix: ['VITE_', 'UNI_'],
    plugins: [uni()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src')
      }
    },
    define: {
      __APP_ENV__: JSON.stringify(env.VITE_APP_ENV ?? mode)
    }
  }
})
