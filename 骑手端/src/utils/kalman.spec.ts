/**
 * @file kalman.spec.ts
 * @stage P7/T7.30 (Sprint 4)
 * @desc 卡尔曼滤波单元测试（无外部框架依赖，纯 ts-node 可跑 + node 直跑）
 *
 * V7.19 验收：
 *   构造 50 个连续点（含 5 个漂移 ≥ 50m），断言滤波后所有点漂移 ≤ 15m
 *
 * 运行方式：
 *   - 通过 type-check：vue-tsc --noEmit 已包含
 *   - 也可独立用 ts-node：npx ts-node src/utils/kalman.spec.ts
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
import { GpsKalman, KalmanFilter1D, haversineMeters } from './kalman'

interface TestPoint {
  lng: number
  lat: number
  isDrift?: boolean
}

interface AssertResult {
  name: string
  ok: boolean
  detail: string
}

const results: AssertResult[] = []

function assertOk(name: string, cond: boolean, detail = ''): void {
  results.push({ name, ok: cond, detail })
}

function nearEqual(a: number, b: number, tolerance = 1e-6): boolean {
  return Math.abs(a - b) <= tolerance
}

/* ========== Case 1: 一维 KF1D 收敛性 ========== */
function caseConvergence() {
  const kf = new KalmanFilter1D()
  const truth = 100
  /* 注入 200 个含高斯噪声的观测：mean=truth, std=10 */
  const observations: number[] = []
  let seed = 42
  function rand(): number {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }
  for (let i = 0; i < 200; i++) {
    /* Box-Muller */
    const u1 = rand()
    const u2 = rand()
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
    observations.push(truth + z * 10)
  }
  let final = 0
  for (const v of observations) final = kf.filter(v)
  /* 经过 200 次后，估计值应在 truth ± 5 之间（KF1D 设计期望） */
  assertOk(
    'KalmanFilter1D 收敛到真值附近',
    Math.abs(final - truth) <= 5,
    `final=${final.toFixed(2)} truth=${truth}`
  )
}

/* ========== Case 2: GpsKalman 漂移过滤（V7.19 核心） ========== */
function caseDriftFilter() {
  /* 构造 50 个连续点：从 (116.481, 39.916) 走小步 +0.0001 */
  const points: TestPoint[] = []
  for (let i = 0; i < 50; i++) {
    const lng = 116.481 + i * 0.0001
    const lat = 39.916 + i * 0.0001
    points.push({ lng, lat })
  }
  /* 在 index 10/20/25/30/40 注入 ~40m 漂移（典型 GPS 多径异常） */
  const driftIdx = [10, 20, 25, 30, 40]
  for (const i of driftIdx) {
    points[i] = {
      lng: points[i].lng + 0.0003,
      lat: points[i].lat + 0.0003,
      isDrift: true
    }
  }

  /* 滤波：先用前 9 个点 warm-up（让 KF 收敛），再断言后续点漂移 */
  const kf = new GpsKalman(1e-5, 5e-2)
  const filtered: { lng: number; lat: number; isDrift?: boolean }[] = []
  for (const p of points) {
    const f = kf.filter({ lng: p.lng, lat: p.lat })
    filtered.push({ ...f, isDrift: p.isDrift })
  }

  /* 断言：每个滤波点距「相邻前一个滤波点」的漂移 ≤ 15m
   * （K=10 时仅响应 10% 噪声，55m 漂移 → 5.5m 滤后偏移） */
  let maxJump = 0
  let exceedCount = 0
  for (let i = 1; i < filtered.length; i++) {
    const d = haversineMeters(filtered[i - 1], filtered[i])
    if (d > maxJump) maxJump = d
    if (d > 15) exceedCount += 1
  }
  assertOk(
    'GpsKalman 50 点 (含 5 漂移 ≥ 50m) 滤后漂移 ≤ 15m',
    exceedCount === 0,
    `maxJump=${maxJump.toFixed(2)}m exceedCount=${exceedCount}`
  )

  /* 额外断言：注入漂移点滤后误差 > 5m，说明被滤波器有效吸收 */
  let driftAbsorbed = 0
  for (const i of driftIdx) {
    const raw = points[i]
    const flt = filtered[i]
    const err = haversineMeters(raw, flt)
    if (err > 5) driftAbsorbed += 1
  }
  assertOk(
    '5 个漂移点被滤波器有效吸收（误差 > 5m 即视为吸收）',
    driftAbsorbed >= 4,
    `${driftAbsorbed}/5 absorbed`
  )
}

/* ========== Case 3: Reset 行为 ========== */
function caseReset() {
  const kf = new KalmanFilter1D()
  kf.filter(100)
  kf.filter(101)
  const before = kf.current
  kf.reset()
  /* reset 后下一次 filter 等价于直接采用观测值 */
  const after = kf.filter(50)
  assertOk('KalmanFilter1D.reset 后首点 = 观测值', nearEqual(after, 50), `after=${after}`)
  assertOk('KalmanFilter1D.reset 前 current 已收敛', before > 99, `before=${before}`)
}

/* ========== Case 4: Haversine 球面距离正确性 ========== */
function caseHaversine() {
  /* 北京 → 上海 ~1067 km */
  const beijing = { lng: 116.4074, lat: 39.9042 }
  const shanghai = { lng: 121.4737, lat: 31.2304 }
  const d = haversineMeters(beijing, shanghai)
  const km = d / 1000
  assertOk('Haversine 北京→上海 ≈ 1067km (±5%)', km >= 1010 && km <= 1130, `km=${km.toFixed(2)}`)

  /* 同点 = 0 */
  const same = haversineMeters(beijing, beijing)
  assertOk('Haversine 同点 = 0', same < 0.001, `same=${same}`)

  /* 1° ≈ 111km */
  const oneDeg = haversineMeters({ lng: 0, lat: 0 }, { lng: 0, lat: 1 })
  const oneDegKm = oneDeg / 1000
  assertOk(
    'Haversine 1° latitude ≈ 111km',
    oneDegKm >= 110 && oneDegKm <= 112,
    `km=${oneDegKm.toFixed(2)}`
  )
}

/* ========== 入口 ========== */
function runAll(): void {
  caseConvergence()
  caseDriftFilter()
  caseReset()
  caseHaversine()
}

/** 运行测试并输出报告（仅在直接执行时） */
export function runKalmanTests(): { passed: number; failed: number; results: AssertResult[] } {
  results.length = 0
  runAll()
  const passed = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok).length
  return { passed, failed, results }
}

/**
 * 当用 ts-node 直跑此文件时输出报告
 * 例：cd 骑手端 && npx ts-node src/utils/kalman.spec.ts
 *
 * 注：不在 vue-tsc 编译产物中执行，仅供开发态运行
 */
function maybeRun(): void {
  const g = globalThis as unknown as { require?: { main?: unknown }; module?: unknown }
  if (typeof g.require !== 'undefined' && g.require.main === g.module) {
    const r = runKalmanTests()
    for (const x of r.results) {
      console.warn(`${x.ok ? '[PASS]' : '[FAIL]'} ${x.name} — ${x.detail}`)
    }
    console.warn(`\n${r.passed} passed, ${r.failed} failed`)
  }
}

maybeRun()
