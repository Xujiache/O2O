// ----------------------------------------------------------------------------
// 商户端 ESLint flat config（ESLint 9 + typescript-eslint 8 + eslint-plugin-vue 9）
//   - 严格对齐 DESIGN_P1 §6.1 规范栈
//   - 作用域：仅 src/ 下 .ts / .vue 文件
//   - 忽略：node_modules / unpackage / dist / env / src/types / 自动生成物
// ----------------------------------------------------------------------------
import pluginJs from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'
import globals from 'globals'

/**
 * 商户端 ESLint 配置
 * 功能：对 uni-app Vue3 源码进行 JS/TS/Vue 三维代码质量校验，并叠加 Prettier 风格
 * 参数：无（ESLint 9 flat config 由 ESLint 引擎直接导入）
 * 返回值：FlatConfig[] 由 tseslint.config 生成的扁平配置数组
 * 用途：`pnpm --filter 商户端 lint[:check]` 时被自动加载
 */
export default tseslint.config(
  {
    ignores: [
      'node_modules',
      'unpackage',
      'dist',
      'build',
      'env',
      'src/types',
      'auto-imports.d.ts',
      'components.d.ts'
    ]
  },
  {
    files: ['src/**/*.{ts,vue}'],
    extends: [
      pluginJs.configs.recommended,
      ...tseslint.configs.recommended,
      ...pluginVue.configs['flat/essential'],
      eslintPluginPrettierRecommended
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        uni: 'readonly',
        wx: 'readonly',
        plus: 'readonly',
        getApp: 'readonly',
        getCurrentPages: 'readonly'
      },
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue']
      }
    },
    rules: {
      quotes: ['error', 'single'],
      semi: ['error', 'never'],
      'no-var': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'vue/multi-word-component-names': 'off',
      'vue/html-self-closing': 'off',
      'no-multiple-empty-lines': ['warn', { max: 1 }],
      'no-unexpected-multiline': 'error'
    }
  }
)
