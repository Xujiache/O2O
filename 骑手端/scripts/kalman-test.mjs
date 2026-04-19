/**
 * @file kalman-test.mjs
 * @stage P7/T7.30 (Sprint 4) — V7.19 验收脚本
 * @desc 独立卡尔曼滤波单元测试（不依赖 ts-node / vitest）
 *
 * 直接运行：
 *   node 骑手端/scripts/kalman-test.mjs
 *
 * 与 src/utils/kalman.ts 算法逐行同步，仅用于 CI / 日常 V7.19 验收。
 */

class KalmanFilter1D {
  constructor(processNoise = 1e-5, measureNoise = 5e-2) {
    this.q = processNoise
    this.r = measureNoise
    this.p = 1
    this.x = 0
    this.k = 0
    this.inited = false
  }
  filter(measurement) {
    if (!this.inited) {
      this.x = measurement
      this.inited = true
      return measurement
    }
    this.p = this.p + this.q
    this.k = this.p / (this.p + this.r)
    this.x = this.x + this.k * (measurement - this.x)
    this.p = (1 - this.k) * this.p
    return this.x
  }
  reset() {
    this.p = 1
    this.x = 0
    this.k = 0
    this.inited = false
  }
}

class GpsKalman {
  constructor(processNoise = 1e-5, measureNoise = 5e-2) {
    this.lng = new KalmanFilter1D(processNoise, measureNoise)
    this.lat = new KalmanFilter1D(processNoise, measureNoise)
  }
  filter(p) {
    return { lng: this.lng.filter(p.lng), lat: this.lat.filter(p.lat) }
  }
}

function haversineMeters(a, b) {
  const R = 6_371_000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const results = []
const ok = (name, cond, detail = '') => results.push({ name, ok: cond, detail })

/* ---- Case 1: KF1D 收敛 ---- */
{
  const kf = new KalmanFilter1D()
  const truth = 100
  let seed = 42
  const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
  let final = 0
  for (let i = 0; i < 200; i++) {
    const u1 = rand()
    const u2 = rand()
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
    final = kf.filter(truth + z * 10)
  }
  ok('KF1D 收敛到真值 ±5', Math.abs(final - truth) <= 5, `final=${final.toFixed(2)}`)
}

/* ---- Case 2: V7.19 漂移过滤 ≤ 15m ---- */
{
  const kf = new GpsKalman(1e-5, 5e-2)
  const points = []
  for (let i = 0; i < 50; i++) {
    points.push({ lng: 116.481 + i * 0.0001, lat: 39.916 + i * 0.0001 })
  }
  /* 注入 5 个 ~40m 漂移（典型 GPS 多径异常）：lat +0.0003 ≈ 33m，lng+0.0003 ≈ 26m，斜对角 ~42m */
  ;[10, 20, 25, 30, 40].forEach((i) => {
    points[i] = { lng: points[i].lng + 0.0003, lat: points[i].lat + 0.0003, isDrift: true }
  })
  const filtered = points.map((p) => ({ ...kf.filter(p), isDrift: p.isDrift }))
  let maxJump = 0
  let exceed = 0
  for (let i = 1; i < filtered.length; i++) {
    const d = haversineMeters(filtered[i - 1], filtered[i])
    if (d > maxJump) maxJump = d
    if (d > 15) exceed += 1
  }
  ok(
    'V7.19: 50 点 (含 5 漂移) 滤后漂移 ≤ 15m',
    exceed === 0,
    `maxJump=${maxJump.toFixed(2)}m exceed=${exceed}`
  )

  /* 漂移点吸收：滤波后仍偏离原观测 > 5m 即视为吸收 */
  let absorbed = 0
  for (const i of [10, 20, 25, 30, 40]) {
    const err = haversineMeters(points[i], filtered[i])
    if (err > 5) absorbed += 1
  }
  ok('5 个漂移点被吸收（误差 > 5m）', absorbed >= 4, `${absorbed}/5`)
}

/* ---- Case 3: Reset ---- */
{
  const kf = new KalmanFilter1D()
  kf.filter(100)
  kf.filter(101)
  const before = kf.x
  kf.reset()
  const after = kf.filter(50)
  ok('reset 后首点 = 观测', Math.abs(after - 50) < 1e-6, `after=${after}`)
  ok('reset 前 current 收敛', before > 99, `before=${before}`)
}

/* ---- Case 4: Haversine ---- */
{
  const km =
    haversineMeters({ lng: 116.4074, lat: 39.9042 }, { lng: 121.4737, lat: 31.2304 }) / 1000
  ok('北京→上海 ≈ 1067km (±5%)', km >= 1010 && km <= 1130, `km=${km.toFixed(2)}`)
  const oneDeg = haversineMeters({ lng: 0, lat: 0 }, { lng: 0, lat: 1 }) / 1000
  ok('1° latitude ≈ 111km', oneDeg >= 110 && oneDeg <= 112, `km=${oneDeg.toFixed(2)}`)
}

/* ---- 输出 ---- */
const passed = results.filter((r) => r.ok).length
const failed = results.filter((r) => !r.ok).length
for (const r of results) {
  // eslint-disable-next-line no-console
  console.log(`${r.ok ? '[PASS]' : '[FAIL]'} ${r.name} — ${r.detail}`)
}
console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
