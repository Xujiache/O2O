<template>
  <view class="page rs">
    <view class="rs__card">
      <view class="rs__rating">
        <text class="rs__label">店铺评分</text>
        <view class="rs__stars">
          <view
            v-for="i in 5"
            :key="`shop_${i}`"
            class="rs__star"
            :class="{ 'rs__star--active': i <= shopRating }"
            @tap="shopRating = i as 1 | 2 | 3 | 4 | 5"
          >
            <text>★</text>
          </view>
          <text class="rs__rating-text">{{ ratingText(shopRating) }}</text>
        </view>
      </view>
      <view class="rs__rating">
        <text class="rs__label">商品评分</text>
        <view class="rs__stars">
          <view
            v-for="i in 5"
            :key="`prod_${i}`"
            class="rs__star"
            :class="{ 'rs__star--active': i <= productRating }"
            @tap="productRating = i as 1 | 2 | 3 | 4 | 5"
          >
            <text>★</text>
          </view>
          <text class="rs__rating-text">{{ ratingText(productRating) }}</text>
        </view>
      </view>
      <view class="rs__rating">
        <text class="rs__label">配送评分</text>
        <view class="rs__stars">
          <view
            v-for="i in 5"
            :key="`del_${i}`"
            class="rs__star"
            :class="{ 'rs__star--active': i <= deliveryRating }"
            @tap="deliveryRating = i as 1 | 2 | 3 | 4 | 5"
          >
            <text>★</text>
          </view>
          <text class="rs__rating-text">{{ ratingText(deliveryRating) }}</text>
        </view>
      </view>
    </view>

    <view class="rs__card">
      <text class="rs__label">说说本次体验</text>
      <textarea
        v-model="content"
        class="rs__textarea"
        placeholder="您的评价是商家进步的动力（可选）"
        maxlength="500"
        auto-height
      />

      <view class="rs__images">
        <view v-for="(img, i) in images" :key="`img_${i}`" class="rs__image" @tap="onPreview(i)">
          <image :src="img" mode="aspectFill" class="rs__image-thumb" />
          <view class="rs__image-del" @tap.stop="onRemoveImage(i)">
            <text>×</text>
          </view>
        </view>
        <view v-if="images.length < 9" class="rs__image rs__image--add" @tap="onChooseImage">
          <text>+</text>
        </view>
      </view>
    </view>

    <view class="rs__card">
      <text class="rs__label">评价标签（可多选）</text>
      <view class="rs__tags">
        <view
          v-for="t in tagOptions"
          :key="t"
          class="rs__tag"
          :class="{ 'rs__tag--active': selectedTags.includes(t) }"
          @tap="onToggleTag(t)"
        >
          <text>{{ t }}</text>
        </view>
      </view>
    </view>

    <view class="rs__bar">
      <view
        class="rs__bar-submit"
        :class="{ 'rs__bar-submit--disabled': !canSubmit }"
        @tap="onSubmit"
      >
        <text>{{ submitting ? '提交中...' : '提交评价' }}</text>
      </view>
    </view>

    <BizLoading v-if="uploading" fullscreen text="上传图片..." />
  </view>
</template>

<script setup lang="ts">
  /**
   * @file pages-order/review-submit.vue
   * @stage P5/T5.20 (Sprint 3)
   * @desc 评价提交：三星评分 + 文字 + 多图（最多 9 张）+ 标签
   * @author 单 Agent V2.0
   */
  import { ref, computed } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import BizLoading from '@/components/biz/BizLoading.vue'
  import { submitReview, getReviewTags } from '@/api/review'
  import { uploadImages } from '@/api/file'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 默认标签兜底（与后端 DEFAULT_REVIEW_TAGS 对齐；接口失败时使用）
   * W6.E.2：评价标签接口化后，硬编码降级为 fallback
   */
  const FALLBACK_TAGS: ReadonlyArray<string> = [
    '味道很赞',
    '分量足',
    '包装精美',
    '配送很快',
    '服务热情',
    '性价比高',
    '味道一般',
    '送达较慢'
  ]

  const orderNo = ref<string>('')
  const shopRating = ref<1 | 2 | 3 | 4 | 5>(5)
  const productRating = ref<1 | 2 | 3 | 4 | 5>(5)
  const deliveryRating = ref<1 | 2 | 3 | 4 | 5>(5)
  const content = ref<string>('')
  const images = ref<string[]>([])
  const selectedTags = ref<string[]>([])
  /** W6.E.2：标签后端配置化；初始化时取 /me/reviews/tags，失败用 FALLBACK_TAGS 兜底 */
  const tagOptions = ref<string[]>([...FALLBACK_TAGS])
  const submitting = ref<boolean>(false)
  const uploading = ref<boolean>(false)
  let lastSubmitAt = 0

  const canSubmit = computed<boolean>(() => {
    if (submitting.value || uploading.value) return false
    return Boolean(orderNo.value)
  })

  onLoad((options) => {
    const no = (options?.orderNo as string) ?? ''
    if (!no) {
      uni.showToast({ title: '订单参数缺失', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 600)
      return
    }
    orderNo.value = no
    void loadTags()
  })

  /**
   * 拉取评价标签（W6.E.2 真接入）
   * 失败时静默使用 FALLBACK_TAGS（不阻塞用户提交评价）
   */
  async function loadTags(): Promise<void> {
    try {
      const remote = await getReviewTags()
      if (Array.isArray(remote) && remote.length > 0) {
        tagOptions.value = remote.filter((t): t is string => typeof t === 'string' && Boolean(t))
        return
      }
      tagOptions.value = [...FALLBACK_TAGS]
    } catch (e) {
      logger.warn('review.tags.load.fail', { e: String(e) })
      tagOptions.value = [...FALLBACK_TAGS]
    }
  }

  function ratingText(r: 1 | 2 | 3 | 4 | 5): string {
    return ['', '很差', '较差', '一般', '满意', '非常满意'][r] ?? ''
  }

  function onToggleTag(t: string) {
    const idx = selectedTags.value.indexOf(t)
    if (idx >= 0) selectedTags.value.splice(idx, 1)
    else selectedTags.value.push(t)
  }

  function onChooseImage() {
    const left = 9 - images.value.length
    if (left <= 0) {
      uni.showToast({ title: '最多 9 张图片', icon: 'none' })
      return
    }
    uni.chooseImage({
      count: left,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const paths = res.tempFilePaths ?? []
        if (paths.length === 0) return
        uploading.value = true
        try {
          const results = await uploadImages(paths, 'proof', true)
          for (const r of results) {
            if (images.value.length < 9) images.value.push(r.url)
          }
        } catch (e) {
          uni.showToast({ title: '图片上传失败', icon: 'none' })
          logger.warn('review.image.upload.fail', { e: String(e) })
        } finally {
          uploading.value = false
        }
      }
    })
  }

  function onRemoveImage(i: number) {
    images.value.splice(i, 1)
  }

  function onPreview(i: number) {
    uni.previewImage({ urls: images.value, current: images.value[i] })
  }

  async function onSubmit() {
    if (!canSubmit.value) return
    const now = Date.now()
    if (now - lastSubmitAt < 500) return
    lastSubmitAt = now

    submitting.value = true
    try {
      const r = await submitReview({
        orderNo: orderNo.value,
        shopRating: shopRating.value,
        productRating: productRating.value,
        deliveryRating: deliveryRating.value,
        content: content.value,
        images: images.value,
        tags: selectedTags.value
      })
      track(TRACK.SUBMIT_REVIEW, {
        orderNo: orderNo.value,
        shopRating: shopRating.value,
        hasImage: images.value.length > 0 ? 1 : 0
      })
      uni.showToast({ title: '评价成功', icon: 'success' })
      setTimeout(() => {
        uni.redirectTo({ url: `/pages-order/detail?orderNo=${r.orderNo}` })
      }, 600)
    } catch (e) {
      logger.warn('review.submit.fail', { e: String(e) })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .rs {
    min-height: 100vh;
    padding: 16rpx 16rpx 200rpx;
    background: $color-bg-page;

    &__card {
      padding: 24rpx 32rpx;
      margin-bottom: 16rpx;
      background: $color-bg-white;
      border-radius: $radius-md;
    }

    &__label {
      display: block;
      margin-bottom: 16rpx;
      font-size: $font-size-base;
      font-weight: $font-weight-medium;
      color: $color-text-primary;
    }

    &__rating {
      padding: 16rpx 0;
      border-bottom: 1rpx solid $color-divider;

      &:last-child {
        border-bottom: none;
      }
    }

    &__stars {
      display: flex;
      gap: 16rpx;
      align-items: center;
    }

    &__star {
      font-size: 56rpx;
      color: $color-divider;

      &--active {
        color: $color-warning;
      }
    }

    &__rating-text {
      margin-left: 16rpx;
      font-size: $font-size-sm;
      color: $color-text-secondary;
    }

    &__textarea {
      width: 100%;
      min-height: 200rpx;
      padding: 16rpx;
      font-size: $font-size-base;
      color: $color-text-primary;
      background: $color-bg-page;
      border-radius: $radius-sm;
      box-sizing: border-box;
    }

    &__images {
      display: flex;
      flex-wrap: wrap;
      gap: 16rpx;
      margin-top: 24rpx;
    }

    &__image {
      position: relative;
      width: 160rpx;
      height: 160rpx;
      overflow: hidden;
      background: $color-bg-page;
      border-radius: $radius-sm;

      &--add {
        @include flex-center;

        font-size: 48rpx;
        color: $color-text-secondary;
        border: 2rpx dashed $color-border;
      }
    }

    &__image-thumb {
      width: 100%;
      height: 100%;
    }

    &__image-del {
      @include flex-center;

      position: absolute;
      top: 4rpx;
      right: 4rpx;
      width: 36rpx;
      height: 36rpx;
      font-size: 28rpx;
      color: $color-text-inverse;
      background: rgba(0, 0, 0, 0.5);
      border-radius: $radius-circle;
    }

    &__tags {
      display: flex;
      flex-wrap: wrap;
      gap: 16rpx;
    }

    &__tag {
      padding: 12rpx 24rpx;
      font-size: $font-size-sm;
      color: $color-text-regular;
      background: $color-bg-page;
      border: 2rpx solid transparent;
      border-radius: $radius-md;

      &--active {
        color: $color-primary;
        background: rgba(255, 106, 26, 0.08);
        border-color: $color-primary;
      }
    }

    &__bar {
      position: fixed;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: $z-index-fixed;
      padding: 16rpx 32rpx;
      background: $color-bg-white;
      border-top: 1rpx solid $color-divider;

      @include safe-area-bottom;
    }

    &__bar-submit {
      @include flex-center;

      width: 100%;
      height: 80rpx;
      font-size: $font-size-md;
      font-weight: $font-weight-medium;
      color: $color-text-inverse;
      background: $color-primary;
      border-radius: $radius-xl;

      &--disabled {
        background: $color-text-disabled;
      }
    }
  }
</style>
