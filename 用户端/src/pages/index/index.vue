<template>
  <view class="page page-home">
    <view class="home__navbar" :style="{ paddingTop: statusBarHeight + 'px' }">
      <view class="home__navbar-bar">
        <view class="home__nav-left" @tap="goCityPicker">
          <text class="home__nav-city u-line-1">{{ cityName }}</text>
          <text class="home__nav-arrow">▾</text>
        </view>
        <view class="home__search-box" @tap="goSearch">
          <text class="home__search-icon">🔍</text>
          <text class="home__search-placeholder u-line-1">{{ searchPlaceholder }}</text>
        </view>
        <view class="home__nav-right" @tap="onScan">
          <text class="home__nav-scan">⊞</text>
        </view>
      </view>
    </view>

    <scroll-view
      scroll-y
      class="home__scroll"
      :style="{ paddingTop: navbarTotalHeight + 'px' }"
      @scrolltolower="onScrollToLower"
    >
      <view v-if="banners.length > 0" class="home__banner">
        <u-swiper
          :list="bannerImages"
          :autoplay="true"
          :interval="3000"
          :indicator="true"
          indicator-mode="line"
          indicator-active-color="#ff6a1a"
          height="280rpx"
          radius="16rpx"
          @click="onBannerClick"
        />
      </view>

      <view class="home__quick">
        <view
          v-for="entry in displayedQuickEntries"
          :key="entry.code"
          class="home__quick-item"
          @tap="onQuickClick(entry)"
        >
          <view class="home__quick-icon-wrap">
            <text v-if="!entry.icon || entry.icon.length <= 2" class="home__quick-icon-emoji">
              {{ entry.icon || '⚡' }}
            </text>
            <image v-else class="home__quick-icon-img" :src="entry.icon" mode="aspectFit" />
            <view v-if="entry.badge" class="home__quick-badge">
              <text class="home__quick-badge-text">{{ entry.badge }}</text>
            </view>
          </view>
          <text class="home__quick-name">{{ entry.name }}</text>
        </view>
      </view>

      <view v-if="noticeText" class="home__notice">
        <u-notice-bar
          :text="noticeText"
          mode="link"
          color="#ff6a1a"
          bg-color="#fff4ee"
          :speed="60"
          @click="onNoticeClick"
        />
      </view>

      <view class="home__rec">
        <view class="home__rec-tabs">
          <u-tabs
            :list="tabs"
            :current="activeTabIdx"
            line-color="#ff6a1a"
            :line-width="40"
            :scrollable="false"
            :active-style="{ color: '#ff6a1a', fontWeight: 500 }"
            :inactive-style="{ color: '#666' }"
            @click="onTabClick"
          />
        </view>

        <BizLoading v-if="shopLoading && shops.length === 0" text="加载店铺中..." />
        <BizError
          v-else-if="shopError && shops.length === 0"
          title="店铺加载失败"
          desc="请检查网络后重试"
          @retry="reloadShops"
        />
        <BizEmpty
          v-else-if="!shopLoading && shops.length === 0"
          text="附近暂无店铺"
          action-text="重新加载"
          @action="reloadShops"
        />
        <ShopList
          v-else
          :shops="shops"
          :loading="shopLoading"
          :has-more="hasMore"
          @load-more="loadMoreShops"
          @click-shop="onShopClick"
        />
      </view>
    </scroll-view>

    <BizDialog
      v-model:visible="locationDialogVisible"
      title="未获得定位授权"
      content="未授权位置后，附近店铺与配送范围可能不准；可手动选择城市继续浏览。"
      confirm-text="选择城市"
      cancel-text="稍后再说"
      @confirm="goCityPicker"
    />

    <Guide
      v-model:visible="guideVisible"
      :steps="guideSteps"
      @finish="onGuideFinish"
      @skip="onGuideFinish"
    />
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages/index/index.vue
   * @stage P5/T5.11~T5.13 (Sprint 2)
   * @desc 用户端首页（PRD §3.1.1 / DESIGN §三）：
   *   1. 自定义导航栏（定位 / 搜索 / 扫码）
   *   2. Banner 轮播（getBanners）
   *   3. 4 大快捷入口（getQuickEntries，缺省硬编码）
   *   4. 公告跑马灯（getNotices）
   *   5. 推荐 Tab（精选/附近/最新/折扣 → sort=sales/distance/latest/price）
   *   6. 店铺列表（listShops + 上拉加载 + 下拉刷新）
   *   7. 启动 autoLocate；首次拒绝弹 BizDialog 引导手选城市
   *   8. 首次进入展示 Guide
   * @author 单 Agent V2.0
   */
  import { ref, computed, onMounted } from 'vue'
  import { onLoad, onShow, onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app'
  import BizLoading from '@/components/biz/BizLoading.vue'
  import BizEmpty from '@/components/biz/BizEmpty.vue'
  import BizError from '@/components/biz/BizError.vue'
  import BizDialog from '@/components/biz/BizDialog.vue'
  import Guide, { type GuideStep } from '@/components/biz/Guide.vue'
  import ShopList from '@/components/biz/ShopList.vue'
  import {
    getBanners,
    getNotices,
    getQuickEntries,
    listShops,
    type ShopListParams
  } from '@/api/shop'
  import type { Banner, Notice, QuickEntry, Shop, PageResult, KeysetPageResult } from '@/types/biz'
  import { useLocationStore } from '@/store/location'
  import { useAppStore } from '@/store/app'
  import { autoLocate } from '@/utils/location'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /* ========== 常量 / 默认值 ========== */
  /** 内置快捷入口（接口缺省时使用） */
  const FALLBACK_QUICK: QuickEntry[] = [
    { code: 'takeout', name: '外卖', icon: '🍱', url: '/pages/takeout/index' },
    { code: 'errand', name: '跑腿', icon: '🛵', url: '/pages/errand/index' },
    { code: 'mart', name: '超市', icon: '🛒', url: '' },
    { code: 'medicine', name: '药品', icon: '💊', url: '' }
  ]

  /** 推荐 Tab 与排序映射 */
  const TAB_SORT_MAP: Array<{ name: string; sort: NonNullable<ShopListParams['sort']> }> = [
    { name: '精选', sort: 'sales' },
    { name: '附近', sort: 'distance' },
    { name: '最新', sort: 'score' },
    { name: '折扣', sort: 'price' }
  ]

  const PAGE_SIZE = 20
  const SEARCH_PLACEHOLDER_DEFAULT = '搜索店铺 / 商品 / 跑腿'

  /* ========== Store / 系统信息 ========== */
  const locationStore = useLocationStore()
  const appStore = useAppStore()
  const statusBarHeight = ref<number>(20)
  const navbarTotalHeight = ref<number>(88)

  /* ========== 顶部 ========== */
  const cityName = computed<string>(() => locationStore.city?.cityName ?? '定位中')
  const searchPlaceholder = ref<string>(SEARCH_PLACEHOLDER_DEFAULT)

  /* ========== 数据 state ========== */
  const banners = ref<Banner[]>([])
  const notices = ref<Notice[]>([])
  const quickEntries = ref<QuickEntry[]>([])
  const shops = ref<Shop[]>([])
  const tabs = ref<Array<{ name: string }>>(TAB_SORT_MAP.map((t) => ({ name: t.name })))
  const activeTabIdx = ref<number>(0)
  const page = ref<number>(1)
  const hasMore = ref<boolean>(true)
  const shopLoading = ref<boolean>(false)
  const shopError = ref<boolean>(false)

  /* ========== 计算属性 ========== */
  const bannerImages = computed<string[]>(() => banners.value.map((b) => b.imageUrl))
  const displayedQuickEntries = computed<QuickEntry[]>(() =>
    quickEntries.value.length > 0 ? quickEntries.value.slice(0, 4) : FALLBACK_QUICK
  )
  const noticeText = computed<string>(() => {
    if (notices.value.length === 0) return ''
    return notices.value
      .slice(0, 5)
      .map((n) => n.title)
      .join('  |  ')
  })

  /* ========== 弹窗 / 引导 ========== */
  const locationDialogVisible = ref<boolean>(false)
  const guideVisible = ref<boolean>(false)
  const guideSteps: GuideStep[] = [
    { title: '欢迎来到 O2O 同城', desc: '点击顶部城市可切换；点击搜索可查找店铺/商品。' },
    { title: '快捷入口', desc: '外卖、跑腿、超市、药品都在这里，点击即可进入对应频道。' },
    { title: '推荐店铺', desc: '在 Tab 间切换可按精选 / 附近 / 最新 / 折扣排序。' }
  ]

  /* ========== 生命周期 ========== */
  onLoad(() => {
    track(TRACK.VIEW_HOME)
    initSysInfo()
  })

  onShow(() => {
    track(TRACK.VIEW_HOME)
    if (!appStore.hasShownGuide('home_first')) {
      guideVisible.value = true
    }
  })

  onMounted(async () => {
    await ensureCity()
    await loadAll()
  })

  onPullDownRefresh(async () => {
    try {
      await loadAll(true)
    } finally {
      uni.stopPullDownRefresh()
    }
  })

  onReachBottom(() => {
    void loadMoreShops()
  })

  /**
   * 读取系统信息以撑出自定义导航栏
   */
  function initSysInfo(): void {
    try {
      const info = uni.getSystemInfoSync()
      statusBarHeight.value = info.statusBarHeight ?? 20
      navbarTotalHeight.value = (info.statusBarHeight ?? 20) + 44
    } catch (e) {
      logger.warn('home.initSysInfo.fail', { e: String(e) })
    }
  }

  /**
   * 启动定位（若 store 中已有城市则跳过）
   */
  async function ensureCity(): Promise<void> {
    if (locationStore.city) return
    try {
      const r = await autoLocate()
      if (!r.cityCode) {
        locationDialogVisible.value = true
      }
    } catch (e) {
      logger.warn('home.autoLocate.fail', { e: String(e) })
      locationDialogVisible.value = true
    }
  }

  /**
   * 加载所有运营位 + 店铺列表
   * @param resetShops 是否重置店铺列表（下拉刷新时为 true）
   */
  async function loadAll(resetShops = false): Promise<void> {
    const cityCode = locationStore.city?.cityCode
    await Promise.allSettled([
      loadBanners(cityCode),
      loadNotices(cityCode),
      loadQuickEntries(cityCode)
    ])
    if (resetShops) {
      shops.value = []
      page.value = 1
      hasMore.value = true
    }
    await reloadShops()
  }

  /**
   * 加载 Banner
   * @param cityCode 城市编码
   */
  async function loadBanners(cityCode?: string): Promise<void> {
    try {
      banners.value = await getBanners({ position: 'HOME_TOP', cityCode })
    } catch (e) {
      logger.warn('home.banners.fail', { e: String(e) })
      banners.value = []
    }
  }

  /**
   * 加载公告
   * @param cityCode 城市编码
   */
  async function loadNotices(cityCode?: string): Promise<void> {
    try {
      notices.value = await getNotices({ cityCode, top: 5 })
    } catch (e) {
      logger.warn('home.notices.fail', { e: String(e) })
      notices.value = []
    }
  }

  /**
   * 加载快捷入口
   * @param cityCode 城市编码
   */
  async function loadQuickEntries(cityCode?: string): Promise<void> {
    try {
      const list = await getQuickEntries({ cityCode })
      quickEntries.value = Array.isArray(list) ? list : []
    } catch (e) {
      logger.warn('home.quickEntries.fail', { e: String(e) })
      quickEntries.value = []
    }
  }

  /**
   * 重新加载店铺列表（首页 / 切 Tab / 重试）
   */
  async function reloadShops(): Promise<void> {
    page.value = 1
    hasMore.value = true
    shops.value = []
    await fetchShops()
  }

  /**
   * 上拉加载更多
   */
  async function loadMoreShops(): Promise<void> {
    if (!hasMore.value || shopLoading.value) return
    page.value += 1
    await fetchShops()
  }

  /**
   * 拉取店铺列表（按当前 tab 排序 + cityCode + 坐标）
   */
  async function fetchShops(): Promise<void> {
    if (shopLoading.value) return
    shopLoading.value = true
    shopError.value = false
    try {
      const sort = TAB_SORT_MAP[activeTabIdx.value]?.sort ?? 'sales'
      const params: ShopListParams = {
        cityCode: locationStore.city?.cityCode,
        lng: locationStore.coord?.lng,
        lat: locationStore.coord?.lat,
        sort,
        page: page.value,
        pageSize: PAGE_SIZE
      }
      const result = await listShops(params)
      const list = extractShopList(result)
      shops.value = page.value === 1 ? list : [...shops.value, ...list]
      hasMore.value = computeHasMore(result, list.length)
    } catch (e) {
      shopError.value = true
      logger.warn('home.shops.fail', { e: String(e) })
    } finally {
      shopLoading.value = false
    }
  }

  /**
   * 兼容 PageResult / KeysetPageResult 两种返回结构
   * @param r 后端返回
   */
  function extractShopList(r: PageResult<Shop> | KeysetPageResult<Shop>): Shop[] {
    if (r && Array.isArray((r as PageResult<Shop>).list)) {
      return (r as PageResult<Shop>).list
    }
    return []
  }

  /**
   * 判断是否还有下一页
   */
  function computeHasMore(r: PageResult<Shop> | KeysetPageResult<Shop>, pageLen: number): boolean {
    if (r && 'hasMore' in r && typeof r.hasMore === 'boolean') {
      return r.hasMore
    }
    if (r && 'meta' in r && r.meta) {
      return page.value < r.meta.totalPages
    }
    return pageLen >= PAGE_SIZE
  }

  /* ========== 用户交互 ========== */
  /**
   * 顶部 scroll-view 触底
   */
  function onScrollToLower(): void {
    void loadMoreShops()
  }

  /**
   * Tab 切换
   * @param item 选中项 { name }
   */
  function onTabClick(item: { name: string }): void {
    const idx = tabs.value.findIndex((t) => t.name === item.name)
    if (idx < 0 || idx === activeTabIdx.value) return
    activeTabIdx.value = idx
    void reloadShops()
  }

  /**
   * Banner 点击
   * @param idx 当前索引
   */
  function onBannerClick(idx: number): void {
    const b = banners.value[idx]
    if (!b) return
    track(TRACK.CLICK_BANNER, { id: b.id, position: b.position })
    if (!b.link) return
    if (b.linkType === 1) {
      uni.navigateTo({ url: `/pages-user/about?h5=${encodeURIComponent(b.link)}` })
    } else if (b.linkType === 2) {
      uni.navigateTo({ url: b.link, fail: () => fallbackTab(b.link as string) })
    } else if (b.linkType === 3) {
      uni.navigateToMiniProgram?.({ appId: b.link, fail: () => undefined })
    }
  }

  /**
   * 当 navigateTo 失败时尝试 switchTab（处理 banner 链接到 tabBar 的情形）
   */
  function fallbackTab(url: string): void {
    uni.switchTab({ url, fail: () => undefined })
  }

  /**
   * 快捷入口点击
   * @param entry QuickEntry 数据
   */
  function onQuickClick(entry: QuickEntry): void {
    track(TRACK.CLICK_BANNER, { code: entry.code, name: entry.name, slot: 'quick' })
    if (!entry.url) {
      uni.showToast({ title: `${entry.name}暂未开放`, icon: 'none' })
      return
    }
    if (entry.code === 'takeout') {
      uni.switchTab({ url: '/pages/index/index' })
      return
    }
    if (entry.url.startsWith('/pages/')) {
      const tabPaths = ['/pages/index/index', '/pages/order/index', '/pages/user/index']
      if (tabPaths.some((p) => entry.url.startsWith(p))) {
        uni.switchTab({ url: entry.url, fail: () => uni.navigateTo({ url: entry.url }) })
      } else {
        uni.navigateTo({ url: entry.url, fail: () => fallbackTab(entry.url) })
      }
      return
    }
    uni.navigateTo({ url: entry.url, fail: () => fallbackTab(entry.url) })
  }

  /**
   * 公告点击：跳消息中心或第一条详情
   */
  function onNoticeClick(): void {
    if (notices.value.length === 0) return
    uni.navigateTo({ url: '/pages-msg/index' })
  }

  /**
   * 店铺点击 → 跳店铺详情
   * @param id 店铺 id
   */
  function onShopClick(id: string): void {
    uni.navigateTo({
      url: `/pages-takeout/shop-detail?shopId=${encodeURIComponent(id)}`
    })
  }

  /**
   * 顶部「定位」点击 → 城市选择
   */
  function goCityPicker(): void {
    uni.navigateTo({ url: '/pages/index/city-picker' })
  }

  /**
   * 顶部「搜索框」点击 → 搜索页
   */
  function goSearch(): void {
    track(TRACK.CLICK_SEARCH)
    uni.navigateTo({ url: '/pages/search/index' })
  }

  /**
   * 顶部「扫码」点击
   */
  function onScan(): void {
    uni.scanCode({
      success: (res) => {
        logger.info('home.scan.ok', { type: res.scanType })
        uni.showToast({ title: `扫描到：${res.result}`, icon: 'none' })
      },
      fail: () => undefined
    })
  }

  /**
   * 引导完成（含跳过）
   */
  function onGuideFinish(): void {
    appStore.markGuideShown('home_first')
  }
</script>

<style lang="scss" scoped>
  .page-home {
    min-height: 100vh;
    background: $color-bg-page;
  }

  .home {
    &__navbar {
      position: fixed;
      top: 0;
      right: 0;
      left: 0;
      z-index: $z-index-fixed;
      background: $color-bg-white;
      box-shadow: $shadow-sm;
    }

    &__navbar-bar {
      display: flex;
      gap: 16rpx;
      align-items: center;
      height: 88rpx;
      padding: 0 24rpx;
    }

    &__nav-left {
      display: flex;
      flex-shrink: 0;
      gap: 4rpx;
      align-items: center;
      max-width: 180rpx;
    }

    &__nav-city {
      max-width: 140rpx;
      font-size: $font-size-base;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
    }

    &__nav-arrow {
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__search-box {
      display: flex;
      flex: 1;
      gap: 8rpx;
      align-items: center;
      height: 60rpx;
      padding: 0 20rpx;
      background: $color-bg-page;
      border-radius: 30rpx;
    }

    &__search-icon {
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__search-placeholder {
      flex: 1;
      font-size: $font-size-sm;
      color: $color-text-placeholder;
    }

    &__nav-right {
      @include flex-center;

      flex-shrink: 0;
      width: 60rpx;
      height: 60rpx;
    }

    &__nav-scan {
      font-size: 36rpx;
      color: $color-text-primary;
    }

    &__scroll {
      box-sizing: border-box;
      height: 100vh;
    }

    &__banner {
      padding: 24rpx;
    }

    &__quick {
      display: flex;
      flex-wrap: wrap;
      padding: 24rpx 0 16rpx;
      margin: 0 24rpx;
      background: $color-bg-white;
      border-radius: $radius-md;
    }

    &__quick-item {
      @include flex-center;

      flex: 0 0 25%;
      flex-direction: column;
      gap: 12rpx;
      padding: 16rpx 0;
    }

    &__quick-icon-wrap {
      @include flex-center;

      position: relative;
      width: 96rpx;
      height: 96rpx;
      background: rgba(255, 106, 26, 0.08);
      border-radius: $radius-circle;
    }

    &__quick-icon-emoji {
      font-size: 48rpx;
    }

    &__quick-icon-img {
      width: 56rpx;
      height: 56rpx;
    }

    &__quick-badge {
      @include flex-center;

      position: absolute;
      top: -4rpx;
      right: -4rpx;
      min-width: 32rpx;
      height: 32rpx;
      padding: 0 8rpx;
      background: $color-danger;
      border-radius: 16rpx;
    }

    &__quick-badge-text {
      font-size: $font-size-xs;
      color: $color-text-inverse;
    }

    &__quick-name {
      font-size: $font-size-sm;
      color: $color-text-primary;
    }

    &__notice {
      margin: 16rpx 24rpx;
      overflow: hidden;
      border-radius: $radius-md;
    }

    &__rec {
      margin-top: 16rpx;
    }

    &__rec-tabs {
      position: sticky;
      top: 0;
      z-index: $z-index-sticky;
      padding: 0 24rpx;
      background: $color-bg-white;
    }
  }
</style>
