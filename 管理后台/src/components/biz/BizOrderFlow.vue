<!--
  BizOrderFlow 订单状态流程图（V8.17 关键组件）
  - 横向 timeline，节点高亮当前状态
  - 已经过节点变灰，未来节点虚线
  - 节点 hover 显示时间戳 + 操作人
  - 异常分支：取消 / 退款 / 仲裁 显示红色
-->
<template>
  <div class="biz-order-flow">
    <ElScrollbar>
      <div class="biz-order-flow__inner">
        <template v-for="(node, idx) in nodes" :key="node.code">
          <div
            class="biz-order-flow__node"
            :class="[
              {
                'biz-order-flow__node--reached': node.reached,
                'biz-order-flow__node--current': node.current,
                'biz-order-flow__node--cancel': node.variant === 'cancel',
                'biz-order-flow__node--refund': node.variant === 'refund',
                'biz-order-flow__node--arbitration': node.variant === 'arbitration'
              }
            ]"
          >
            <ElTooltip placement="top">
              <template #content>
                <div class="biz-order-flow__tip">
                  <div>{{ node.label }}</div>
                  <div v-if="node.ts">时间：{{ node.ts }}</div>
                  <div v-if="node.operator">操作人：{{ node.operator }}</div>
                </div>
              </template>
              <div class="biz-order-flow__dot">
                <ElIcon v-if="node.reached"><Check /></ElIcon>
                <span v-else>{{ idx + 1 }}</span>
              </div>
            </ElTooltip>
            <div class="biz-order-flow__label">{{ node.label }}</div>
          </div>
          <div
            v-if="idx !== nodes.length - 1"
            class="biz-order-flow__line"
            :class="{ 'biz-order-flow__line--reached': node.reached }"
          ></div>
        </template>
      </div>
    </ElScrollbar>
  </div>
</template>

<script setup lang="ts">
  import { ElScrollbar, ElIcon, ElTooltip } from 'element-plus'
  import { Check } from '@element-plus/icons-vue'
  import type { OrderFlowNode } from '@/types/business'

  defineProps<{
    nodes: OrderFlowNode[]
  }>()
</script>

<style scoped lang="scss">
  .biz-order-flow {
    padding: 16px 0;
    background: var(--el-bg-color);

    &__inner {
      display: flex;
      gap: 4px;
      align-items: center;
      min-width: max-content;
      padding: 0 8px;
    }

    &__node {
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-items: center;
      min-width: 84px;
    }

    &__dot {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      font-size: 14px;
      color: var(--el-text-color-secondary);
      background: var(--el-fill-color-lighter);
      border: 2px solid var(--el-border-color);
      border-radius: 50%;

      .el-icon {
        color: inherit;
      }
    }

    &__node--reached &__dot {
      color: #fff;
      background: var(--el-color-primary);
      border-color: var(--el-color-primary);
    }

    &__node--current &__dot {
      color: #fff;
      background: var(--el-color-success);
      border-color: var(--el-color-success);
      box-shadow: 0 0 0 4px rgb(103 194 58 / 20%);
    }

    &__node--cancel &__dot,
    &__node--refund &__dot {
      color: #fff;
      background: var(--el-color-warning);
      border-color: var(--el-color-warning);
    }

    &__node--arbitration &__dot {
      color: #fff;
      background: var(--el-color-danger);
      border-color: var(--el-color-danger);
    }

    &__label {
      font-size: 12px;
      color: var(--el-text-color-regular);
    }

    &__line {
      flex: 0 0 60px;
      height: 2px;
      background: var(--el-border-color);

      &--reached {
        background: var(--el-color-primary);
      }
    }

    &__tip {
      font-size: 12px;
      line-height: 1.6;
    }
  }
</style>
