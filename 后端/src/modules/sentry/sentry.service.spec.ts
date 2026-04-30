/**
 * @file sentry.service.spec.ts
 * @stage P9/W2.C.1 (Sprint 2)
 * @desc SentryService 单测：覆盖未配置/已配置启动 + capture/setUser/setContext + isEnabled。
 *
 * @author Agent C (P9 Sprint 2)
 */
import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import * as Sentry from '@sentry/node'
import { SentryService } from './sentry.service'

jest.mock(
  '@sentry/node',
  () => ({
    __esModule: true,
    init: jest.fn(),
    captureException: jest.fn(),
    captureMessage: jest.fn(),
    setUser: jest.fn(),
    setContext: jest.fn(),
    withScope: jest.fn((cb: (s: unknown) => void) => {
      const scope = {
        setExtra: jest.fn(),
        setUser: jest.fn(),
        setTag: jest.fn()
      }
      cb(scope)
    })
  }),
  /* virtual: 允许在 @sentry/node 真包未安装时使用 mock；A 装包后自动切到真模块再被 mock */
  { virtual: true }
)

describe('SentryService', () => {
  let service: SentryService
  let configValues: Record<string, string | undefined>

  beforeEach(async () => {
    jest.clearAllMocks()
    configValues = {}
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SentryService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => configValues[key]
          }
        }
      ]
    }).compile()

    service = module.get<SentryService>(SentryService)
  })

  describe('onModuleInit', () => {
    it('SENTRY_DSN 未配置时禁用，且不调用 Sentry.init', () => {
      service.onModuleInit()
      expect(service.isEnabled()).toBe(false)
      expect(Sentry.init).not.toHaveBeenCalled()
    })

    it('SENTRY_DSN 已配置时启用，且调用 Sentry.init 一次', () => {
      configValues['SENTRY_DSN'] = 'https://abc@o0.ingest.sentry.io/1'
      configValues['NODE_ENV'] = 'staging'
      configValues['SENTRY_RELEASE'] = 'rel-1.2.3'
      service.onModuleInit()
      expect(service.isEnabled()).toBe(true)
      expect(Sentry.init).toHaveBeenCalledTimes(1)
      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: 'https://abc@o0.ingest.sentry.io/1',
          environment: 'staging',
          release: 'rel-1.2.3'
        })
      )
    })

    it('SENTRY_RELEASE 未配置时回退 unknown', () => {
      configValues['SENTRY_DSN'] = 'https://abc@o0.ingest.sentry.io/1'
      service.onModuleInit()
      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({ release: 'unknown', environment: 'development' })
      )
    })
  })

  describe('captureException', () => {
    it('未启用时静默不调用 Sentry', () => {
      service.captureException(new Error('boom'))
      expect(Sentry.withScope).not.toHaveBeenCalled()
      expect(Sentry.captureException).not.toHaveBeenCalled()
    })

    it('已启用时通过 withScope 注入 ctx 字段并调用 captureException', () => {
      configValues['SENTRY_DSN'] = 'https://abc@o0.ingest.sentry.io/1'
      service.onModuleInit()
      const err = new Error('boom')
      service.captureException(err, {
        traceId: 't-001',
        userId: 'u-1',
        userType: 'rider',
        path: '/api/v1/x',
        skipMe: undefined
      })
      expect(Sentry.withScope).toHaveBeenCalledTimes(1)
      expect(Sentry.captureException).toHaveBeenCalledWith(err)
    })

    it('ctx 为空时也能正常上报', () => {
      configValues['SENTRY_DSN'] = 'https://abc@o0.ingest.sentry.io/1'
      service.onModuleInit()
      service.captureException(new Error('e'))
      expect(Sentry.captureException).toHaveBeenCalledTimes(1)
    })
  })

  describe('captureMessage', () => {
    it('未启用时静默', () => {
      service.captureMessage('hello')
      expect(Sentry.captureMessage).not.toHaveBeenCalled()
    })

    it('已启用时使用默认 info 级别上报', () => {
      configValues['SENTRY_DSN'] = 'https://abc@o0.ingest.sentry.io/1'
      service.onModuleInit()
      service.captureMessage('hello')
      expect(Sentry.captureMessage).toHaveBeenCalledWith('hello', 'info')
    })

    it('支持自定义 level', () => {
      configValues['SENTRY_DSN'] = 'https://abc@o0.ingest.sentry.io/1'
      service.onModuleInit()
      service.captureMessage('warn-msg', 'warning')
      expect(Sentry.captureMessage).toHaveBeenCalledWith('warn-msg', 'warning')
    })
  })

  describe('setUser', () => {
    it('未启用时静默', () => {
      service.setUser('u-1', 'admin')
      expect(Sentry.setUser).not.toHaveBeenCalled()
    })

    it('已启用时携带 userType', () => {
      configValues['SENTRY_DSN'] = 'https://abc@o0.ingest.sentry.io/1'
      service.onModuleInit()
      service.setUser('u-1', 'admin')
      expect(Sentry.setUser).toHaveBeenCalledWith({ id: 'u-1', userType: 'admin' })
    })

    it('已启用时仅 uid', () => {
      configValues['SENTRY_DSN'] = 'https://abc@o0.ingest.sentry.io/1'
      service.onModuleInit()
      service.setUser('u-2')
      expect(Sentry.setUser).toHaveBeenCalledWith({ id: 'u-2' })
    })
  })

  describe('setContext', () => {
    it('未启用时静默', () => {
      service.setContext('biz', { foo: 'bar' })
      expect(Sentry.setContext).not.toHaveBeenCalled()
    })

    it('已启用时透传给 Sentry.setContext', () => {
      configValues['SENTRY_DSN'] = 'https://abc@o0.ingest.sentry.io/1'
      service.onModuleInit()
      service.setContext('biz', { foo: 'bar' })
      expect(Sentry.setContext).toHaveBeenCalledWith('biz', { foo: 'bar' })
    })
  })

  describe('isEnabled', () => {
    it('初始为 false', () => {
      expect(service.isEnabled()).toBe(false)
    })
    it('init 后为 true', () => {
      configValues['SENTRY_DSN'] = 'https://abc@o0.ingest.sentry.io/1'
      service.onModuleInit()
      expect(service.isEnabled()).toBe(true)
    })
  })
})
