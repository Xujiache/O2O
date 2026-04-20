import { Module } from '@nestjs/common'
import {
  PrometheusModule as WilsotoPrometheusModule,
  makeCounterProvider,
  makeHistogramProvider,
} from '@willsoto/nestjs-prometheus'

/**
 * Prometheus 指标模块
 * 功能：注册全局 /metrics 端点 + 业务自定义指标
 * 依据 docs/P9_集成测试部署/DESIGN_P9_集成测试部署.md §八
 */
@Module({
  imports: [
    WilsotoPrometheusModule.register({
      path: '/metrics',
      defaultMetrics: { enabled: true },
    }),
  ],
  providers: [
    // ── HTTP 请求指标 ──
    makeCounterProvider({
      name: 'http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'path', 'status'],
    }),
    makeHistogramProvider({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'path', 'status'],
      buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
    }),

    // ── 订单业务指标 ──
    makeCounterProvider({
      name: 'order_created_total',
      help: 'Total orders created',
      labelNames: ['type'],
    }),
    makeCounterProvider({
      name: 'order_paid_total',
      help: 'Total orders paid',
      labelNames: ['channel'],
    }),

    // ── 派单指标 ──
    makeHistogramProvider({
      name: 'dispatch_decision_duration_seconds',
      help: 'Dispatch decision duration in seconds',
      buckets: [0.1, 0.5, 1, 2, 5, 10],
    }),

    // ── 骑手定位指标 ──
    makeCounterProvider({
      name: 'rider_location_reports_total',
      help: 'Total rider location reports',
    }),

    // ── RPC / 外部调用失败 ──
    makeCounterProvider({
      name: 'business_rpc_failure_total',
      help: 'Total business RPC failures',
      labelNames: ['service', 'reason'],
    }),
  ],
  exports: [WilsotoPrometheusModule],
})
export class MetricsModule {}
