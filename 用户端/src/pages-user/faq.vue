<template>
  <view class="page faq">
    <view class="faq__header">
      <text class="faq__header-title">常见问题</text>
      <text class="faq__header-sub">快速找到答案，节省你的时间</text>
    </view>

    <view class="faq__list">
      <view
        v-for="(item, i) in faqs"
        :key="i"
        class="faq__item"
        :class="{ 'faq__item--open': open === i }"
      >
        <view class="faq__q" @tap="toggle(i)">
          <text class="faq__q-icon">Q</text>
          <text class="faq__q-text">{{ item.q }}</text>
          <text class="faq__q-arrow" :class="{ 'faq__q-arrow--open': open === i }">›</text>
        </view>
        <view v-if="open === i" class="faq__a">
          <text class="faq__a-icon">A</text>
          <text class="faq__a-text">{{ item.a }}</text>
        </view>
      </view>
    </view>

    <view class="faq__contact" @tap="goCs">
      <text>没有找到想要的答案？联系客服 ›</text>
    </view>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-user/faq.vue
   * @stage P5/T5.39 (Sprint 6)
   * @desc 常见问题：8 个静态 Q&A 手风琴 collapse
   * @author 单 Agent V2.0
   */
  import { ref } from 'vue'

  interface FaqItem {
    q: string
    a: string
  }

  const open = ref<number>(-1)

  const faqs: FaqItem[] = [
    {
      q: '订单可以取消吗？',
      a: '商家未接单前可以无条件取消，待商家或骑手接单后取消需要联系客服或申请退款，按照实际发生的费用扣除部分金额。'
    },
    {
      q: '钱包余额能提现吗？',
      a: '当前版本钱包余额仅支持站内消费抵扣（外卖 / 跑腿订单），暂不支持提现。提现功能将在后续版本上线。'
    },
    {
      q: '为什么我的优惠券显示不可用？',
      a: '请检查优惠券的有效期、使用范围（外卖 / 跑腿）以及最低订单金额是否满足；下单时系统会自动推荐最优券。'
    },
    {
      q: '配送费是怎么计算的？',
      a: '外卖配送费由商家设定起送价 + 距离梯度计算；跑腿配送费 = 起步价 + 距离费 + 重量费 + 服务费 + 保价费，下单前会展示明细。'
    },
    {
      q: '如何申请发票？',
      a: '在订单详情或个人中心 - 我的发票 - 申请开票，选择订单与抬头并填写邮箱即可，电子发票会发送至指定邮箱。'
    },
    {
      q: '收不到短信验证码怎么办？',
      a: '请检查手机号是否正确、短信是否被屏蔽，可以稍后重试或切换微信一键登录。如多次失败请联系客服。'
    },
    {
      q: '骑手取餐 / 送餐慢怎么办？',
      a: '可在订单详情页使用"催单"按钮通知商家或骑手；如严重超时可申请售后或在订单完成后提交投诉。'
    },
    {
      q: '账号能注销吗？',
      a: '请联系客服提交注销申请，平台审核后会清除账号关联数据；注销前请确保无未完成订单与未结算资金。'
    }
  ]

  function toggle(i: number) {
    open.value = open.value === i ? -1 : i
  }

  function goCs() {
    uni.navigateTo({ url: '/pages-user/cs' })
  }
</script>

<style lang="scss" scoped>
  .faq {
    padding: 24rpx 16rpx 48rpx;

    &__header {
      padding: 24rpx 16rpx 16rpx;
    }

    &__header-title {
      display: block;
      font-size: $font-size-lg;
      font-weight: $font-weight-bold;
      color: $color-text-primary;
    }

    &__header-sub {
      display: block;
      margin-top: 8rpx;
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__list {
      margin-top: 16rpx;
      background: $color-bg-white;
      border-radius: $radius-md;
    }

    &__item {
      padding: 0 24rpx;
      border-bottom: 1rpx solid $color-divider;

      &:last-child {
        border-bottom: none;
      }
    }

    &__q {
      display: flex;
      align-items: center;
      padding: 28rpx 0;
    }

    &__q-icon {
      flex-shrink: 0;
      width: 40rpx;
      height: 40rpx;
      margin-right: 16rpx;
      font-size: $font-size-sm;
      font-weight: $font-weight-bold;
      line-height: 40rpx;
      color: $color-primary;
      text-align: center;
      background: rgba(255, 106, 26, 0.1);
      border-radius: $radius-circle;
    }

    &__q-text {
      flex: 1;
      font-size: $font-size-base;
      color: $color-text-primary;
    }

    &__q-arrow {
      margin-left: 16rpx;
      font-size: $font-size-md;
      color: $color-text-placeholder;
      transition: transform 0.2s;

      &--open {
        transform: rotate(90deg);
      }
    }

    &__a {
      display: flex;
      padding: 0 0 24rpx 56rpx;
    }

    &__a-icon {
      flex-shrink: 0;
      width: 40rpx;
      height: 40rpx;
      margin-right: 16rpx;
      font-size: $font-size-sm;
      font-weight: $font-weight-bold;
      line-height: 40rpx;
      color: $color-info;
      text-align: center;
      background: $color-divider;
      border-radius: $radius-circle;
    }

    &__a-text {
      flex: 1;
      font-size: $font-size-sm;
      line-height: 1.6;
      color: $color-text-regular;
    }

    &__contact {
      padding: 32rpx 16rpx;
      font-size: $font-size-sm;
      color: $color-primary;
      text-align: center;
    }
  }
</style>
