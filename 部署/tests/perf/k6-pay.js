// ============================================================================
// k6 压测脚本 — 支付回调 (500 TPS)
// 依据 CONSENSUS_P9 §2.6：P95 ≤ 200ms @ 500 TPS
// ============================================================================
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m',  target: 100 },
    { duration: '3m',  target: 500 },
    { duration: '10m', target: 500 },
    { duration: '1m',  target: 0   },
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],
    http_req_failed:   ['rate<0.01'],
  },
};

const API = __ENV.API || 'http://localhost:3000';

export default function () {
  const payload = JSON.stringify({
    orderNo: `TEST${Date.now()}${Math.floor(Math.random() * 10000)}`,
    tradeNo: `WX${Date.now()}`,
    payAmount: (Math.random() * 100 + 1).toFixed(2),
    payChannel: 'wechat',
    paidAt: new Date().toISOString(),
  });

  const res = http.post(`${API}/api/v1/internal/payment/callback`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(res, {
    'status 200 or 201': (r) => r.status === 200 || r.status === 201,
  });

  sleep(0.3 + Math.random() * 0.4);
}
