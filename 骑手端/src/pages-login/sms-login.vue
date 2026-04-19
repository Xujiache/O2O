<template>
  <view class="page page-sms-login">
    <view class="hint">
      <text>验证码登录与主登录页一致，请直接在登录页切换"验证码登录" Tab</text>
    </view>
    <button class="back" @click="goBack">返回登录</button>
  </view>
</template>

<script setup lang="ts">
  /**
   * 短信登录辅助路由（兼容外部跳转）
   * 实际登录入口在 /pages/login/index Tab "验证码登录"
   * @author 单 Agent V2.0 (P7 骑手端 / T7.6)
   */
  function goBack() {
    uni.reLaunch({ url: '/pages/login/index' })
  }
</script>

<style lang="scss" scoped>
  .page-sms-login {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    padding: 32rpx;
  }

  .hint {
    margin-bottom: 32rpx;
    font-size: 26rpx;
    color: $uni-text-color-grey;
    text-align: center;
  }

  .back {
    width: 320rpx;
    height: 80rpx;
    font-size: 28rpx;
    line-height: 80rpx;
    color: #fff;
    background: $uni-color-primary;
    border: none;
    border-radius: $uni-border-radius-base;
  }
</style>
