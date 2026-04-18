import { SnowflakeId } from './snowflake-id.util'

/**
 * Snowflake ID 工具单元测试
 * 覆盖：单调递增 / 字符串安全 / file_no 格式 / workerId reset
 */
describe('SnowflakeId', () => {
  beforeEach(() => SnowflakeId.__reset(7))

  it('next() 应单调递增', () => {
    const a = SnowflakeId.next()
    const b = SnowflakeId.next()
    const c = SnowflakeId.next()
    expect(b > a).toBe(true)
    expect(c > b).toBe(true)
  })

  it('nextString() 应返回纯数字字符串', () => {
    const s = SnowflakeId.nextString()
    expect(typeof s).toBe('string')
    expect(/^\d+$/.test(s)).toBe(true)
    expect(s.length).toBeGreaterThanOrEqual(15)
  })

  it('nextFileNo() 应以 F 开头并含时间戳', () => {
    const s = SnowflakeId.nextFileNo()
    expect(s.startsWith('F')).toBe(true)
    expect(s.length).toBeGreaterThanOrEqual(15)
  })

  it('1000 次连续调用结果应全部唯一', () => {
    const set = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      set.add(SnowflakeId.nextString())
    }
    expect(set.size).toBe(1000)
  })

  it('__reset 应支持自定义 workerId', () => {
    SnowflakeId.__reset(123)
    const id = SnowflakeId.next()
    expect(id > 0n).toBe(true)
  })
})
