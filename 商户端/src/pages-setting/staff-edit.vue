<template>
  <view class="page page-se">
    <view class="se-card">
      <text class="se-title">{{ editId ? '编辑子账号' : '新建子账号' }}</text>

      <view class="form-field">
        <text class="form-label">姓名</text>
        <input v-model="form.realName" class="form-input" placeholder="子账号姓名" maxlength="20" />
      </view>
      <view class="form-field">
        <text class="form-label">手机号</text>
        <input
          v-model="form.mobile"
          class="form-input"
          type="number"
          placeholder="11 位手机号"
          maxlength="11"
        />
      </view>
      <view class="form-field">
        <text class="form-label">登录用户名</text>
        <input v-model="form.username" class="form-input" placeholder="用于登录" maxlength="20" />
      </view>
      <view v-if="!editId" class="form-field">
        <text class="form-label">初始密码</text>
        <input
          v-model="form.password"
          class="form-input"
          :password="true"
          placeholder="至少 6 位"
          maxlength="20"
        />
      </view>

      <view class="form-field">
        <text class="form-label">角色</text>
        <view class="se-roles">
          <view
            v-for="r in roles"
            :key="r.code"
            class="se-role"
            :class="{ 'se-role--active': form.role === r.code }"
            @click="form.role = r.code"
          >
            <text class="se-role__name">{{ r.name }}</text>
            <text class="se-role__desc">{{ r.desc }}</text>
          </view>
        </view>
      </view>

      <view class="form-field">
        <text class="form-label">关联店铺</text>
        <view class="se-shops">
          <text
            v-for="s in shops"
            :key="s.id"
            class="se-shop"
            :class="{ 'se-shop--active': form.shopIds.includes(s.id) }"
            @click="toggleShop(s.id)"
            >{{ s.name }}</text
          >
        </view>
      </view>

      <BizBtn type="primary" block :disabled="submitting" @click="onSave">
        {{ submitting ? '保存中...' : '保存' }}
      </BizBtn>
    </view>
  </view>
</template>

<script setup lang="ts">
  import { reactive, ref, onMounted } from 'vue'
  import { onLoad } from '@dcloudio/uni-app'
  import { useShopStore } from '@/store'
  import { createStaff, updateStaff, getStaff } from '@/api/staff'
  import { mockEnabled, delay } from '@/api/_mock'
  import { logger } from '@/utils/logger'
  import { track, TRACK } from '@/utils/track'

  /**
   * 子账号编辑（T6.37）
   * @author 单 Agent V2.0 (P6 商户端)
   */
  const shopStore = useShopStore()
  const editId = ref<string>('')
  const submitting = ref<boolean>(false)

  const roles = [
    { code: 'manager' as const, name: '店长', desc: '全部权限' },
    { code: 'cashier' as const, name: '收银', desc: '订单 + 商品 + 财务' },
    { code: 'staff' as const, name: '店员', desc: '仅订单 + 商品上下架' }
  ]

  const form = reactive({
    realName: '',
    mobile: '',
    username: '',
    password: '',
    role: 'staff' as 'manager' | 'cashier' | 'staff',
    shopIds: [] as string[]
  })

  const shops = shopStore.shopList

  onLoad((opt) => {
    const id = (opt as Record<string, string> | undefined)?.id
    if (id) editId.value = id
  })

  onMounted(async () => {
    if (editId.value && !mockEnabled()) {
      try {
        const s = await getStaff(editId.value)
        form.realName = s.realName
        form.mobile = s.mobile
        form.username = s.username
        form.role = s.role
        form.shopIds = [...s.shopIds]
      } catch (e) {
        logger.warn('se.load.fail', { e: String(e) })
      }
    }
  })

  function toggleShop(id: string) {
    const idx = form.shopIds.indexOf(id)
    if (idx >= 0) form.shopIds.splice(idx, 1)
    else form.shopIds.push(id)
  }

  function validate(): boolean {
    if (!form.realName.trim()) {
      uni.showToast({ title: '请填写姓名', icon: 'none' })
      return false
    }
    if (!/^1\d{10}$/.test(form.mobile)) {
      uni.showToast({ title: '手机号格式不正确', icon: 'none' })
      return false
    }
    if (!form.username.trim()) {
      uni.showToast({ title: '请填写用户名', icon: 'none' })
      return false
    }
    if (!editId.value && form.password.length < 6) {
      uni.showToast({ title: '密码至少 6 位', icon: 'none' })
      return false
    }
    if (form.shopIds.length === 0) {
      uni.showToast({ title: '请关联至少 1 家店铺', icon: 'none' })
      return false
    }
    return true
  }

  async function onSave() {
    if (!validate()) return
    submitting.value = true
    try {
      const payload = {
        username: form.username,
        password: form.password,
        realName: form.realName,
        mobile: form.mobile,
        role: form.role,
        shopIds: form.shopIds
      }
      if (mockEnabled()) {
        await delay({})
      } else if (editId.value) {
        await updateStaff(editId.value, payload)
      } else {
        await createStaff(payload)
      }
      track(TRACK.CREATE_STAFF, { role: form.role })
      uni.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 800)
    } catch (e) {
      logger.warn('se.save.fail', { e: String(e) })
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .page-se {
    min-height: 100vh;
    padding: 24rpx;
    background: $uni-bg-color-grey;
  }

  .se-card {
    padding: 32rpx;
    background: #fff;
    border-radius: 16rpx;
  }

  .se-title {
    display: block;
    margin-bottom: 24rpx;
    font-size: 30rpx;
    font-weight: 600;
  }

  .form-field {
    margin-bottom: 24rpx;
  }

  .form-label {
    display: block;
    margin-bottom: 12rpx;
    font-size: 26rpx;
    color: $uni-text-color;
  }

  .form-input {
    width: 100%;
    height: 80rpx;
    padding: 0 24rpx;
    font-size: 28rpx;
    background: $uni-bg-color-grey;
    border-radius: $uni-border-radius-base;
  }

  .se-roles {
    display: flex;
    flex-direction: column;
    gap: 12rpx;
  }

  .se-role {
    padding: 16rpx 24rpx;
    background: $uni-bg-color-grey;
    border: 2rpx solid transparent;
    border-radius: 12rpx;

    &--active {
      background: $uni-color-primary-light;
      border-color: $uni-color-primary;
    }

    &__name {
      display: block;
      font-size: 26rpx;
      font-weight: 500;
    }

    &__desc {
      display: block;
      margin-top: 4rpx;
      font-size: 22rpx;
      color: $uni-text-color-grey;
    }
  }

  .se-shops {
    display: flex;
    flex-wrap: wrap;
    gap: 12rpx;
  }

  .se-shop {
    padding: 12rpx 20rpx;
    font-size: 24rpx;
    color: $uni-text-color-grey;
    background: $uni-bg-color-grey;
    border: 2rpx solid transparent;
    border-radius: 999rpx;

    &--active {
      color: $uni-color-primary;
      background: $uni-color-primary-light;
      border-color: $uni-color-primary;
    }
  }
</style>
