// ============================================================================
// k6 压测脚本 — 下单接口 (1000 TPS × 10min)
// 依据 CONSENSUS_P9 §2.6：P95 ≤ 500ms @ 1000 TPS 持续 10min
// 运行：k6 run --env API=http://localhost:3000 --env TOKEN=xxx k6-order.js
// ============================================================================
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// 自定义指标
const orderCreated = new Counter('order_created');
const orderFailed  = new Rate('order_failed');
const orderLatency = new Trend('order_latency', true);

export const options = {
  stages: [
    { duration: '2m',  target: 200  },   // 预热
    { duration: '5m',  target: 1000 },   // 爬坡到 1000 VU
    { duration: '10m', target: 1000 },   // 持续 10 分钟
    { duration: '2m',  target: 0    },   // 降温
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],     // PRD §4.1: 峰值 ≤ 500ms
    http_req_failed:   ['rate<0.01'],     // 失败率 < 1%
    order_failed:      ['rate<0.02'],     // 业务失败率 < 2%
  },
};

const API = __ENV.API || 'http://localhost:3000';
const TOKEN = __ENV.TOKEN || 'test-token';

const headers = {
  'Content-Type':  'application/json',
  'Authorization': `Bearer ${TOKEN}`,
  'X-Client-Type': '1',
};

// 随机测试数据
function randomItem() {
  return {
    shopId: Math.floor(Math.random() * 100) + 1,
    addressId: Math.floor(Math.random() * 50) + 1,
    items: [
      { skuId: Math.floor(Math.random() * 500) + 1, count: Math.floor(Math.random() * 3) + 1 },
    ],
    remark: `k6-${Date.now()}`,
  };
}

export default function () {
  const payload = JSON.stringify(randomItem());
  const res = http.post(`${API}/api/v1/user/order/takeout`, payload, { headers });

  const success = check(res, {
    '状态码 201': (r) => r.status === 201,
    '返回订单号': (r) => {
      try { return JSON.parse(r.body).data?.orderNo?.length > 0; }
      catch { return false; }
    },
  });

  orderLatency.add(res.timings.duration);
  if (success) {
    orderCreated.add(1);
  } else {
    orderFailed.add(1);
  }

  sleep(0.5 + Math.random());
}
