/**
 * P9 Sprint 6 / W6.C.1（Agent C） - 5 角色 E2E 登录 fixture
 *
 * 角色矩阵（与 PERM_AUDIT_V2 §三对齐）：
 *   - super：通配（roleSet 含 R_SUPER → BizPermStore.has() 短路放行）
 *   - admin：系统 admin/role + 商户审核 + 用户风控
 *   - finance：提现审核 + 账单查看
 *   - cs：客服仲裁 + 工单分派 + 风险订单审核
 *   - audit：商户入驻审核 + 骑手审核
 *
 * 实现：page.route mock 后端 login / permissions；同时把 perm codes / roles
 *      直接写入 localStorage（key 与 utils/business/storage-keys.ts 对齐），
 *      绕过登录交互直接进入 /biz/dashboard。
 *
 * 严格类型：0 处 :any；ROLE_CONFIGS / loginAs 全显式声明。
 */
import type { Page, Route } from '@playwright/test'

/** 业务侧 perm store 在 localStorage 中的 key（与 utils/business/storage-keys.ts 一致） */
const STORAGE_PERM_CODES = 'o2o_admin_perm_codes'
const STORAGE_PERM_ROLES = 'o2o_admin_perm_roles'
const STORAGE_PERM_MENUS = 'o2o_admin_perm_menus'
const STORAGE_ADMIN_ID = 'o2o_admin_admin_id'

/** 单角色配置 */
interface RoleConfig {
  username: string
  /** UI 文档别名 (R_SUPER / R_ADMIN / R_FINANCE / R_CS / R_AUDIT) */
  uiRole: string
  /** biz:* 权限码（super 用通配占位，靠 R_SUPER 短路） */
  codes: string[]
}

/**
 * 5 角色配置矩阵
 *
 * 取值依据：docs/P9_集成测试部署/P9_PERM_AUDIT_REPORT_V2.md §三
 */
const ROLE_CONFIGS: Record<string, RoleConfig> = {
  super: {
    username: 'super',
    uiRole: 'R_SUPER',
    /* 通配语义：BizPermStore.has() 检测到 roleSet 含 R_SUPER 即短路放行，codes 仅占位 */
    codes: ['biz:*']
  },
  admin: {
    username: 'admin',
    uiRole: 'R_ADMIN',
    codes: [
      /* 系统管理 */
      'biz:system:admin:create',
      'biz:system:role:create',
      'biz:system:dict:edit',
      'biz:system:operation-log:view',
      /* 商户管理 */
      'biz:merchant:audit',
      'biz:merchant:risk:ban',
      /* 用户管理 */
      'biz:user:risk:ban'
    ]
  },
  finance: {
    username: 'finance',
    uiRole: 'R_FINANCE',
    codes: ['biz:finance:withdraw:audit', 'biz:finance:bill:view', 'biz:finance:invoice:audit']
  },
  cs: {
    username: 'cs',
    uiRole: 'R_CS',
    codes: [
      'biz:cs:arbitration:judge',
      'biz:cs:ticket:assign',
      'biz:cs:ticket:close',
      'biz:risk:order:pass',
      'biz:risk:order:block'
    ]
  },
  audit: {
    username: 'audit',
    uiRole: 'R_AUDIT',
    codes: ['biz:merchant:audit', 'biz:rider:audit']
  }
}

/** 5 角色名常量（与 ROLE_CONFIGS keys 一致） */
export const ROLES = ['super', 'admin', 'finance', 'cs', 'audit'] as const
export type Role = (typeof ROLES)[number]

/** json fulfill 工具 */
function jsonResp(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  })
}

/**
 * 以指定角色登录管理后台
 *
 * 流程：
 *   1. mock /admin/login（含 token / admin / menus / permissions）
 *   2. mock /admin/me/permissions（兜底刷新）
 *   3. 先访问 /login 让前端注册 storage 事件
 *   4. 直接写入 perm store localStorage（codes / roles / menus）
 *   5. 跳转 /biz/dashboard
 *
 * @param page Playwright Page 实例
 * @param role 'super' | 'admin' | 'finance' | 'cs' | 'audit'
 */
export async function loginAs(page: Page, role: Role): Promise<void> {
  const cfg = ROLE_CONFIGS[role]
  const token = `mock-${role}-token`

  /* mock 后端登录接口（覆盖各种历史路径） */
  await page.route('**/auth/admin/login', (r) =>
    jsonResp(r, {
      code: 0,
      message: 'ok',
      data: {
        tokens: { accessToken: token, refreshToken: `mock-${role}-rtk`, expiresIn: 7200 },
        admin: { id: `A_${role.toUpperCase()}`, name: cfg.username, isSuper: role === 'super' },
        menus: [],
        permissions: cfg.codes,
        roles: [cfg.uiRole]
      }
    })
  )
  await page.route('**/api/v1/admin/login', (r) =>
    jsonResp(r, {
      code: 0,
      message: 'ok',
      data: { token, accessToken: token, permissions: cfg.codes, roles: [cfg.uiRole] }
    })
  )

  /* mock 权限刷新接口 */
  await page.route('**/admin/me/permissions', (r) =>
    jsonResp(r, {
      code: 0,
      message: 'ok',
      data: { codes: cfg.codes, permissions: cfg.codes, roles: [cfg.uiRole], menus: [] }
    })
  )
  await page.route('**/admin/permissions', (r) =>
    jsonResp(r, {
      code: 0,
      message: 'ok',
      data: { codes: cfg.codes, permissions: cfg.codes, roles: [cfg.uiRole], menus: [] }
    })
  )

  /* 先到 /login（应用初始化 + 注册 storage） */
  await page.goto('/login').catch(() => {
    /* 后台未启动也允许 — 测试以 mock + storage 行为为准 */
  })

  /* 直接注入 perm store 三件套（绕过表单交互） */
  await page.evaluate(
    ({
      adminId,
      codes,
      roles,
      menus
    }: {
      adminId: string
      codes: string[]
      roles: string[]
      menus: unknown[]
    }) => {
      try {
        localStorage.setItem('o2o_admin_perm_codes', JSON.stringify(codes))
        localStorage.setItem('o2o_admin_perm_roles', JSON.stringify(roles))
        localStorage.setItem('o2o_admin_perm_menus', JSON.stringify(menus))
        localStorage.setItem('o2o_admin_admin_id', adminId)
      } catch {
        /* SSR / private mode safety */
      }
    },
    {
      adminId: `A_${role.toUpperCase()}`,
      codes: cfg.codes,
      roles: [cfg.uiRole],
      menus: [] as unknown[]
    }
  )

  /* 进入业务大盘 */
  await page.goto('/biz/dashboard').catch(() => {})
}

/**
 * 注销（清空 perm store storage）
 */
export async function logout(page: Page): Promise<void> {
  await page.evaluate(() => {
    try {
      localStorage.removeItem('o2o_admin_perm_codes')
      localStorage.removeItem('o2o_admin_perm_roles')
      localStorage.removeItem('o2o_admin_perm_menus')
      localStorage.removeItem('o2o_admin_admin_id')
    } catch {
      /* ignore */
    }
  })
}

/**
 * 通用业务 API mock（避免业务页因真请求 404 报错）
 *
 * 在 spec.beforeEach 内调用一次即可，loginAs 后再叠加。
 */
export async function mockBizApis(page: Page): Promise<void> {
  await page.route('**/api/**', (route) => {
    const url = route.request().url()
    const method = route.request().method()

    /* 让登录 / 权限走 loginAs 内的更具体 route，这里回落兜底 */
    if (url.includes('/admin/login')) {
      return route.fallback()
    }
    if (url.includes('/admin/me/permissions') || url.includes('/admin/permissions')) {
      return route.fallback()
    }

    /* 业务接口：返回空列表 + 空详情，避免 5xx */
    if (method === 'GET') {
      return jsonResp(route, {
        code: 0,
        message: 'ok',
        data: { list: [], total: 0, page: 1, size: 20 }
      })
    }
    return jsonResp(route, { code: 0, message: 'ok', data: { ok: true } })
  })
}

/** 暴露名称 / 配置（spec 内可读，保持只读语义） */
export function getRoleConfig(role: Role): Readonly<RoleConfig> {
  return ROLE_CONFIGS[role]
}

export const STORAGE_KEYS_E2E = {
  PERM_CODES: STORAGE_PERM_CODES,
  PERM_ROLES: STORAGE_PERM_ROLES,
  PERM_MENUS: STORAGE_PERM_MENUS,
  ADMIN_ID: STORAGE_ADMIN_ID
} as const
