/**
 * 商户端 APP E2E — 接单流程
 * Sprint 4 / W4.E.2
 *
 * 步骤 (≥ 5)：
 *   1. 启动商户端 APP
 *   2. 输入账号密码登录
 *   3. 收到新订单（mock 推送 / 列表刷新）
 *   4. 点击接单按钮
 *   5. 校验订单状态变更为「已接单 / 制作中」
 */

import { loginByForm, MERCHANT_CRED } from '../../helpers/login'
import { PENDING_ORDER } from '../../helpers/fixtures'

describe('商户端 - 接单', () => {
  before(async () => {
    await driver.activateApp(process.env.MERCHANT_BUNDLE_ID || 'com.o2o.merchant')
  })

  it('Step 1: APP 启动应展示登录页', async () => {
    const loginRoot = await $('~login_root')
    await loginRoot.waitForDisplayed({ timeout: 30_000 })
    await expect(loginRoot).toBeDisplayed()
  })

  it('Step 2: 填写账号密码登录成功', async () => {
    await loginByForm(MERCHANT_CRED)
    const homeTab = await $('~tab_home')
    await expect(homeTab).toBeDisplayed()
  })

  it('Step 3: 进入新订单列表 → 看到待接单订单', async () => {
    const tabOrder = await $('~tab_order_pending')
    await tabOrder.click()
    const orderItem = await $(`~order_item_${PENDING_ORDER.id}`)
    await orderItem.waitForDisplayed({ timeout: 20_000 })
    await expect(orderItem).toBeDisplayed()
  })

  it('Step 4: 点击「接单」按钮', async () => {
    const acceptBtn = await $(`~order_${PENDING_ORDER.id}_accept`)
    await acceptBtn.waitForEnabled({ timeout: 10_000 })
    await acceptBtn.click()
    // 二次确认弹窗（如有）
    const confirmBtn = await $('~dialog_confirm')
    if (await confirmBtn.isExisting()) {
      await confirmBtn.click()
    }
  })

  it('Step 5: 校验订单状态变为「已接单」', async () => {
    const statusTag = await $(`~order_${PENDING_ORDER.id}_status`)
    await statusTag.waitForDisplayed({ timeout: 10_000 })
    const text = await statusTag.getText()
    await expect(['已接单', '制作中', 'accepted', 'preparing']).toContain(text)
  })
})
