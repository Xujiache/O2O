<!--
  P8 系统配置（JSON 可视化）
-->
<template>
  <div class="biz-system-config">
    <ElCard shadow="hover">
      <template #header>
        <div class="header-row">
          <span>系统配置</span>
          <ElButton type="primary" :loading="loading" @click="onSave">保存配置</ElButton>
        </div>
      </template>
      <ElInput v-model="jsonText" type="textarea" :rows="24" spellcheck="false" />
    </ElCard>
  </div>
</template>

<script setup lang="ts">
  import { onMounted, ref } from 'vue'
  import { ElButton, ElCard, ElInput, ElMessage } from 'element-plus'
  import { systemApi } from '@/api/business'

  const loading = ref(false)
  const jsonText = ref('{}')

  async function load() {
    loading.value = true
    try {
      const data = await systemApi.systemConfig()
      jsonText.value = JSON.stringify(data ?? {}, null, 2)
    } catch (e) {
      ElMessage.error((e as Error)?.message || '加载失败')
    } finally {
      loading.value = false
    }
  }

  async function onSave() {
    loading.value = true
    try {
      const data = JSON.parse(jsonText.value) as Record<string, unknown>
      await systemApi.systemConfigUpdate(data)
      ElMessage.success('已保存')
    } catch (e) {
      ElMessage.error((e as Error)?.message || '保存失败，请检查 JSON 格式')
    } finally {
      loading.value = false
    }
  }

  onMounted(load)
</script>

<style scoped lang="scss">
  .biz-system-config {
    padding: 12px;
  }

  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
</style>
