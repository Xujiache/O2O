import { Logger } from '@nestjs/common'
import { AliOssAdapter } from './ali-oss.adapter'
import { MinioAdapter } from './minio.adapter'
import type { StorageAdapterOptions } from './storage.adapter'

/**
 * StorageAdapter 单元测试
 *
 * 覆盖：
 * - MinioAdapter / AliOssAdapter 共同的 buildPublicUrl（含 / 不含 cdnPrefix）
 * - generateStsCredential 兜底返回（无 STS 配置时）
 * - 接口形态稳定（name 字段）
 *
 * 备注：putObject / removeObject / presign* 涉及真实 IO，本期不在单测覆盖；
 *       由 Postman 冒烟集 + P9 集成测试覆盖
 */
describe('StorageAdapters', () => {
  beforeAll(() => {
    Logger.overrideLogger(false)
  })

  const baseOptions: StorageAdapterOptions = {
    endpoint: 'localhost',
    port: 9000,
    useSSL: false,
    accessKey: 'AK',
    secretKey: 'SK',
    region: 'cn-north-1',
    buckets: { public: 'o2o-public', private: 'o2o-private', temp: 'o2o-temp' }
  }

  describe('MinioAdapter', () => {
    it('name 应为 minio', () => {
      const a = new MinioAdapter(baseOptions)
      expect(a.name).toBe('minio')
    })

    it('buildPublicUrl 默认走 endpoint', () => {
      const a = new MinioAdapter(baseOptions)
      const url = a.buildPublicUrl('o2o-public', 'product/202604/abc.jpg')
      expect(url).toBe('http://localhost:9000/o2o-public/product/202604/abc.jpg')
    })

    it('buildPublicUrl 带 cdnPrefix', () => {
      const a = new MinioAdapter({ ...baseOptions, cdnPrefix: 'https://cdn.o2o.com' })
      const url = a.buildPublicUrl('any', 'product/202604/abc.jpg')
      expect(url).toBe('https://cdn.o2o.com/product/202604/abc.jpg')
    })

    it('buildPublicUrl cdnPrefix 末尾 / 应被去除', () => {
      const a = new MinioAdapter({ ...baseOptions, cdnPrefix: 'https://cdn.o2o.com/' })
      const url = a.buildPublicUrl('any', 'k')
      expect(url).toBe('https://cdn.o2o.com/k')
    })

    it('generateStsCredential 返回 mode=presigned-put（R1/I-03 不再暴露 root ak/sk）', async () => {
      const a = new MinioAdapter(baseOptions)
      const c = await a.generateStsCredential('o2o-private', 'qual/202604/', 600)
      expect(c.provider).toBe('minio')
      expect(c.mode).toBe('presigned-put')
      /* R1 修复后：accessKeyId/Secret 必须为空，禁止暴露 */
      expect(c.accessKeyId).toBe('')
      expect(c.accessKeySecret).toBe('')
      expect(c.sessionToken).toBeUndefined()
      expect(c.bucket).toBe('o2o-private')
      expect(c.keyPrefix).toBe('qual/202604/')
      expect(c.expiration).toBeGreaterThan(Date.now())
      expect(c.expiresIn).toBe(600)
      expect(c.endpoint).toBe('http://localhost:9000')
    })

    it('generateStsCredential R1/I-03：putUrl 与 objectKey 必返且 objectKey 在 keyPrefix 下', async () => {
      const a = new MinioAdapter(baseOptions)
      const c = await a.generateStsCredential('o2o-private', 'qual/202604/', 900)
      expect(c.putUrl).toBeDefined()
      expect(typeof c.putUrl).toBe('string')
      expect(c.putUrl!.length).toBeGreaterThan(0)
      expect(c.objectKey).toBeDefined()
      expect(c.objectKey!.startsWith('qual/202604/')).toBe(true)
      /* keyPrefix 确保以 / 结尾（R1 适配器约定） */
      expect(c.keyPrefix.endsWith('/')).toBe(true)
    })

    it('generateStsCredential R1/I-03：未带末尾 / 的 keyPrefix 也能自动补全', async () => {
      const a = new MinioAdapter(baseOptions)
      const c = await a.generateStsCredential('o2o-private', 'qual/202604', 900)
      expect(c.keyPrefix).toBe('qual/202604/')
      expect(c.objectKey!.startsWith('qual/202604/')).toBe(true)
    })
  })

  describe('AliOssAdapter', () => {
    it('name 应为 ali-oss', () => {
      const a = new AliOssAdapter({ ...baseOptions, region: 'oss-cn-hangzhou' })
      expect(a.name).toBe('ali-oss')
    })

    it('buildPublicUrl 默认走 region.aliyuncs.com', () => {
      const a = new AliOssAdapter({ ...baseOptions, region: 'oss-cn-hangzhou' })
      const url = a.buildPublicUrl('o2o-public', 'k')
      expect(url).toBe('http://o2o-public.oss-cn-hangzhou.aliyuncs.com/k')
    })

    it('buildPublicUrl 带 cdnPrefix', () => {
      const a = new AliOssAdapter({
        ...baseOptions,
        region: 'oss-cn-hangzhou',
        cdnPrefix: 'https://cdn.o2o.com'
      })
      const url = a.buildPublicUrl('any', 'k')
      expect(url).toBe('https://cdn.o2o.com/k')
    })

    it('generateStsCredential 缺 RAM 配置 → 兜底返回长期 ak/sk（mode=sts）', async () => {
      delete process.env.OSS_STS_ACCESS_KEY_ID
      delete process.env.OSS_STS_ACCESS_KEY_SECRET
      delete process.env.OSS_RAM_ROLE_ARN
      const a = new AliOssAdapter({ ...baseOptions, region: 'oss-cn-hangzhou' })
      const c = await a.generateStsCredential('o2o-private', 'qual/202604/', 600)
      expect(c.provider).toBe('ali-oss')
      expect(c.mode).toBe('sts')
      expect(c.accessKeyId).toBe('AK')
      expect(c.sessionToken).toBeUndefined()
      expect(c.bucket).toBe('o2o-private')
      expect(c.keyPrefix).toBe('qual/202604/')
      expect(c.expiresIn).toBe(600)
    })
  })
})
