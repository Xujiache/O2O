/**
 * miniprogram-automator (wmpa) 全局配置
 * Sprint 4 / W4.E.1
 *
 * 通过环境变量覆盖：
 *   WX_CLI_PATH       —— 微信开发者工具 cli.bat 绝对路径
 *   MP_PROJECT_PATH   —— 已 build 出的 mp-weixin 工程路径
 *   WMPA_PORT         —— automator 自动化端口（默认 9420，需在工具中提前开启）
 *   WMPA_TIMEOUT      —— 启动超时（ms）
 */
module.exports = {
  cliPath: process.env.WX_CLI_PATH || 'C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat',
  projectPath: process.env.MP_PROJECT_PATH || '../../../用户端/dist/build/mp-weixin',
  port: Number(process.env.WMPA_PORT || 9420),
  timeout: Number(process.env.WMPA_TIMEOUT || 60_000)
}
