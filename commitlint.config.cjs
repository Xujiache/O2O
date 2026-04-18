// ----------------------------------------------------------------------------
// O2O 跑腿+外卖 平台 commitlint 配置（Conventional Commits + cz-git）
// 参考：https://commitlint.js.org/#/reference-rules
//       https://cz-git.qbb.sh/zh/guide/
// 对齐 管理后台/commitlint.config.cjs，保持 monorepo 提交风格一致。
// ----------------------------------------------------------------------------
module.exports = {
  // 继承官方 Conventional Commits 配置
  extends: ['@commitlint/config-conventional'],
  rules: {
    // type 必须在以下枚举内（严格对齐 DESIGN_P1 §6.3：feat/fix/docs/style/refactor/perf/test/build/ci/chore/revert）
    'type-enum': [
      2,
      'always',
      [
        'feat', // 新增功能
        'fix', // 修复缺陷
        'docs', // 文档变更
        'style', // 代码格式（不影响功能）
        'refactor', // 代码重构（非 bug 修复/新增）
        'perf', // 性能优化
        'test', // 测试用例
        'build', // 构建流程/外部依赖
        'ci', // CI 配置
        'revert', // 回滚 commit
        'chore' // 辅助工具/杂项
      ]
    ],
    'subject-case': [0],
    'header-max-length': [0]
  },
  prompt: {
    messages: {
      type: '选择你要提交的类型 :',
      scope: '选择一个提交范围（可选）:',
      customScope: '请输入自定义的提交范围 :',
      subject: '填写简短精炼的变更描述 :\n',
      body: '填写更加详细的变更描述（可选）。使用 "|" 换行 :\n',
      breaking: '列举非兼容性重大的变更（可选）。使用 "|" 换行 :\n',
      footerPrefixesSelect: '选择关联 issue 前缀（可选）:',
      customFooterPrefix: '输入自定义 issue 前缀 :',
      footer: '列举关联 issue (可选) 例如: #31, #I3244 :\n',
      confirmCommit: '是否提交或修改 commit ?'
    },
    // prettier-ignore
    types: [
      { value: 'feat',     name: 'feat:     新增功能' },
      { value: 'fix',      name: 'fix:      修复缺陷' },
      { value: 'docs',     name: 'docs:     文档变更' },
      { value: 'style',    name: 'style:    代码格式（不影响功能）' },
      { value: 'refactor', name: 'refactor: 代码重构（非 bug/新增）' },
      { value: 'perf',     name: 'perf:     性能优化' },
      { value: 'test',     name: 'test:     测试用例' },
      { value: 'build',    name: 'build:    构建流程/外部依赖变更' },
      { value: 'ci',       name: 'ci:       修改 CI 配置/脚本' },
      { value: 'revert',   name: 'revert:   回滚 commit' },
      { value: 'chore',    name: 'chore:    辅助工具/杂项' }
    ],
    useEmoji: true,
    emojiAlign: 'center',
    useAI: false,
    aiNumber: 1,
    themeColorCode: '',
    // 支持 monorepo 按端划分 scope
    scopes: ['用户端', '商户端', '骑手端', '管理后台', '后端', '部署', 'docs', 'workspace'],
    allowCustomScopes: true,
    allowEmptyScopes: true,
    customScopesAlign: 'bottom',
    customScopesAlias: 'custom',
    emptyScopesAlias: 'empty',
    upperCaseSubject: false,
    markBreakingChangeMode: false,
    allowBreakingChanges: ['feat', 'fix'],
    breaklineNumber: 100,
    breaklineChar: '|',
    skipQuestions: ['breaking', 'footerPrefix', 'footer'],
    issuePrefixes: [{ value: 'closed', name: 'closed:   ISSUES has been processed' }],
    customIssuePrefixAlign: 'top',
    emptyIssuePrefixAlias: 'skip',
    customIssuePrefixAlias: 'custom',
    allowCustomIssuePrefix: true,
    allowEmptyIssuePrefix: true,
    confirmColorize: true,
    maxHeaderLength: 100,
    maxSubjectLength: Infinity,
    minSubjectLength: 0,
    scopeOverrides: undefined,
    defaultBody: '',
    defaultIssues: '',
    defaultScope: '',
    defaultSubject: ''
  }
}
