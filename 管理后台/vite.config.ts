import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { fileURLToPath } from 'url'
import vueDevTools from 'vite-plugin-vue-devtools'
import viteCompression from 'vite-plugin-compression'
import Components from 'unplugin-vue-components/vite'
import AutoImport from 'unplugin-auto-import/vite'
import ElementPlus from 'unplugin-element-plus/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import tailwindcss from '@tailwindcss/vite'
// import { visualizer } from 'rollup-plugin-visualizer'

export default ({ mode }: { mode: string }) => {
  const root = process.cwd()
  const env = loadEnv(mode, root)
  const { VITE_VERSION, VITE_PORT, VITE_BASE_URL, VITE_API_URL, VITE_API_PROXY_URL } = env

  console.log(`🚀 API_URL = ${VITE_API_URL}`)
  console.log(`🚀 VERSION = ${VITE_VERSION}`)

  return defineConfig({
    define: {
      __APP_VERSION__: JSON.stringify(VITE_VERSION)
    },
    base: VITE_BASE_URL,
    server: {
      port: Number(VITE_PORT),
      proxy: {
        '/admin': {
          target: VITE_API_PROXY_URL,
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/admin/, '/api/v1/admin')
        },
        '/api': {
          target: VITE_API_PROXY_URL,
          changeOrigin: true
        }
      },
      host: true
    },
    // 路径别名
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@views': resolvePath('src/views'),
        '@imgs': resolvePath('src/assets/images'),
        '@icons': resolvePath('src/assets/icons'),
        '@utils': resolvePath('src/utils'),
        '@stores': resolvePath('src/store'),
        '@styles': resolvePath('src/assets/styles')
      }
    },
    build: {
      target: 'es2015',
      outDir: 'dist',
      chunkSizeWarningLimit: 2000,
      minify: 'terser',
      terserOptions: {
        compress: {
          // 生产环境去除 console
          drop_console: true,
          // 生产环境去除 debugger
          drop_debugger: true
        }
      },
      dynamicImportVarsOptions: {
        warnOnError: true,
        exclude: [],
        include: ['src/views/**/*.vue']
      },
      // 拆分 vendor chunk，避免主 chunk 超过 chunkSizeWarningLimit（2000KB）
      // 决议：P9-P0-02 / L8-04 / P8-R1R2-I02
      // 大体积依赖按业务域单独成 chunk，让浏览器并行下载、首屏只加载主链路。
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined
            // 富文本编辑器（最大单点）
            if (id.includes('@wangeditor')) return 'vendor-wangeditor'
            // 图表
            if (id.includes('echarts') || id.includes('zrender')) return 'vendor-echarts'
            // Excel 导出
            if (id.includes('xlsx')) return 'vendor-xlsx'
            // 视频播放
            if (id.includes('xgplayer')) return 'vendor-xgplayer'
            // 代码高亮
            if (id.includes('highlight.js')) return 'vendor-highlight'
            // Element Plus 全家桶（含 icons / dayjs / @ctrl/tinycolor）
            if (
              id.includes('element-plus') ||
              id.includes('@element-plus/icons-vue') ||
              id.includes('@ctrl/tinycolor')
            ) {
              return 'vendor-element-plus'
            }
            // Iconify
            if (id.includes('@iconify')) return 'vendor-iconify'
            // 加密 / 文件保存 / QR
            if (
              id.includes('crypto-js') ||
              id.includes('file-saver') ||
              id.includes('qrcode.vue')
            ) {
              return 'vendor-utils'
            }
            // Vue 全家桶
            if (
              id.includes('node_modules/vue/') ||
              id.includes('vue-router') ||
              id.includes('pinia') ||
              id.includes('@vueuse/core') ||
              id.includes('vue-i18n') ||
              id.includes('vue-draggable-plus')
            ) {
              return 'vendor-vue'
            }
            // 其余 node_modules 合并到 vendor
            return 'vendor'
          }
        }
      }
    },
    plugins: [
      vue(),
      tailwindcss(),
      // 自动按需导入 API
      AutoImport({
        imports: ['vue', 'vue-router', 'pinia', '@vueuse/core'],
        dts: 'src/types/import/auto-imports.d.ts',
        resolvers: [ElementPlusResolver()],
        eslintrc: {
          enabled: true,
          filepath: './.auto-import.json',
          globalsPropValue: true
        }
      }),
      // 自动按需导入组件
      Components({
        dts: 'src/types/import/components.d.ts',
        resolvers: [ElementPlusResolver()]
      }),
      // 按需定制主题配置
      ElementPlus({
        useSource: true
      }),
      // 压缩
      viteCompression({
        verbose: false, // 是否在控制台输出压缩结果
        disable: false, // 是否禁用
        algorithm: 'gzip', // 压缩算法
        ext: '.gz', // 压缩后的文件名后缀
        threshold: 10240, // 只有大小大于该值的资源会被处理 10240B = 10KB
        deleteOriginFile: false // 压缩后是否删除原文件
      }),
      vueDevTools()
      // 打包分析
      // visualizer({
      //   open: true,
      //   gzipSize: true,
      //   brotliSize: true,
      //   filename: 'dist/stats.html' // 分析图生成的文件名及路径
      // }),
    ],
    // 依赖预构建：避免运行时重复请求与转换，提升首次加载速度
    optimizeDeps: {
      include: [
        'echarts/core',
        'echarts/charts',
        'echarts/components',
        'echarts/renderers',
        'xlsx',
        'xgplayer',
        'crypto-js',
        'file-saver',
        'vue-img-cutter',
        'element-plus/es',
        'element-plus/es/components/*/style/css',
        'element-plus/es/components/*/style/index'
      ]
    },
    css: {
      preprocessorOptions: {
        // sass variable and mixin
        scss: {
          additionalData: `
            @use "@styles/core/el-light.scss" as *; 
            @use "@styles/core/mixin.scss" as *;
          `
        }
      },
      postcss: {
        plugins: [
          {
            postcssPlugin: 'internal:charset-removal',
            AtRule: {
              charset: (atRule) => {
                if (atRule.name === 'charset') {
                  atRule.remove()
                }
              }
            }
          }
        ]
      }
    }
  })
}

function resolvePath(paths: string) {
  return path.resolve(__dirname, paths)
}
