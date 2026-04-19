import { AppRouteRecord } from '@/types/router'
import { dashboardRoutes } from './dashboard'
import { systemRoutes } from './system'
import { businessRoutes } from './business'

/**
 * 导出所有模块化路由（含 P8 业务模块 10 项）
 */
export const routeModules: AppRouteRecord[] = [dashboardRoutes, systemRoutes, ...businessRoutes]
