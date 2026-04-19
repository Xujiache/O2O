<template>
  <view class="page page-bc">
    <view v-if="cards.length > 0" class="bc-list">
      <view v-for="c in cards" :key="c.id" class="bc-card">
        <view class="bc-card__inner">
          <text class="bc-card__bank">{{ c.bankName }}</text>
          <text class="bc-card__no">{{ c.cardNoMask }}</text>
          <text class="bc-card__holder">{{ c.holderName }}</text>
          <text v-if="c.isDefault" class="bc-card__default">默认</text>
        </view>
        <view class="bc-card__actions">
          <text v-if="!c.isDefault" class="bc-card__btn" @click="onSetDefault(c)">设为默认</text>
          <text class="bc-card__btn bc-card__btn--del" @click="onDelete(c)">删除</text>
        </view>
      </view>
    </view>
    <BizEmpty v-else title="暂无银行卡" desc="点击「添加银行卡」绑定您的对公账户" scene="finance">
      <template #action>
        <BizBtn type="primary" text="添加银行卡" @click="goAdd" />
      </template>
    </BizEmpty>

    <view v-if="cards.length > 0" class="bc-actions">
      <BizBtn type="primary" block text="添加银行卡" @click="goAdd" />
    </view>
  </view>
</template>

<script setup lang="ts">
  import { ref, onMounted } from 'vue'
  import { onShow } from '@dcloudio/uni-app'
  import type { BankCard } from '@/types/biz'
  import { listBankCards, setDefaultBankCard, deleteBankCard } from '@/api/wallet'
  import { mockEnabled, delay } from '@/api/_mock'
  import { logger } from '@/utils/logger'

  /**
   * 银行卡管理（T6.31）
   * @author 单 Agent V2.0 (P6 商户端)
   */
  const cards = ref<BankCard[]>([])

  onMounted(() => {
    void load()
  })

  onShow(() => {
    void load()
  })

  async function load() {
    try {
      cards.value = mockEnabled()
        ? await delay([
            {
              id: 'bc-1',
              holderName: '张三',
              cardNoMask: '****1234',
              bankName: '中国工商银行',
              cardType: 1,
              isDefault: 1
            }
          ] as BankCard[])
        : await listBankCards()
    } catch (e) {
      logger.warn('bc.load.fail', { e: String(e) })
    }
  }

  function goAdd() {
    uni.navigateTo({ url: '/pages-finance/bank-card-edit' })
  }

  async function onSetDefault(c: BankCard) {
    try {
      if (!mockEnabled()) await setDefaultBankCard(c.id)
      cards.value = cards.value.map((x) => ({
        ...x,
        isDefault: x.id === c.id ? 1 : 0
      }))
      uni.showToast({ title: '已设为默认', icon: 'success' })
    } catch (e) {
      logger.warn('bc.default.fail', { e: String(e) })
    }
  }

  function onDelete(c: BankCard) {
    uni.showModal({
      title: '删除银行卡',
      content: `确认删除「${c.bankName} ${c.cardNoMask}」？`,
      success: async (res) => {
        if (!res.confirm) return
        try {
          if (!mockEnabled()) await deleteBankCard(c.id)
          cards.value = cards.value.filter((x) => x.id !== c.id)
          uni.showToast({ title: '已删除', icon: 'success' })
        } catch (e) {
          logger.warn('bc.del.fail', { e: String(e) })
        }
      }
    })
  }
</script>

<style lang="scss" scoped>
  .page-bc {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .bc-list {
    margin-bottom: 24rpx;
  }

  .bc-card {
    margin-bottom: 16rpx;
    overflow: hidden;
    background: #fff;
    border-radius: 16rpx;

    &__inner {
      position: relative;
      padding: 32rpx;
      color: #fff;
      background: linear-gradient(135deg, $uni-color-primary 0%, #6db3ff 100%);
    }

    &__bank {
      display: block;
      font-size: 30rpx;
      font-weight: 600;
    }

    &__no {
      display: block;
      margin-top: 16rpx;
      font-size: 36rpx;
      letter-spacing: 4rpx;
    }

    &__holder {
      display: block;
      margin-top: 8rpx;
      font-size: 24rpx;
      opacity: 0.85;
    }

    &__default {
      position: absolute;
      top: 16rpx;
      right: 16rpx;
      padding: 4rpx 12rpx;
      font-size: 20rpx;
      background: rgb(255 255 255 / 30%);
      border-radius: 999rpx;
    }

    &__actions {
      display: flex;
      gap: 32rpx;
      justify-content: flex-end;
      padding: 16rpx 24rpx;
    }

    &__btn {
      font-size: 24rpx;
      color: $uni-color-primary;

      &--del {
        color: $uni-color-error;
      }
    }
  }

  .bc-actions {
    padding: 24rpx 0;
  }
</style>
