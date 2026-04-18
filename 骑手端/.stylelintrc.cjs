// ----------------------------------------------------------------------------
// 骑手端 Stylelint 16 配置
//   - 严格对齐 DESIGN_P1 §6.1 规范栈
//   - 作用域：src/ 下 .vue / .scss / .css
//   - 忽略：node_modules / unpackage / dist / static 资源
// ----------------------------------------------------------------------------
/**
 * 骑手端 Stylelint 配置
 * 功能：对 uni-app Vue 单文件 style 块、独立 scss/css 文件做规则与顺序校验
 * 参数：无（Stylelint 引擎直接加载）
 * 返回值：object Stylelint 配置对象
 * 用途：`pnpm --filter 骑手端 lint:stylelint[:check]` 时加载
 */
module.exports = {
  extends: [
    'stylelint-config-standard-scss',
    'stylelint-config-recommended-vue/scss',
    'stylelint-config-html/vue',
    'stylelint-config-recess-order'
  ],
  overrides: [
    { files: ['**/*.{vue,html}'], customSyntax: 'postcss-html' },
    { files: ['**/*.{css,scss}'], customSyntax: 'postcss-scss' }
  ],
  rules: {
    'import-notation': 'string',
    'selector-class-pattern': null,
    'custom-property-pattern': null,
    'keyframes-name-pattern': null,
    'no-descending-specificity': null,
    'no-empty-source': null,
    'property-no-vendor-prefix': null,
    'rule-empty-line-before': null,
    'scss/dollar-variable-empty-line-before': null,
    // uni-app 专用单位：rpx（Responsive pixel）/ upx（旧名）
    'unit-no-unknown': [true, { ignoreUnits: ['rpx', 'upx'] }],
    'selector-pseudo-class-no-unknown': [
      true,
      { ignorePseudoClasses: ['global', 'export', 'deep'] }
    ],
    'property-no-unknown': [true, { ignoreProperties: [] }],
    'at-rule-no-unknown': [
      true,
      {
        ignoreAtRules: [
          'apply',
          'use',
          'mixin',
          'include',
          'extend',
          'each',
          'if',
          'else',
          'for',
          'while',
          'reference',
          'tailwind',
          'layer'
        ]
      }
    ],
    'scss/at-rule-no-unknown': [
      true,
      {
        ignoreAtRules: [
          'apply',
          'use',
          'mixin',
          'include',
          'extend',
          'each',
          'if',
          'else',
          'for',
          'while',
          'reference',
          'tailwind',
          'layer'
        ]
      }
    ]
  },
  ignoreFiles: [
    'node_modules/**',
    'unpackage/**',
    'dist/**',
    'build/**',
    'src/static/**'
  ]
}
