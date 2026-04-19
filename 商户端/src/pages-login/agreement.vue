<template>
  <view class="page page-agreement">
    <view class="agreement-card">
      <text class="agreement-title">商户服务协议</text>
      <text class="agreement-version">版本：v1.0 · 2026-04-19</text>

      <view class="agreement-section">
        <text class="agreement-h2">一、服务说明</text>
        <text class="agreement-p">
          本协议是您（即「商户」）与 O2O
          跑腿+外卖平台运营方（即「平台」）就接入、使用商户服务所订立的有效合约。
        </text>
      </view>

      <view class="agreement-section">
        <text class="agreement-h2">二、商户义务</text>
        <text class="agreement-p">
          1. 您承诺所提交的资质材料真实、合法、有效，且与营业执照载明信息完全一致。
        </text>
        <text class="agreement-p"> 2. 您应当依法纳税并取得相关行政许可（如食品经营许可证）。 </text>
        <text class="agreement-p"
          >3. 您应当确保实际经营内容、服务质量符合国家法律法规及平台规范。</text
        >
      </view>

      <view class="agreement-section">
        <text class="agreement-h2">三、平台权利</text>
        <text class="agreement-p">
          平台有权对商户提交的资料进行审核，对违规行为有权暂停 / 终止服务，并保留追究责任的权利。
        </text>
      </view>

      <view class="agreement-section">
        <text class="agreement-h2">四、费用与结算</text>
        <text class="agreement-p"> 1. 平台按订单金额收取服务费，具体比例以入驻合同为准。 </text>
        <text class="agreement-p">2. 结算周期为 T+1，资金通过持卡人本人对公账户打款。</text>
      </view>

      <view class="agreement-section">
        <text class="agreement-h2">五、违约责任</text>
        <text class="agreement-p">
          因您违反本协议给平台或第三方造成损失的，您应当承担全部赔偿责任。
        </text>
      </view>

      <view class="agreement-section">
        <text class="agreement-h2">六、生效与变更</text>
        <text class="agreement-p">
          本协议自您勾选并完成账号注册之日起生效；平台保留单方面修改协议的权利，修改后将通过应用内公告通知。
        </text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  /**
   * 商户服务协议静态页
   * @author 单 Agent V2.0 (P6 商户端 / T6.7)
   */
</script>

<style lang="scss" scoped>
  .page-agreement {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .agreement-card {
    padding: 32rpx;
    background: #fff;
    border-radius: 16rpx;
  }

  .agreement-title {
    display: block;
    font-size: 36rpx;
    font-weight: 600;
    color: $uni-text-color;
    text-align: center;
  }

  .agreement-version {
    display: block;
    margin-top: 8rpx;
    font-size: 22rpx;
    color: $uni-text-color-grey;
    text-align: center;
  }

  .agreement-section {
    margin-top: 32rpx;
  }

  .agreement-h2 {
    display: block;
    margin-bottom: 12rpx;
    font-size: 28rpx;
    font-weight: 600;
    color: $uni-text-color;
  }

  .agreement-p {
    display: block;
    margin-bottom: 8rpx;
    font-size: 26rpx;
    line-height: 1.7;
    color: $uni-text-color;
  }
</style>
