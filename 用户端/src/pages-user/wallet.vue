<template>
  <view class="page wallet">
    <view class="wallet__hero">
      <text class="wallet__hero-label">账户余额（元）</text>
      <text class="wallet__hero-balance">{{ balanceText }}</text>
      <view class="wallet__hero-meta">
        <view class="wallet__hero-meta-item">
          <text class="wallet__hero-meta-label">冻结</text>
          <text class="wallet__hero-meta-val">{{ frozenText }}</text>
        </view>
        <view class="wallet__hero-meta-divider" />
        <view class="wallet__hero-meta-item">
          <text class="wallet__hero-meta-label">累计收入</text>
          <text class="wallet__hero-meta-val">{{ incomeText }}</text>
        </view>
        <view class="wallet__hero-meta-divider" />
        <view class="wallet__hero-meta-item">
          <text class="wallet__hero-meta-label">累计支出</text>
          <text class="wallet__hero-meta-val">{{ expenseText }}</text>
        </view>
      </view>
      <view class="wallet__actions">
        <button class="wallet__charge" @tap="onCharge">充值</button>
      </view>
    </view>

    <view class="wallet__tabs">
      <view
        v-for="(t, i) in tabs"
        :key="t.value"
        class="wallet__tab"
        :class="{ 'wallet__tab--active': activeTab === i }"
        @tap="onTabChange(i)"
      >
        <text>{{ t.label }}</text>
      </view>
    </view>

    <BizLoading v-if="loading && flows.length === 0" />
    <BizEmpty v-else-if="!loading && flows.length === 0" text="暂无流水" />
    <scroll-view v-else scroll-y class="wallet__scroll" @scrolltolower="onLoadMore">
      <view v-for="f in flows" :key="f.id" class="wallet__flow">
        <view class="wallet__flow-main">
          <text class="wallet__flow-name">{{ bizTypeText(f.bizType) }}</text>
          <text
            class="wallet__flow-amount"
            :class="
              f.flowDirection === 1 ? 'wallet__flow-amount--income' : 'wallet__flow-amount--expense'
            "
          >
            {{ f.flowDirection === 1 ? '+' : '-' }}{{ formatAmount(f.amount, '') }}
          </text>
        </view>
        <view class="wallet__flow-meta">
          <text class="wallet__flow-remark">{{ f.remark || '-' }}</text>
          <text class="wallet__flow-time">{{ formatTime(f.createdAt) }}</text>
        </view>
      </view>
      <view class="wallet__more">
        <text>{{ hasMore ? (loading ? '加载中...' : '上拉加载更多') : '—— 没有更多了 ——' }}</text>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-user/wallet.vue
   * @stage P5/T5.35 (Sprint 6)
   * @desc 我的钱包：余额 + 累计 + Tab（全部/收入/支出）流水（keyset 分页）
   * @author 单 Agent V2.0
   */
  import { ref, computed } from 'vue'
  import { onShow, onPullDownRefresh } from '@dcloudio/uni-app'
  import BizLoading from '@/components/biz/BizLoading.vue'
  import BizEmpty from '@/components/biz/BizEmpty.vue'
  import { getWallet, listWalletFlows } from '@/api/wallet'
  import type { Wallet, AccountFlow } from '@/types/biz'
  import { formatAmount, formatTime } from '@/utils/format'
  import { logger } from '@/utils/logger'

  type Direction = 1 | 2 | undefined
  interface TabDef {
    label: string
    value: 'all' | 'income' | 'expense'
    direction: Direction
  }

  const tabs: TabDef[] = [
    { label: '全部', value: 'all', direction: undefined },
    { label: '收入', value: 'income', direction: 1 },
    { label: '支出', value: 'expense', direction: 2 }
  ]

  const wallet = ref<Wallet | null>(null)
  const flows = ref<AccountFlow[]>([])
  const loading = ref<boolean>(false)
  const cursor = ref<string | null>(null)
  const hasMore = ref<boolean>(true)
  const activeTab = ref<number>(0)

  const balanceText = computed<string>(() => formatAmount(wallet.value?.balance, ''))
  const frozenText = computed<string>(() => formatAmount(wallet.value?.frozenAmount, '¥'))
  const incomeText = computed<string>(() => formatAmount(wallet.value?.totalIncome, '¥'))
  const expenseText = computed<string>(() => formatAmount(wallet.value?.totalExpense, '¥'))

  onShow(() => {
    void loadWallet()
    void loadFlows(true)
  })

  onPullDownRefresh(() => {
    void Promise.all([loadWallet(), loadFlows(true)]).finally(() => uni.stopPullDownRefresh())
  })

  async function loadWallet() {
    try {
      wallet.value = await getWallet()
    } catch (e) {
      logger.warn('wallet.get.fail', { e: String(e) })
    }
  }

  async function loadFlows(reset = false) {
    if (reset) {
      cursor.value = null
      hasMore.value = true
      flows.value = []
    }
    if (!hasMore.value || loading.value) return
    loading.value = true
    try {
      const r = await listWalletFlows({
        flowDirection: tabs[activeTab.value].direction,
        cursor: cursor.value ?? undefined,
        pageSize: 20
      })
      flows.value = reset ? r.list : [...flows.value, ...r.list]
      cursor.value = r.nextCursor ?? null
      hasMore.value = r.hasMore
    } catch (e) {
      logger.warn('wallet.flows.fail', { e: String(e) })
    } finally {
      loading.value = false
    }
  }

  function onTabChange(i: number) {
    if (i === activeTab.value) return
    activeTab.value = i
    void loadFlows(true)
  }

  function onLoadMore() {
    void loadFlows(false)
  }

  function onCharge() {
    uni.showToast({ title: '充值功能 V2 上线，敬请期待', icon: 'none' })
  }

  function bizTypeText(t: number): string {
    const map: Record<number, string> = {
      1: '消费扣款',
      2: '订单退款',
      3: '账户充值',
      4: '邀请奖励',
      5: '红包奖励',
      6: '佣金结算',
      7: '提现',
      8: '系统调账'
    }
    return map[t] ?? `业务 #${t}`
  }
</script>

<style lang="scss" scoped>
  .wallet {
    display: flex;
    flex-direction: column;
    height: 100vh;

    &__hero {
      padding: 48rpx 32rpx;
      color: $color-text-inverse;
      background: linear-gradient(135deg, #ff6a1a 0%, #ff8e53 100%);
    }

    &__hero-label {
      display: block;
      font-size: $font-size-sm;
      color: rgba(255, 255, 255, 0.85);
    }

    &__hero-balance {
      display: block;
      margin-top: 16rpx;
      font-size: 64rpx;
      font-weight: $font-weight-bold;
    }

    &__hero-meta {
      display: flex;
      padding: 24rpx 16rpx;
      margin-top: 32rpx;
      background: rgba(255, 255, 255, 0.15);
      border-radius: $radius-md;
    }

    &__hero-meta-item {
      flex: 1;
      text-align: center;
    }

    &__hero-meta-label {
      display: block;
      font-size: $font-size-xs;
      color: rgba(255, 255, 255, 0.85);
    }

    &__hero-meta-val {
      display: block;
      margin-top: 8rpx;
      font-size: $font-size-base;
      font-weight: $font-weight-medium;
    }

    &__hero-meta-divider {
      width: 1rpx;
      background: rgba(255, 255, 255, 0.3);
    }

    &__actions {
      display: flex;
      gap: 16rpx;
      margin-top: 32rpx;
    }

    &__charge {
      flex: 1;
      height: 72rpx;
      font-size: $font-size-base;
      line-height: 72rpx;
      color: $color-primary;
      background: $color-bg-white;
      border: none;
      border-radius: $radius-lg;
    }

    &__tabs {
      display: flex;
      background: $color-bg-white;
      border-bottom: 1rpx solid $color-divider;
    }

    &__tab {
      flex: 1;
      padding: 24rpx 0;
      font-size: $font-size-base;
      color: $color-text-regular;
      text-align: center;

      &--active {
        font-weight: $font-weight-medium;
        color: $color-primary;
        border-bottom: 4rpx solid $color-primary;
      }
    }

    &__scroll {
      flex: 1;
      padding: 16rpx;
    }

    &__flow {
      padding: 24rpx;
      margin-bottom: 16rpx;
      background: $color-bg-white;
      border-radius: $radius-md;
    }

    &__flow-main {
      @include flex-between;
    }

    &__flow-name {
      font-size: $font-size-base;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
    }

    &__flow-amount {
      font-size: $font-size-md;
      font-weight: $font-weight-bold;

      &--income {
        color: $color-success;
      }

      &--expense {
        color: $color-danger;
      }
    }

    &__flow-meta {
      @include flex-between;

      margin-top: 12rpx;
    }

    &__flow-remark {
      flex: 1;
      overflow: hidden;
      font-size: $font-size-sm;
      color: $color-text-secondary;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    &__flow-time {
      flex-shrink: 0;
      margin-left: 16rpx;
      font-size: $font-size-xs;
      color: $color-text-secondary;
    }

    &__more {
      padding: 32rpx 0;
      font-size: $font-size-sm;
      color: $color-text-secondary;
      text-align: center;
    }
  }
</style>
