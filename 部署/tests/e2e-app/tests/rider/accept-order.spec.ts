/**
 * 骑手端 APP E2E — 接单流程
 * Sprint 4 / W4.E.2
 *
 * 步骤 (≥ 5)：
 *   1. 启动骑手端 APP
 *   2. 登录骑手账号
 *   3. 待派单弹窗出现
 *   4. 点击「接单」
 *   5. 校验订单状态为「待取餐」
 */

import { loginByForm, RIDER_CRED } from '../../helpers/login'
import { RIDER_DISPATCH_ORDER } from '../../helpers/fixtures'

describe('骑手端 - 接单', () => {
  before(async () => {
    await driver.activateApp(process.env.RIDER_BUNDLE_ID || 'com.o2o.rider')
  })

  it('Step 1: 骑手端 APP 启动', async () => {
    const root = await $('~rider_login_root')
    await root.waitForDisplayed({ timeout: 30_000 })
    await expect(root).toBeDisplayed()
  })

  it('Step 2: 登录骑手账号', async () => {
    await loginByForm(RIDER_CRED)
    const homeTab = await $('~tab_home')
    await expect(homeTab).toBeDisplayed()
  })

  it('Step 3: 出现待派单弹窗', async () => {
    // 模拟切换到「在线」状态以接收派单
    const onlineSwitch = await $('~rider_online_switch')
    if (await onlineSwitch.isExisting()) {
      await onlineSwitch.click()
    }
    const dispatchDialog = await $(`~dispatch_dialog_${RIDER_DISPATCH_ORDER.id}`)
    await dispatchDialog.waitForDisplayed({ timeout: 30_000 })
    await expect(dispatchDialog).toBeDisplayed()
  })

  it('Step 4: 点击「接单」', async () => {
    const acceptBtn = await $('~dispatch_accept_btn')
    await acceptBtn.waitForEnabled({ timeout: 10_000 })
    await acceptBtn.click()
  })

  it('Step 5: 校验订单状态为「待取餐」', async () => {
    const statusTag = await $(`~order_${RIDER_DISPATCH_ORDER.id}_status`)
    await statusTag.waitForDisplayed({ timeout: 15_000 })
    const text = await statusTag.getText()
    await expect(['待取餐', '前往取餐', 'pickup_pending', 'to_pickup']).toContain(text)
  })
})
