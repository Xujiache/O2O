<template>
  <view class="page page-index">
    <view class="hero">
      <text class="hero-title">O2O 用户端 · 首页</text>
      <text class="hero-subtitle">P1 项目初始化占位页（PRD §3.1.1）</text>
    </view>
    <view class="module-list">
      <view class="module-item" v-for="(m, i) in modules" :key="i">
        <text class="module-item__label">{{ m }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  /**
   * 用户端首页占位组件
   * 功能：展示 PRD §3.1.1 首页模块的六大子模块清单，仅用于 P1 验证 uni-app + uView Plus + Pinia 启动链路
   * 参数：无
   * 返回值：无
   * 用途：P5 阶段替换为真实首页（定位、搜索、运营位、推荐、公告等）
   */
  const modules = ['定位服务', '搜索', '运营位', '推荐', '公告栏', '客服入口']
</script>

<style lang="scss" scoped>
  .page-index {
    padding: 24rpx;
  }

  .hero {
    padding: 48rpx 24rpx;
    color: #fff;
    background: linear-gradient(135deg, #ff6b35 0%, #ff8e53 100%);
    border-radius: 16rpx;

    &-title {
      display: block;
      font-size: 36rpx;
      font-weight: 600;
    }

    &-subtitle {
      display: block;
      margin-top: 12rpx;
      font-size: 24rpx;
      opacity: 0.85;
    }
  }

  .module-list {
    display: flex;
    flex-wrap: wrap;
    gap: 16rpx;
    margin-top: 24rpx;
  }

  .module-item {
    flex: 0 0 calc((100% - 32rpx) / 3);
    padding: 40rpx 0;
    text-align: center;
    background: #fff;
    border-radius: 12rpx;

    &__label {
      font-size: 28rpx;
      color: #333;
    }
  }
</style>
