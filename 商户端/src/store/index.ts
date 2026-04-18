import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 全局 App Store（Pinia，setup 语法）
 * 功能：承载商户登录态、当前店铺 ID、语音开关等与业务模块解耦的全局状态
 * 参数：无
 * 返回值：Pinia Store 实例
 * 用途：P6 阶段各业务模块创建各自 store，此处保留全局根 store
 */
export const useAppStore = defineStore('app', () => {
  const token = ref<string>('')
  const isLogin = ref<boolean>(false)
  const shopId = ref<string>('')

  /**
   * 更新登录态
   * 参数：newToken 新 token 字符串
   * 返回值：无
   * 用途：登录成功 / 退出登录时调用
   */
  function setToken(newToken: string) {
    token.value = newToken
    isLogin.value = Boolean(newToken)
  }

  /**
   * 设置当前选中店铺
   * 参数：id 店铺主键
   * 返回值：无
   * 用途：切换店铺时调用
   */
  function setShopId(id: string) {
    shopId.value = id
  }

  return { token, isLogin, shopId, setToken, setShopId }
})
