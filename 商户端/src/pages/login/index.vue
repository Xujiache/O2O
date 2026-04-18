<template>
  <view class="page page-login">
    <view class="title-wrap">
      <text class="title">O2O 商户端 · 登录</text>
      <text class="subtitle">PRD §3.2.1 登录与认证占位</text>
    </view>
  </view>
</template>

<script setup lang="ts">
  /**
   * 商户登录占位页
   * 功能：对齐 PRD §3.2.1，P6 阶段实现手机号验证码/密码登录、资质认证、子账号
   * 参数：无
   * 返回值：无
   * 用途：P1 脚手架路由验证
   */
</script>

<style lang="scss" scoped>
  .page-login {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    color: #fff;
    background: #2d8cf0;

    .title-wrap {
      text-align: center;
    }

    .title {
      display: block;
      font-size: 40rpx;
      font-weight: 600;
    }

    .subtitle {
      display: block;
      margin-top: 16rpx;
      font-size: 26rpx;
      opacity: 0.85;
    }
  }
</style>
