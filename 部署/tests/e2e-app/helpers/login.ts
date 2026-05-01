/**
 * APP E2E mock 登录辅助
 * Sprint 4 / W4.E.2
 *
 * 策略：通过 driver 注入 localStorage / WebView storage 的 token，
 * 或调用业务侧暴露的 mock 登录页（dev 包），避开真实短信验证码 / 微信授权。
 */

interface LoginCredential {
  username: string
  password: string
  token: string
}

export const MERCHANT_CRED: LoginCredential = {
  username: process.env.E2E_MERCHANT_USER || 'merchant_e2e',
  password: process.env.E2E_MERCHANT_PASS || 'Merchant@2026',
  token: process.env.E2E_MERCHANT_TOKEN || 'mock-merchant-jwt-2026'
}

export const RIDER_CRED: LoginCredential = {
  username: process.env.E2E_RIDER_USER || 'rider_e2e',
  password: process.env.E2E_RIDER_PASS || 'Rider@2026',
  token: process.env.E2E_RIDER_TOKEN || 'mock-rider-jwt-2026'
}

/**
 * 通用登录：找到账号 / 密码输入框，填写后点登录。
 * 测试 build 应包含一个 dev mock 登录通道，跳过短信。
 */
export async function loginByForm(cred: LoginCredential): Promise<void> {
  const userInput = await $('~login_username')
  const passInput = await $('~login_password')
  const submitBtn = await $('~login_submit')

  await userInput.waitForDisplayed({ timeout: 20_000 })
  await userInput.setValue(cred.username)
  await passInput.setValue(cred.password)
  await submitBtn.click()

  // 登录成功后底部 tab 应可见
  const tabHome = await $('~tab_home')
  await tabHome.waitForDisplayed({ timeout: 20_000 })
}

/**
 * 直接通过 deeplink 注入 mock token（如 APP 支持自定义 scheme）。
 * 备用通道：在 mock 登录失败时使用。
 */
export async function loginByDeeplink(cred: LoginCredential, scheme: string): Promise<void> {
  const url = `${scheme}://mock-login?token=${encodeURIComponent(cred.token)}`
  await driver.url(url)
  const tabHome = await $('~tab_home')
  await tabHome.waitForDisplayed({ timeout: 20_000 })
}
