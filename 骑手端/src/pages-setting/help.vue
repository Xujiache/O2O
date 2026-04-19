<template>
  <view class="page">
    <BizEmpty v-if="items.length === 0" title="暂无帮助内容" scene="data" />
    <view v-for="it in items" :key="it.id" class="qa">
      <view class="q" @click="onToggle(it.id)">
        <text class="q__icon">❓</text>
        <text class="q__text">{{ it.question }}</text>
        <text class="q__arrow">{{ openIds.has(it.id) ? '−' : '+' }}</text>
      </view>
      <view v-if="openIds.has(it.id)" class="a">{{ it.answer }}</view>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { ref, reactive } from 'vue'
  import { onShow } from '@dcloudio/uni-app'
  import { fetchHelpItems, type HelpItem } from '@/api/setting'
  import { logger } from '@/utils/logger'

  /**
   * 帮助中心 FAQ
   * @author 单 Agent V2.0 (P7 骑手端 / T7.44)
   */
  const items = ref<HelpItem[]>([])
  const openIds = reactive(new Set<string>())

  onShow(async () => {
    try {
      items.value = await fetchHelpItems()
    } catch (e) {
      logger.warn('help.fail', { e: String(e) })
      items.value = [
        {
          id: '1',
          question: '如何上线接单？',
          answer: '工作台点"开始接单"，校验资质 + 保证金后启动定位上报。',
          category: 'basic'
        },
        {
          id: '2',
          question: '取件码错误怎么办？',
          answer: '取件码可手动输入或扫码；连错 3 次冻结 30s 防爆破。',
          category: 'order'
        },
        {
          id: '3',
          question: '提现到账时间？',
          answer: 'T+1 工作日，周末顺延。',
          category: 'wallet'
        },
        {
          id: '4',
          question: '紧急情况如何求助？',
          answer: '工作台右下角红色按钮长按 3 秒，平台同步呼叫客服 + 紧急联系人。',
          category: 'emergency'
        }
      ]
    }
  })

  function onToggle(id: string) {
    if (openIds.has(id)) openIds.delete(id)
    else openIds.add(id)
  }
</script>

<style lang="scss" scoped>
  .page {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .qa {
    margin-bottom: 12rpx;
    background: #fff;
    border-radius: 12rpx;
  }

  .q {
    display: flex;
    align-items: center;
    padding: 24rpx;
    font-size: 26rpx;
    font-weight: 500;

    &__icon {
      margin-right: 12rpx;
      font-size: 28rpx;
    }

    &__text {
      flex: 1;
    }

    &__arrow {
      font-size: 32rpx;
      color: $uni-color-primary;
    }
  }

  .a {
    padding: 0 24rpx 24rpx;
    font-size: 24rpx;
    line-height: 1.8;
    color: $uni-text-color-grey;
  }
</style>
