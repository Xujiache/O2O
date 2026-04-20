// ============================================================================
// k6 压测脚本 — 骑手位置上报 (2000 TPS)
// 依据 CONSENSUS_P9 §2.6：P95 ≤ 100ms @ 2000 TPS
// ============================================================================
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m',  target: 500  },
    { duration: '3m',  target: 2000 },
    { duration: '10m', target: 2000 },
    { duration: '1m',  target: 0    },
  ],
  thresholds: {
    http_req_duration: ['p(95)<100'],
    http_req_failed:   ['rate<0.01'],
  },
};

const API = __ENV.API || 'http://localhost:3000';
const TOKEN = __ENV.TOKEN || 'rider-test-token';

export default function () {
  // 模拟北京地区的随机经纬度
  const lng = 116.3 + Math.random() * 0.4;
  const lat = 39.8 + Math.random() * 0.3;

  const payload = JSON.stringify({
    riderId: Math.floor(Math.random() * 5000) + 1,
    lng: lng.toFixed(6),
    lat: lat.toFixed(6),
    speed: Math.floor(Math.random() * 40),
    heading: Math.floor(Math.random() * 360),
    accuracy: Math.floor(Math.random() * 20) + 5,
    ts: Date.now(),
  });

  const res = http.post(`${API}/api/v1/rider/location/report`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`,
    },
  });

  check(res, {
    'status 200 or 201': (r) => r.status === 200 || r.status === 201,
  });

  sleep(0.1 + Math.random() * 0.2);
}
