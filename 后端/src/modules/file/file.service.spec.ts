import { ConfigService } from '@nestjs/config'
import { Test, type TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { FileMeta } from '@/entities/system/file-meta.entity'
import { STORAGE_ADAPTER, type StorageAdapter } from './adapters/storage.adapter'
import { FileService } from './file.service'

/**
 * FileService 单元测试
 *
 * 覆盖：
 * - upload 三层校验（MIME / 扩展名 / 大小）拒绝
 * - upload 成功路径（公开桶 → CDN URL）
 * - sts / presign 透传 adapter
 * - remove 软删 + owner 权限
 *
 * 用途：T3.24 StorageAdapter 关键路径
 */
describe('FileService', () => {
  let service: FileService
  let storedRows: FileMeta[]
  let adapter: jest.Mocked<StorageAdapter>

  beforeEach(async () => {
    storedRows = []
    adapter = {
      name: 'minio',
      init: jest.fn().mockResolvedValue(undefined),
      putObject: jest
        .fn()
        .mockResolvedValue({ bucket: 'o2o-public', objectKey: 'k', etag: 'e', size: 100 }),
      removeObject: jest.fn().mockResolvedValue(undefined),
      presignGetUrl: jest.fn().mockResolvedValue('http://signed/get'),
      presignPutUrl: jest.fn().mockResolvedValue('http://signed/put'),
      generateStsCredential: jest.fn().mockResolvedValue({
        provider: 'minio',
        accessKeyId: 'AK',
        accessKeySecret: 'SK',
        sessionToken: undefined,
        expiration: Date.now() + 900_000,
        bucket: 'o2o-private',
        keyPrefix: 'qual/202604/',
        endpoint: 'http://localhost:9000',
        region: 'cn-north-1'
      }),
      buildPublicUrl: jest
        .fn()
        .mockImplementation((bucket: string, key: string) => `http://cdn/${bucket}/${key}`)
    }

    const fakeRepo: Partial<Repository<FileMeta>> = {
      create: jest.fn().mockImplementation((dto: Partial<FileMeta>) => dto as FileMeta),
      save: jest.fn().mockImplementation(async (entity: FileMeta) => {
        const existing = storedRows.findIndex((r) => r.id === entity.id)
        if (existing >= 0) {
          storedRows[existing] = entity
        } else {
          storedRows.push(entity)
        }
        return entity
      }),
      findOne: jest
        .fn()
        .mockImplementation(async (opts: { where: { id?: string; isDeleted?: number } }) => {
          return (
            storedRows.find(
              (r) =>
                r.id === opts.where.id &&
                (opts.where.isDeleted == null || r.isDeleted === opts.where.isDeleted)
            ) ?? null
          )
        })
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileService,
        { provide: STORAGE_ADAPTER, useValue: adapter },
        { provide: getRepositoryToken(FileMeta), useValue: fakeRepo },
        {
          provide: ConfigService,
          useValue: {
            get: <T>(key: string, def?: T): T => {
              const map: Record<string, unknown> = {
                'file.publicBucket': 'o2o-public',
                'file.privateBucket': 'o2o-private',
                'file.tempBucket': 'o2o-temp'
              }
              return (map[key] as T) ?? (def as T)
            }
          }
        }
      ]
    }).compile()

    service = module.get(FileService)
  })

  /** 构造一个 multer 风格 file */
  const buildFile = (name: string, mime: string, size = 1024): Express.Multer.File =>
    ({
      fieldname: 'file',
      originalname: name,
      encoding: '7bit',
      mimetype: mime,
      size,
      buffer: Buffer.alloc(size, 1),
      stream: undefined as unknown,
      destination: '',
      filename: name,
      path: ''
    }) as unknown as Express.Multer.File

  describe('upload 三层校验', () => {
    it('MIME 不在白名单 → 415', async () => {
      const f = buildFile('a.zip', 'application/zip', 1024)
      await expect(
        service.upload(f, { bizModule: 'other' }, { uploaderType: 4, uploaderId: '1' })
      ).rejects.toMatchObject({ status: 415 })
    })

    it('扩展名不在白名单 → 415', async () => {
      const f = buildFile('a.exe', 'image/jpeg', 1024)
      await expect(
        service.upload(f, { bizModule: 'other' }, { uploaderType: 4, uploaderId: '1' })
      ).rejects.toMatchObject({ status: 415 })
    })

    it('大小超限 → 413', async () => {
      const f = buildFile('a.jpg', 'image/jpeg', 30 * 1024 * 1024)
      await expect(
        service.upload(f, { bizModule: 'product' }, { uploaderType: 4, uploaderId: '1' })
      ).rejects.toMatchObject({ status: 413 })
    })

    it('空文件 → 400', async () => {
      const f = buildFile('a.jpg', 'image/jpeg', 0)
      await expect(
        service.upload(f, { bizModule: 'product' }, { uploaderType: 4, uploaderId: '1' })
      ).rejects.toMatchObject({ status: 400 })
    })
  })

  describe('upload 成功路径', () => {
    it('公开桶 → 直返 CDN URL，写入 file_meta', async () => {
      const f = buildFile('a.jpg', 'image/jpeg', 1024)
      const r = await service.upload(
        f,
        { bizModule: 'product', isPublic: true },
        { uploaderType: 4, uploaderId: '1' }
      )
      expect(adapter.putObject).toHaveBeenCalled()
      expect(adapter.buildPublicUrl).toHaveBeenCalled()
      expect(r.url.startsWith('http://cdn/o2o-public/product/')).toBe(true)
      expect(storedRows.length).toBe(1)
      expect(storedRows[0]?.bucket).toBe('o2o-public')
      expect(storedRows[0]?.fileType).toBe(1)
    })

    it('私有桶 → 返回签名 URL', async () => {
      const f = buildFile('a.jpg', 'image/jpeg', 1024)
      const r = await service.upload(
        f,
        { bizModule: 'qual', isPublic: false },
        { uploaderType: 4, uploaderId: '1' }
      )
      expect(adapter.presignGetUrl).toHaveBeenCalled()
      expect(r.url).toBe('http://signed/get')
      expect(r.isPublic).toBe(false)
    })
  })

  describe('STS / Presign', () => {
    it('sts 透传 adapter', async () => {
      const r = await service.generateSts(
        { bizModule: 'qual', isPublic: false },
        { uploaderType: 4, uploaderId: '1' }
      )
      expect(r.provider).toBe('minio')
      expect(r.bucket).toBe('o2o-private')
      expect(adapter.generateStsCredential).toHaveBeenCalled()
    })

    it('presign 强校验 MIME', async () => {
      await expect(
        service.generatePresign(
          { bizModule: 'avatar', fileName: 'a.exe', contentType: 'application/octet-stream' },
          { uploaderType: 4, uploaderId: '1' }
        )
      ).rejects.toMatchObject({ status: 415 })
    })

    it('presign 合法 → 返回签名 URL', async () => {
      const r = await service.generatePresign(
        { bizModule: 'avatar', fileName: 'a.png', contentType: 'image/png', expiresSec: 600 },
        { uploaderType: 4, uploaderId: '1' }
      )
      expect(r.url).toBe('http://signed/put')
      expect(r.bucket).toBe('o2o-public')
      expect(r.contentType).toBe('image/png')
    })
  })

  describe('remove 权限', () => {
    let createdId: string
    beforeEach(async () => {
      const f = buildFile('a.jpg', 'image/jpeg', 1024)
      const r = await service.upload(
        f,
        { bizModule: 'product', isPublic: true },
        { uploaderType: 1, uploaderId: 'U1' }
      )
      createdId = r.id
    })

    it('owner 删除成功', async () => {
      const fileNo = await service.remove(createdId, { uploaderType: 1, uploaderId: 'U1' })
      expect(fileNo).toMatch(/^F/)
      expect(storedRows[0]?.isDeleted).toBe(1)
    })

    it('管理员（type=4）删除成功', async () => {
      await service.remove(createdId, { uploaderType: 4, uploaderId: '999' })
      expect(storedRows[0]?.isDeleted).toBe(1)
    })

    it('非 owner 非 admin 删除 → 403', async () => {
      await expect(
        service.remove(createdId, { uploaderType: 1, uploaderId: 'U2' })
      ).rejects.toMatchObject({ status: 403 })
    })

    it('文件不存在 → 404', async () => {
      await expect(
        service.remove('not-exist', { uploaderType: 4, uploaderId: '1' })
      ).rejects.toMatchObject({
        status: 404
      })
    })
  })

  describe('getById 权限（R2/I-09）', () => {
    let createdId: string
    beforeEach(async () => {
      /* 用 user uid='OWNER_A' 上传一个文件 */
      const f = buildFile('a.jpg', 'image/jpeg', 1024)
      const r = await service.upload(
        f,
        { bizModule: 'product', isPublic: false } /* 私有桶 */,
        { uploaderType: 1, uploaderId: 'OWNER_A' }
      )
      createdId = r.id
    })

    it('owner（同 uid）查看成功', async () => {
      const r = await service.getById(createdId, { uploaderType: 1, uploaderId: 'OWNER_A' })
      expect(r.id).toBe(createdId)
      expect(r.url).toBe('http://signed/get') /* 私有桶走 presignGetUrl */
    })

    it('管理员（type=4）查看成功', async () => {
      const r = await service.getById(createdId, { uploaderType: 4, uploaderId: 'ADMIN_X' })
      expect(r.id).toBe(createdId)
    })

    it('非 owner 非 admin 查看 → 403 AUTH_PERMISSION_DENIED', async () => {
      await expect(
        service.getById(createdId, { uploaderType: 1, uploaderId: 'INTRUDER_B' })
      ).rejects.toMatchObject({ status: 403 })
    })

    it('文件不存在 → 404', async () => {
      await expect(
        service.getById('not-exist', { uploaderType: 4, uploaderId: '1' })
      ).rejects.toMatchObject({ status: 404 })
    })
  })
})
