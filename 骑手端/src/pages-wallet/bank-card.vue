<template>
  <view class="page">
    <BizEmpty v-if="wallet.bankCards.length === 0" title="暂无银行卡" scene="wallet">
      <template #action>
        <BizBtn type="primary" @click="goAdd">添加银行卡</BizBtn>
      </template>
    </BizEmpty>

    <view v-else>
      <view v-for="c in wallet.bankCards" :key="c.id" class="card">
        <view class="card__head">
          <text class="card__bank">{{ c.bankName }}</text>
          <text v-if="c.isDefault === 1" class="card__default">默认</text>
        </view>
        <text class="card__no">{{ c.cardNoMask }}</text>
        <text class="card__name">{{ c.holderName }}</text>
        <view class="card__actions">
          <text class="link link--del" @click="onDel(c.id)">解绑</text>
        </view>
      </view>

      <button class="primary" @click="goAdd">+ 添加银行卡</button>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { onShow } from '@dcloudio/uni-app'
  import { useWalletStore } from '@/store'
  import { mockResolve } from '@/api/_mock'

  /**
   * 银行卡列表 + 解绑
   * @author 单 Agent V2.0 (P7 骑手端 / T7.34)
   */
  const wallet = useWalletStore()

  onShow(async () => {
    await wallet.loadBankCards().catch(() => {
      wallet.bankCards = mockResolve.bankCards
    })
  })

  function goAdd() {
    uni.navigateTo({ url: '/pages-wallet/bank-card-edit' })
  }

  function onDel(id: string) {
    uni.showModal({
      title: '确认解绑',
      content: '解绑后该银行卡将无法用于提现',
      success: ({ confirm }) => {
        if (!confirm) return
        void wallet.removeBankCard(id).then((ok) => {
          if (ok) uni.showToast({ title: '已解绑', icon: 'success' })
        })
      }
    })
  }
</script>

<style lang="scss" scoped>
  .page {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .card {
    padding: 24rpx;
    margin-bottom: 16rpx;
    background: linear-gradient(135deg, $uni-color-primary 0%, $uni-color-primary-dark 100%);
    border-radius: 16rpx;

    &__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16rpx;
      color: #fff;
    }

    &__bank {
      font-size: 28rpx;
      font-weight: 600;
    }

    &__default {
      padding: 2rpx 12rpx;
      font-size: 20rpx;
      color: #fff;
      background: rgb(255 255 255 / 22%);
      border-radius: 16rpx;
    }

    &__no {
      display: block;
      margin: 16rpx 0;
      font-size: 36rpx;
      font-weight: 600;
      color: #fff;
      letter-spacing: 0.2em;
    }

    &__name {
      display: block;
      font-size: 22rpx;
      color: rgb(255 255 255 / 80%);
    }

    &__actions {
      margin-top: 24rpx;
      text-align: right;
    }
  }

  .link {
    font-size: 22rpx;
    color: rgb(255 255 255 / 80%);

    &--del {
      color: #fff;
    }
  }

  .primary {
    width: 100%;
    height: 88rpx;
    margin-top: 16rpx;
    font-size: 28rpx;
    line-height: 88rpx;
    color: $uni-color-primary;
    background: #fff;
    border: 2rpx dashed $uni-color-primary;
    border-radius: $uni-border-radius-base;

    &::after {
      border: none;
    }
  }
</style>
