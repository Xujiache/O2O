import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 全局 App Store（Pinia，setup 语法）
 * 功能：承载登录态、全局 loading、主题等与业务模块解耦的状态
 * 参数：无
 * 返回值：Pinia Store 实例
 * 用途：P5 阶段各业务模块创建各自 store，此处仅保留全局根 store
 */
export const useAppStore = defineStore('app', () => {
  const token = ref<string>('')
  const isLogin = ref<boolean>(false)

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

  return { token, isLogin, setToken }
})
