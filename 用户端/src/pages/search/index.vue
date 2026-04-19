<template>
  <view class="page page-white search">
    <view class="search__bar">
      <view class="search__input-wrap">
        <text class="search__icon">🔍</text>
        <input
          v-model="kw"
          class="search__input"
          :placeholder="placeholder"
          confirm-type="search"
          :focus="autoFocus"
          @confirm="onSubmit"
          @input="onInput"
        />
        <view v-if="kw" class="search__clear" @tap="onClear">
          <text class="search__clear-icon">✕</text>
        </view>
      </view>
      <view class="search__cancel" @tap="onCancel">
        <text>取消</text>
      </view>
    </view>

    <view v-if="suggestions.length > 0" class="search__suggest">
      <view
        v-for="s in suggestions"
        :key="s"
        class="search__suggest-item"
        @tap="onPickSuggestion(s)"
      >
        <text class="search__suggest-icon">🔎</text>
        <text class="search__suggest-text u-line-1">{{ s }}</text>
      </view>
    </view>

    <view v-else class="search__panels">
      <view v-if="history.length > 0" class="search__panel">
        <view class="search__panel-header">
          <text class="search__panel-title">搜索历史</text>
          <view class="search__panel-action" @tap="onClearHistory">
            <text class="search__panel-action-text">清空</text>
          </view>
        </view>
        <view class="search__tags">
          <view v-for="h in history" :key="h" class="search__tag" @tap="onPickSuggestion(h)">
            <text class="search__tag-text">{{ h }}</text>
          </view>
        </view>
      </view>

      <view v-if="hot.length > 0" class="search__panel">
        <view class="search__panel-header">
          <text class="search__panel-title">热门搜索</text>
        </view>
        <view class="search__tags">
          <view
            v-for="(h, i) in hot"
            :key="h"
            class="search__tag search__tag--hot"
            :class="{ 'search__tag--top': i < 3 }"
            @tap="onPickSuggestion(h)"
          >
            <text class="search__tag-text">{{ h }}</text>
          </view>
        </view>
      </view>

      <BizEmpty
        v-if="!loading && history.length === 0 && hot.length === 0"
        text="试着输入关键词搜索吧"
      />
    </view>

    <BizLoading v-if="loading && history.length === 0 && hot.length === 0" />
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages/search/index.vue
   * @stage P5/T5.14 (Sprint 2)
   * @desc 搜索入口页：输入框 + 取消 + 历史 + 热搜 + debounce 建议；
   *   提交 → /pages/search/result?q=xxx&type=shop
   * @author 单 Agent V2.0
   */
  import { ref, onUnmounted } from 'vue'
  import { onLoad, onShow } from '@dcloudio/uni-app'
  import BizLoading from '@/components/biz/BizLoading.vue'
  import BizEmpty from '@/components/biz/BizEmpty.vue'
  import { getHotSearches, listShops } from '@/api/shop'
  import { useLocationStore } from '@/store/location'
  import { getStorage, setStorage, removeStorage, STORAGE_KEYS } from '@/utils/storage'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /** 搜索建议结果（接口存在则用接口；当前以 listShops.q 取店铺名做近似建议） */
  const SUGGEST_DEBOUNCE_MS = 200
  const HISTORY_MAX = 10

  const locationStore = useLocationStore()

  const kw = ref<string>('')
  const placeholder = ref<string>('搜索店铺 / 商品 / 跑腿')
  const autoFocus = ref<boolean>(true)
  const loading = ref<boolean>(false)
  const history = ref<string[]>([])
  const hot = ref<string[]>([])
  const suggestions = ref<string[]>([])

  /** debounce 计时器 */
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  onLoad(() => {
    track(TRACK.VIEW_HOME, { page: 'search' })
    history.value = getStorage<string[]>(STORAGE_KEYS.SEARCH_HISTORY) ?? []
  })

  onShow(() => {
    void loadHot()
  })

  onUnmounted(() => {
    if (debounceTimer) clearTimeout(debounceTimer)
  })

  /**
   * 拉取热门搜索词
   */
  async function loadHot(): Promise<void> {
    if (loading.value) return
    loading.value = true
    try {
      const r = await getHotSearches({ cityCode: locationStore.city?.cityCode })
      hot.value = Array.isArray(r) ? r.slice(0, 12) : []
    } catch (e) {
      logger.warn('search.hot.fail', { e: String(e) })
      hot.value = []
    } finally {
      loading.value = false
    }
  }

  /**
   * 输入变更：debounce 后请求建议
   */
  function onInput(): void {
    if (debounceTimer) clearTimeout(debounceTimer)
    if (!kw.value || kw.value.trim() === '') {
      suggestions.value = []
      return
    }
    const current = kw.value.trim()
    debounceTimer = setTimeout(() => {
      void fetchSuggestion(current)
    }, SUGGEST_DEBOUNCE_MS)
  }

  /**
   * 拉取建议（以店铺名近似匹配作为兜底）
   * @param q 关键词
   */
  async function fetchSuggestion(q: string): Promise<void> {
    if (!q || q !== kw.value.trim()) return
    try {
      const r = await listShops({
        q,
        cityCode: locationStore.city?.cityCode,
        lng: locationStore.coord?.lng,
        lat: locationStore.coord?.lat,
        page: 1,
        pageSize: 5
      })
      const list = 'list' in r && Array.isArray(r.list) ? r.list : []
      const names = list.map((s) => s.name).filter(Boolean)
      suggestions.value = Array.from(new Set(names)).slice(0, 8)
    } catch (e) {
      logger.warn('search.suggest.fail', { e: String(e) })
      suggestions.value = []
    }
  }

  /**
   * 提交搜索：写历史，跳结果页
   */
  function onSubmit(): void {
    const q = kw.value.trim()
    if (!q) {
      uni.showToast({ title: '请输入关键词', icon: 'none' })
      return
    }
    pushHistory(q)
    track(TRACK.SEARCH_SUBMIT, { q })
    uni.navigateTo({
      url: `/pages/search/result?q=${encodeURIComponent(q)}&type=shop`
    })
  }

  /**
   * 命中建议 / 历史 / 热搜：直接跳结果
   * @param q 选中关键词
   */
  function onPickSuggestion(q: string): void {
    kw.value = q
    onSubmit()
  }

  /**
   * 写本地历史（去重 + 上限）
   * @param q 关键词
   */
  function pushHistory(q: string): void {
    const next = [q, ...history.value.filter((h) => h !== q)].slice(0, HISTORY_MAX)
    history.value = next
    setStorage(STORAGE_KEYS.SEARCH_HISTORY, next)
  }

  /**
   * 清空搜索历史
   */
  function onClearHistory(): void {
    history.value = []
    removeStorage(STORAGE_KEYS.SEARCH_HISTORY)
  }

  /**
   * 清空输入框
   */
  function onClear(): void {
    kw.value = ''
    suggestions.value = []
  }

  /**
   * 取消（返回上一页）
   */
  function onCancel(): void {
    uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/index/index' }) })
  }
</script>

<style lang="scss" scoped>
  .search {
    min-height: 100vh;
    background: $color-bg-white;

    &__bar {
      display: flex;
      gap: 16rpx;
      align-items: center;
      padding: 16rpx 24rpx;
      background: $color-bg-white;
      border-bottom: 1rpx solid $color-divider;
    }

    &__input-wrap {
      display: flex;
      flex: 1;
      gap: 8rpx;
      align-items: center;
      height: 64rpx;
      padding: 0 20rpx;
      background: $color-bg-page;
      border-radius: 32rpx;
    }

    &__icon {
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__input {
      flex: 1;
      height: 64rpx;
      font-size: $font-size-base;
      color: $color-text-primary;
    }

    &__clear {
      @include flex-center;

      width: 40rpx;
      height: 40rpx;
      background: $color-text-placeholder;
      border-radius: $radius-circle;
    }

    &__clear-icon {
      font-size: 20rpx;
      color: $color-text-inverse;
    }

    &__cancel {
      flex-shrink: 0;
      padding: 0 8rpx;
      font-size: $font-size-base;
      color: $color-text-regular;
    }

    &__suggest {
      padding: 0 24rpx;
    }

    &__suggest-item {
      display: flex;
      gap: 16rpx;
      align-items: center;
      padding: 24rpx 0;
      border-bottom: 1rpx solid $color-divider;
    }

    &__suggest-icon {
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__suggest-text {
      flex: 1;
      font-size: $font-size-base;
      color: $color-text-primary;
    }

    &__panels {
      padding: 16rpx 24rpx;
    }

    &__panel {
      margin-top: 32rpx;
    }

    &__panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16rpx;
    }

    &__panel-title {
      font-size: $font-size-base;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
    }

    &__panel-action {
      padding: 8rpx 16rpx;
    }

    &__panel-action-text {
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__tags {
      display: flex;
      flex-wrap: wrap;
      gap: 16rpx;
    }

    &__tag {
      padding: 12rpx 24rpx;
      background: $color-bg-page;
      border-radius: 32rpx;

      &--hot {
        background: rgba(255, 106, 26, 0.08);
      }

      &--top {
        background: rgba(245, 108, 108, 0.1);
      }
    }

    &__tag-text {
      font-size: $font-size-sm;
      color: $color-text-regular;

      .search__tag--hot & {
        color: $color-primary;
      }

      .search__tag--top & {
        font-weight: $font-weight-medium;
        color: $color-danger;
      }
    }
  }
</style>
