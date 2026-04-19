/**
 * 业务侧 STORAGE_KEYS 集中管理
 *
 * 【P7/R-03 教训】所有 localStorage / sessionStorage 调用必须从此处取，禁止硬编码
 * 命名规范：o2o_admin_<模块>_<字段>
 *
 * 反向 grep 自检命令：
 *   rg "localStorage\.(getItem|setItem|removeItem)\(['\"]o2o_admin" src/
 *   除常量定义本身外应 0 命中
 *
 * @module utils/business/storage-keys
 */

export const STORAGE_KEYS = {
  /** 业务字典缓存（dict store） */
  DICT_CACHE: 'o2o_admin_dict_cache',
  /** 字典缓存时间戳（用于 TTL 失效） */
  DICT_CACHE_TS: 'o2o_admin_dict_cache_ts',
  /** 权限码列表（perm store） */
  PERM_CODES: 'o2o_admin_perm_codes',
  /** 菜单树（perm store） */
  PERM_MENUS: 'o2o_admin_perm_menus',
  /** 角色列表 */
  PERM_ROLES: 'o2o_admin_perm_roles',
  /** APP 配置（app-config store） */
  APP_CONFIG: 'o2o_admin_app_config',
  /** 业务侧最后刷新时间戳（5min 节流） */
  LAST_REFRESH_TS: 'o2o_admin_last_refresh_ts',
  /** Trace ID 序列号 */
  TRACE_SEQ: 'o2o_admin_trace_seq',
  /** 异步导出任务列表（export-job store） */
  EXPORT_JOBS: 'o2o_admin_export_jobs',
  /** 业务表单草稿（自动保存） */
  FORM_DRAFT_PREFIX: 'o2o_admin_form_draft_',
  /** 业务表格列设置 */
  TABLE_COLUMN_PREFIX: 'o2o_admin_table_col_',
  /** 业务侧 admin id（请求头 X-Admin-Id 注入） */
  ADMIN_ID: 'o2o_admin_admin_id',
  /** 业务侧 currentRole（多角色账号切换） */
  CURRENT_ROLE: 'o2o_admin_current_role',
  /** 业务侧 i18n locale（与框架 sys-* 隔离） */
  BIZ_LOCALE: 'o2o_admin_biz_locale',
  /** 业务侧 WS 上次消息时间戳（断线检测用） */
  WS_LAST_TS: 'o2o_admin_ws_last_ts'
} as const

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]

/**
 * 业务侧 storage 取值（带 try-catch + JSON 自动解析）
 * @param key STORAGE_KEYS 中的常量
 * @param fallback 默认值
 */
export function bizGet<T = unknown>(key: StorageKey, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null || raw === undefined) return fallback
    if (raw === '' || raw === 'undefined' || raw === 'null') return fallback
    try {
      return JSON.parse(raw) as T
    } catch {
      return raw as unknown as T
    }
  } catch {
    return fallback
  }
}

/**
 * 业务侧 storage 写值（自动 JSON.stringify）
 * @param key STORAGE_KEYS 中的常量
 * @param value 任意可序列化值
 */
export function bizSet(key: StorageKey, value: unknown): void {
  try {
    if (value === undefined || value === null) {
      localStorage.removeItem(key)
      return
    }
    const raw = typeof value === 'string' ? value : JSON.stringify(value)
    localStorage.setItem(key, raw)
  } catch (e) {
    console.warn('[bizSet] localStorage 写入失败', key, e)
  }
}

/**
 * 业务侧 storage 移除
 * @param key STORAGE_KEYS 中的常量
 */
export function bizRemove(key: StorageKey): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

/**
 * 清空所有业务侧 storage（不影响框架 sys-* / pinia persist key）
 * 退出登录时调用
 */
export function bizClearAll(): void {
  try {
    Object.values(STORAGE_KEYS).forEach((k) => {
      localStorage.removeItem(k)
    })
    Object.keys(localStorage)
      .filter(
        (k) =>
          k.startsWith(STORAGE_KEYS.FORM_DRAFT_PREFIX) ||
          k.startsWith(STORAGE_KEYS.TABLE_COLUMN_PREFIX)
      )
      .forEach((k) => localStorage.removeItem(k))
  } catch {
    // ignore
  }
}
