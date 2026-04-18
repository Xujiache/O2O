import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 全局 App Store（Pinia，setup 语法）
 * 功能：承载骑手登录态、上下班状态、当前位置等全局状态
 * 参数：无
 * 返回值：Pinia Store 实例
 * 用途：P7 阶段各业务模块扩展自身 store
 */
export const useAppStore = defineStore('app', () => {
  const token = ref<string>('')
  const isLogin = ref<boolean>(false)
  const onDuty = ref<boolean>(false)

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
   * 切换上下班状态
   * 参数：flag true 表示已上线接单、false 表示离线
   * 返回值：无
   * 用途：打卡模块调用
   */
  function setOnDuty(flag: boolean) {
    onDuty.value = flag
  }

  return { token, isLogin, onDuty, setToken, setOnDuty }
})
