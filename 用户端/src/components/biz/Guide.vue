<template>
  <view v-if="visible" class="guide">
    <view class="guide__mask" @tap="onSkip">
      <view class="guide__content" @tap.stop>
        <text class="guide__title">{{ steps[step].title }}</text>
        <text class="guide__desc">{{ steps[step].desc }}</text>
        <view class="guide__progress">
          <view
            v-for="(_, i) in steps"
            :key="i"
            class="guide__dot"
            :class="{ 'guide__dot--active': i === step }"
          />
        </view>
        <view class="guide__actions">
          <view class="guide__btn guide__btn--ghost" @tap="onSkip">
            <text>跳过</text>
          </view>
          <view class="guide__btn guide__btn--primary" @tap="onNext">
            <text>{{ step + 1 < steps.length ? '下一步' : '我知道了' }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
  /**
   * @file Guide.vue
   * @stage P5/T5.10 (Sprint 1)
   * @desc 新手引导覆盖层：首次进入关键功能时按 step 展示，本地标记已展示
   * @author 单 Agent V2.0
   */
  import { ref, watchEffect, defineProps, defineEmits, withDefaults } from 'vue'

  /** 单步引导 */
  export interface GuideStep {
    title: string
    desc: string
  }

  const props = withDefaults(
    defineProps<{
      visible: boolean
      steps: GuideStep[]
    }>(),
    {
      visible: false,
      steps: () => [] as GuideStep[]
    }
  )

  const emit = defineEmits<{
    (e: 'update:visible', v: boolean): void
    (e: 'finish'): void
    (e: 'skip'): void
  }>()

  const step = ref<number>(0)

  watchEffect(() => {
    if (props.visible) step.value = 0
  })

  function onNext() {
    if (step.value + 1 < props.steps.length) {
      step.value += 1
    } else {
      emit('finish')
      emit('update:visible', false)
    }
  }

  function onSkip() {
    emit('skip')
    emit('update:visible', false)
  }
</script>

<style lang="scss" scoped>
  .guide {
    position: fixed;
    inset: 0;
    z-index: $z-index-modal;

    &__mask {
      @include flex-center;

      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
    }

    &__content {
      width: 600rpx;
      padding: 48rpx 32rpx 32rpx;
      background: $color-bg-white;
      border-radius: $radius-lg;
    }

    &__title {
      display: block;
      font-size: $font-size-lg;
      font-weight: $font-weight-bold;
      color: $color-text-primary;
      text-align: center;
    }

    &__desc {
      display: block;
      margin-top: 16rpx;
      font-size: $font-size-base;
      line-height: 1.6;
      color: $color-text-regular;
      text-align: center;
    }

    &__progress {
      @include flex-center;

      gap: 12rpx;
      margin-top: 32rpx;
    }

    &__dot {
      width: 12rpx;
      height: 12rpx;
      background: $color-divider;
      border-radius: $radius-circle;

      &--active {
        background: $color-primary;
      }
    }

    &__actions {
      display: flex;
      gap: 16rpx;
      margin-top: 32rpx;
    }

    &__btn {
      @include flex-center;

      flex: 1;
      height: 80rpx;
      font-size: $font-size-base;
      border-radius: $radius-lg;

      &--ghost {
        color: $color-text-regular;
        background: $color-divider;
      }

      &--primary {
        color: $color-text-inverse;
        background: $color-primary;
      }
    }
  }
</style>
