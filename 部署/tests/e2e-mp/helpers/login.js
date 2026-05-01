/**
 * mock 登录辅助
 * Sprint 4 / W4.E.1
 *
 * 测试环境 token 注入策略：
 * 1) 通过 miniProgram.callWxMethod('setStorageSync') 写入 token / userInfo，
 *    业务侧 request 拦截器读 storage.token，从而绕过真实微信登录链路；
 * 2) mockWxMethod('login') 返回固定 code，避免真发起 wx.login；
 * 3) reLaunch 到首页，确保 storage 在 onLaunch / onShow 钩子之前已就绪。
 */

const TEST_TOKEN = process.env.MP_TEST_TOKEN || 'test-jwt-token-mock-2026'
const TEST_USER = {
  id: 'u_test_001',
  nickname: 'E2E Tester',
  avatar: '',
  phone: '13800000001'
}

async function mockLogin(miniProgram) {
  // mock wx.login，避免请求真实微信服务器
  await miniProgram.mockWxMethod('login', {
    code: 'mock-login-code-001',
    errMsg: 'login:ok'
  })

  // mock wx.checkSession 始终通过
  await miniProgram.mockWxMethod('checkSession', { errMsg: 'checkSession:ok' })

  // 写 token 到小程序 storage
  await miniProgram.callWxMethod('setStorageSync', 'token', TEST_TOKEN)
  await miniProgram.callWxMethod('setStorageSync', 'userInfo', TEST_USER)
  await miniProgram.callWxMethod('setStorageSync', 'isLogin', true)

  // 跳到首页确保登录态生效
  await miniProgram.reLaunch('/pages/index/index')
  await miniProgram.waitFor(500)
}

async function clearLogin(miniProgram) {
  await miniProgram.callWxMethod('clearStorageSync')
}

module.exports = {
  mockLogin,
  clearLogin,
  TEST_TOKEN,
  TEST_USER
}
