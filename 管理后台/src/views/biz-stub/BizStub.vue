<template>
  <div class="biz-stub">
    <ElEmpty :description="`${title}（敬请期待 - 即将在 Sprint ${sprint} 实现）`">
      <ElTag type="info">{{ route.path }}</ElTag>
    </ElEmpty>
  </div>
</template>

<script setup lang="ts">
  import { useRoute } from 'vue-router'
  import { ElEmpty, ElTag } from 'element-plus'

  withDefaults(
    defineProps<{
      title: string
      sprint: number
    }>(),
    {
      sprint: 0
    }
  )

  const route = useRoute()
</script>

<style scoped lang="scss">
  .biz-stub {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
  }
</style>
