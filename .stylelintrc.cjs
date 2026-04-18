// ----------------------------------------------------------------------------
// O2O 跑腿+外卖 平台 根 Stylelint 配置
//   - 仅约定根级别 CSS/SCSS/Vue 样式规则；子项目沿用各自 .stylelintrc。
//   - 依据 docs/P1_项目初始化/DESIGN_P1_项目初始化.md §六
// ----------------------------------------------------------------------------
module.exports = {
  extends: [
    'stylelint-config-standard',
    'stylelint-config-recommended-scss',
    'stylelint-config-recommended-vue/scss',
    'stylelint-config-html/vue',
    'stylelint-config-recess-order'
  ],
  overrides: [
    {
      files: ['**/*.{vue,html}'],
      customSyntax: 'postcss-html'
    },
    {
      files: ['**/*.{css,scss}'],
      customSyntax: 'postcss-scss'
    }
  ],
  rules: {
    'import-notation': 'string',
    'selector-class-pattern': null,
    'custom-property-pattern': null,
    'keyframes-name-pattern': null,
    'no-descending-specificity': null,
    'no-empty-source': null,
    'property-no-vendor-prefix': null,
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
          'layer',
          'screen',
          'variants',
          'responsive'
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
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/unpackage/**',
    '**/coverage/**',
    // 管理后台 / 后端 各自带 stylelint 配置（或无样式文件），根规则不介入
    '管理后台/**',
    '后端/**'
    // 用户端/商户端/骑手端 由 I-03 各自携带 .stylelintrc.cjs，根忽略移除
  ]
}
