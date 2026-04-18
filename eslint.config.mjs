// ----------------------------------------------------------------------------
// O2O 跑腿+外卖 平台 根 ESLint flat config
//   - 仅作用于 根级脚本/配置文件；各子包（用户端/商户端/骑手端/管理后台/后端）
//     在自己的 eslint.config.* 中声明精确规则，以免跨技术栈冲突。
//   - 依据 docs/P1_项目初始化/DESIGN_P1_项目初始化.md §六
// ----------------------------------------------------------------------------
import pluginJs from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'
import globals from 'globals'

/**
 * 根 ESLint 配置
 * 功能：对 monorepo 根目录下的脚本与配置文件做基础代码质量校验
 * 参数：无（ESLint 9 flat config 由 ESLint 引擎直接导入）
 * 返回值：FlatConfig[] ESLint flat 配置数组
 * 用途：开发者在根目录执行 `pnpm lint` 时对根脚本进行静态检查
 */
export default tseslint.config(
  // 全量忽略：各子项目产物 / 自动生成物 / 非 ESLint-9-friendly 的子包
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-ssr/**',
      '**/build/**',
      '**/unpackage/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/.output/**',
      '**/.vite/**',
      '**/.cache/**',
      // 管理后台 / 后端 各自带 eslint 配置，根规则不介入
      '管理后台/**',
      '后端/**',
      // 用户端/商户端/骑手端 由 I-02 各自携带 eslint.config.mjs，无需根忽略
      // 自动生成
      '**/auto-imports.d.ts',
      '**/components.d.ts',
      '**/.auto-import.json'
    ]
  },
  // 作用范围：仅根目录脚本/配置；通过 extends 把 pluginJs / tseslint / prettier
  // 的全部规则一并限定在此 files 匹配集合内（typescript-eslint 8 官方推荐写法）
  {
    files: ['*.{js,cjs,mjs,ts,cts,mts}', 'scripts/**/*.{js,cjs,mjs,ts}'],
    extends: [
      pluginJs.configs.recommended,
      ...tseslint.configs.recommended,
      eslintPluginPrettierRecommended
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node
      }
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'no-multiple-empty-lines': ['warn', { max: 1 }]
    }
  }
)
