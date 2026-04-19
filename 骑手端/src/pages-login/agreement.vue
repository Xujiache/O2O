<template>
  <scroll-view scroll-y class="page page-agreement">
    <view class="title">骑手服务协议</view>
    <view class="updated">最后更新：2026-04-01</view>
    <view class="content">
      <p>欢迎您加入 O2O 平台成为配送骑手。请在开始接单前认真阅读以下条款：</p>
      <p>1. 实名认证</p>
      <p>骑手须如实提交本人身份证、健康证、车辆与从业资格证明，资料失实将导致冻结。</p>
      <p>2. 配送行为</p>
      <p>请遵守交通法规、佩戴头盔、按平台路径配送；禁止虚假签收、丢件或私自加价。</p>
      <p>3. 取送件凭证</p>
      <p>跑腿订单需上传取件凭证；外卖订单送达后需上传水印照片，凭证保留 30 天。</p>
      <p>4. 保证金</p>
      <p>500 元保证金用于违约赔偿，结清后退出可退回。</p>
      <p>5. 隐私与位置上报</p>
      <p>上岗期间将以 10 秒/次的频率向平台上报实时位置，保障订单可追溯，关闭即下班。</p>
      <p>6. 紧急情况</p>
      <p>如遇紧急情况可使用一键求助按钮，平台将同步呼叫客服与紧急联系人。</p>
      <p>本协议详细内容以正式版本为准，详见平台官网。</p>
    </view>
  </scroll-view>
</template>

<script setup lang="ts">
  /**
   * 骑手服务协议（占位文案，正式版以官网为准）
   * @author 单 Agent V2.0 (P7 骑手端 / T7.6)
   */
</script>

<style lang="scss" scoped>
  .page-agreement {
    height: 100vh;
    padding: 32rpx;
    background: #fff;
  }

  .title {
    font-size: 36rpx;
    font-weight: 600;
    text-align: center;
  }

  .updated {
    margin: 8rpx 0 32rpx;
    font-size: 22rpx;
    color: $uni-text-color-grey;
    text-align: center;
  }

  .content {
    font-size: 26rpx;
    line-height: 1.8;
    color: $uni-text-color;
    p {
      display: block;
      margin-bottom: 16rpx;
    }
  }
</style>
