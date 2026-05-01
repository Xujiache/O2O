/**
 * @file setup.ts
 * @stage P9 Sprint 2 / T9.2（Agent E）
 * @desc 集成测试通用 setup 工具
 *
 * 提供：
 *   - buildTestApp：构造单 controller + ValidationPipe + 全局前缀的测试 App
 *   - makeFakeRepo：返回 TypeORM Repository 兼容的 jest.fn() 替身
 *   - signTestJwt：生成测试用 JWT（HS512）方便鉴权场景
 *   - mockRedis：返回 ioredis 兼容的 in-memory mock（仅常用 API）
 *
 * 设计：
 *   - 不启动整个 AppModule（避免拉起 TypeORM/Redis/RabbitMQ 真连接）
 *   - 每个 e2e-spec 仅 import 自己 controller + 替身 service，再走 Supertest
 *   - 与 P4 takeout-flow / errand-flow 的 helpers/mock-app.factory 共存（那是 saga 级，本套是 HTTP 级）
 */

import {
  INestApplication,
  type Provider,
  type Type,
  ValidationPipe,
  VersioningType
} from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test, type TestingModuleBuilder } from '@nestjs/testing'
import { JwtService } from '@nestjs/jwt'
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard'
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor'

/** 测试用 JWT 密钥（与 .env 解耦；签名/验签都用本常量即可） */
export const TEST_JWT_SECRET = 'test-secret-please-change-32chars-min'

/**
 * 构造测试 App 通用入参
 */
export interface BuildTestAppOptions {
  /** 待挂载的 controllers */
  controllers: Type<unknown>[]
  /** 额外 providers（mock service / Repository / Redis 客户端等） */
  providers?: Provider[]
  /** 全局守卫开关：false 时不挂 JwtAuthGuard，便于公开接口测试 */
  withGlobalAuth?: boolean
  /** 是否设置 /api/v1 全局前缀 + URI Versioning（默认 true，对齐 main.ts） */
  withGlobalPrefix?: boolean
  /** 用于 module builder 的扩展回调（覆盖 provider 等） */
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder
}

/**
 * 构造一个最小化 INestApplication
 * 流程：Test.createTestingModule → ValidationPipe → setGlobalPrefix → enableVersioning → init
 *
 * 调用方负责：模拟 controller 依赖（service / Repository / Redis client / JwtService）的 useValue
 */
export async function buildTestApp(opts: BuildTestAppOptions): Promise<INestApplication> {
  const providers: Provider[] = opts.providers ?? []
  const withGlobalAuth = opts.withGlobalAuth ?? false
  const withGlobalPrefix = opts.withGlobalPrefix ?? true

  const moduleProviders: Provider[] = [
    ...providers,
    /* 守卫在 controller 层 @UseGuards 时按 token 注入；保留为可选以避免缺依赖 */
    Reflector
  ]
  if (withGlobalAuth) {
    moduleProviders.push({ provide: APP_GUARD, useClass: JwtAuthGuard })
  }

  let builder = Test.createTestingModule({
    controllers: opts.controllers,
    providers: moduleProviders
  })
  if (opts.configure) builder = opts.configure(builder)

  const moduleRef = await builder.compile()
  const app = moduleRef.createNestApplication({ logger: false })

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true }
    })
  )
  /* TransformInterceptor 与生产保持一致：包裹响应为 { code/message/data/traceId } */
  app.useGlobalInterceptors(new TransformInterceptor())

  if (withGlobalPrefix) {
    app.setGlobalPrefix('/api/v1', { exclude: ['/health', '/metrics'] })
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })
  }

  await app.init()
  return app
}

/**
 * 生成一个 TypeORM Repository 兼容的 mock 替身
 *
 * 仅覆盖最常用 API；测试用例可在 it 内 .mockResolvedValue / .mockReturnValue 控制行为
 */
export function makeFakeRepo<T = unknown>(): {
  [K in
    | 'find'
    | 'findOne'
    | 'findOneBy'
    | 'findAndCount'
    | 'save'
    | 'create'
    | 'update'
    | 'delete'
    | 'count'
    | 'createQueryBuilder']: jest.Mock
} & { manager: { transaction: jest.Mock } } {
  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getOne: jest.fn().mockResolvedValue(null),
    getRawMany: jest.fn().mockResolvedValue([]),
    getCount: jest.fn().mockResolvedValue(0),
    execute: jest.fn().mockResolvedValue({ affected: 1 })
  }
  /* unused T param suppress */
  void (null as unknown as T)
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findOneBy: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    save: jest.fn().mockImplementation(async (e: unknown) => e),
    create: jest.fn().mockImplementation((e: unknown) => e),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    manager: {
      transaction: jest
        .fn()
        .mockImplementation(
          async (cb: (em: { save: jest.Mock; create: jest.Mock }) => Promise<unknown>) =>
            cb({ save: jest.fn().mockImplementation(async (e: unknown) => e), create: jest.fn() })
        )
    }
  }
}

/**
 * 生成测试用 JWT
 * 默认 userType=user，过期时间 1h
 */
export function signTestJwt(
  payload: {
    uid?: string
    userType?: 'user' | 'merchant' | 'rider' | 'admin'
    tenantId?: number
    ver?: number
  } = {}
): string {
  const svc = new JwtService({
    secret: TEST_JWT_SECRET,
    signOptions: { algorithm: 'HS512', expiresIn: 3600 }
  })
  return svc.sign({
    uid: payload.uid ?? 'U_TEST_001',
    userType: payload.userType ?? 'user',
    tenantId: payload.tenantId ?? 0,
    ver: payload.ver ?? 0
  })
}

/**
 * Sprint 3 / W3.E.2：Review 服务族 mock 集合
 *
 * 一次性返回 Review 域 7 个 service 的 jest.fn() 替身，便于 e2e-spec 直接 spread 注入
 * 所有方法在 beforeEach 中可统一 mockReset()
 */
export function mockReviewService(): {
  reviewSvc: { listForAdmin: jest.Mock; hide: jest.Mock; top: jest.Mock }
  replySvc: { adminReply: jest.Mock }
  appealSvc: { listForAdmin: jest.Mock; audit: jest.Mock }
  complaintSvc: { listForAdmin: jest.Mock; handle: jest.Mock; escalate: jest.Mock }
  ticketSvc: {
    listForAdmin: jest.Mock
    assign: jest.Mock
    reply: jest.Mock
    close: jest.Mock
  }
  arbSvc: { listForAdmin: jest.Mock; judge: jest.Mock }
  afterSaleSvc: { listForAdmin: jest.Mock; adminResolve: jest.Mock }
} {
  return {
    reviewSvc: { listForAdmin: jest.fn(), hide: jest.fn(), top: jest.fn() },
    replySvc: { adminReply: jest.fn() },
    appealSvc: { listForAdmin: jest.fn(), audit: jest.fn() },
    complaintSvc: { listForAdmin: jest.fn(), handle: jest.fn(), escalate: jest.fn() },
    ticketSvc: {
      listForAdmin: jest.fn(),
      assign: jest.fn(),
      reply: jest.fn(),
      close: jest.fn()
    },
    arbSvc: { listForAdmin: jest.fn(), judge: jest.fn() },
    afterSaleSvc: { listForAdmin: jest.fn(), adminResolve: jest.fn() }
  }
}

/**
 * Sprint 3 / W3.E.2：Marketing 服务族 mock 集合
 *
 * 一次性返回 Marketing 域 5 个 service 的 jest.fn() 替身
 */
export function mockMarketingService(): {
  couponSvc: {
    adminCreate: jest.Mock
    adminList: jest.Mock
    adminDetail: jest.Mock
    adminUpdate: jest.Mock
    adminDelete: jest.Mock
    publicAvailableList: jest.Mock
  }
  userCouponSvc: {
    receive: jest.Mock
    list: jest.Mock
    bestMatch: jest.Mock
    adminIssue: jest.Mock
  }
  promotionSvc: {
    create: jest.Mock
    update: jest.Mock
    updateStatus: jest.Mock
    forceStop: jest.Mock
    softDelete: jest.Mock
    listForAdmin: jest.Mock
    detail: jest.Mock
  }
  redPacketSvc: {
    create: jest.Mock
    adminList: jest.Mock
    adminDetail: jest.Mock
    adminCancel: jest.Mock
  }
  inviteSvc: { bind: jest.Mock; listMyInvites: jest.Mock; getMyStat: jest.Mock }
} {
  return {
    couponSvc: {
      adminCreate: jest.fn(),
      adminList: jest.fn(),
      adminDetail: jest.fn(),
      adminUpdate: jest.fn(),
      adminDelete: jest.fn(),
      publicAvailableList: jest.fn()
    },
    userCouponSvc: {
      receive: jest.fn(),
      list: jest.fn(),
      bestMatch: jest.fn(),
      adminIssue: jest.fn()
    },
    promotionSvc: {
      create: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      forceStop: jest.fn(),
      softDelete: jest.fn(),
      listForAdmin: jest.fn(),
      detail: jest.fn()
    },
    redPacketSvc: {
      create: jest.fn(),
      adminList: jest.fn(),
      adminDetail: jest.fn(),
      adminCancel: jest.fn()
    },
    inviteSvc: { bind: jest.fn(), listMyInvites: jest.fn(), getMyStat: jest.fn() }
  }
}

/**
 * in-memory ioredis mock：覆盖最常用 string / hash / set / expire / del / eval / pipeline
 *
 * 注：复杂场景请在测试体内自行 jest.fn() 覆盖；本 mock 仅为快速 wire-up
 */
export function mockRedis(): {
  store: Map<string, string>
  get: jest.Mock
  set: jest.Mock
  setex: jest.Mock
  del: jest.Mock
  incr: jest.Mock
  expire: jest.Mock
  exists: jest.Mock
  eval: jest.Mock
  hget: jest.Mock
  hset: jest.Mock
  smembers: jest.Mock
  sadd: jest.Mock
  srem: jest.Mock
  zadd: jest.Mock
  zrange: jest.Mock
  zrem: jest.Mock
  pipeline: jest.Mock
} {
  const store = new Map<string, string>()
  return {
    store,
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    set: jest.fn(async (k: string, v: string) => {
      store.set(k, v)
      return 'OK'
    }),
    setex: jest.fn(async (k: string, _ttl: number, v: string) => {
      store.set(k, v)
      return 'OK'
    }),
    del: jest.fn(async (...keys: string[]) => {
      let n = 0
      for (const k of keys) if (store.delete(k)) n++
      return n
    }),
    incr: jest.fn(async (k: string) => {
      const cur = parseInt(store.get(k) ?? '0', 10) + 1
      store.set(k, String(cur))
      return cur
    }),
    expire: jest.fn(async () => 1),
    exists: jest.fn(async (k: string) => (store.has(k) ? 1 : 0)),
    eval: jest.fn(async () => null),
    hget: jest.fn(async () => null),
    hset: jest.fn(async () => 1),
    smembers: jest.fn(async () => []),
    sadd: jest.fn(async () => 1),
    srem: jest.fn(async () => 1),
    zadd: jest.fn(async () => 1),
    zrange: jest.fn(async () => []),
    zrem: jest.fn(async () => 1),
    pipeline: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue([])
    })
  }
}
