/**
 * @file operation-log.interceptor.spec.ts
 * @stage P9 Sprint 3 / W3.D.1
 * @desc OperationLogInterceptor 单测：路径过滤 / 敏感脱敏 / 异常透传
 * @author Sprint3-Agent D
 */

import { CallHandler, ExecutionContext } from '@nestjs/common'
import { lastValueFrom, of, throwError } from 'rxjs'
import { OperationLogInterceptor } from './operation-log.interceptor'

interface MockReq {
  method: string
  path?: string
  url: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
  ip?: string
  user?: { uid?: string; username?: string }
}

const buildContext = (req: MockReq): ExecutionContext =>
  ({
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
      getNext: () => undefined
    })
  }) as unknown as ExecutionContext

const flush = async (): Promise<void> => {
  /* 让 fire-and-forget 微任务跑完 */
  await new Promise<void>((r) => setImmediate(r))
}

describe('OperationLogInterceptor', () => {
  let writeLog: jest.Mock
  let interceptor: OperationLogInterceptor

  beforeEach(() => {
    writeLog = jest.fn().mockResolvedValue(undefined)
    interceptor = new OperationLogInterceptor({
      writeLog
    } as unknown as ConstructorParameters<typeof OperationLogInterceptor>[0])
  })

  it('GET 请求 → 直接放行不写日志', async () => {
    const req: MockReq = {
      method: 'GET',
      url: '/api/v1/admin/order',
      path: '/api/v1/admin/order',
      headers: {}
    }
    const handler: CallHandler = { handle: () => of('ok') }
    const result = await lastValueFrom(interceptor.intercept(buildContext(req), handler))
    expect(result).toBe('ok')
    await flush()
    expect(writeLog).not.toHaveBeenCalled()
  })

  it('非 admin 路径 POST → 不写日志', async () => {
    const req: MockReq = {
      method: 'POST',
      url: '/api/v1/user/order',
      path: '/api/v1/user/order',
      headers: {}
    }
    const handler: CallHandler = { handle: () => of('ok') }
    await lastValueFrom(interceptor.intercept(buildContext(req), handler))
    await flush()
    expect(writeLog).not.toHaveBeenCalled()
  })

  it('admin POST 成功 → 写日志 result=SUCCESS + payload 透传', async () => {
    const req: MockReq = {
      method: 'POST',
      url: '/api/v1/admin/merchant/M1/audit',
      path: '/api/v1/admin/merchant/M1/audit',
      headers: { 'x-trace-id': 'tr-1', 'user-agent': 'JestUA' },
      body: { reason: 'pass' },
      ip: '10.0.0.5',
      user: { uid: 'A1', username: 'alice' }
    }
    const handler: CallHandler = { handle: () => of('OK') }
    const result = await lastValueFrom(interceptor.intercept(buildContext(req), handler))
    expect(result).toBe('OK')
    await flush()
    expect(writeLog).toHaveBeenCalledTimes(1)
    const arg = writeLog.mock.calls[0][0] as Record<string, unknown>
    expect(arg.adminId).toBe('A1')
    expect(arg.method).toBe('POST')
    expect(arg.path).toBe('/api/v1/admin/merchant/M1/audit')
    expect(arg.result).toBe('SUCCESS')
    expect(arg.payload).toEqual({ reason: 'pass' })
    expect(arg.traceId).toBe('tr-1')
    expect(arg.userAgent).toBe('JestUA')
    expect(arg.ip).toBe('10.0.0.5')
    expect(arg.resource).toBe('merchant')
  })

  it('login 敏感路径 → 不记 payload，仅 method+path', async () => {
    const req: MockReq = {
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      path: '/api/v1/admin/auth/login',
      headers: {},
      body: { username: 'root', password: 'secret' }
    }
    const handler: CallHandler = { handle: () => of('OK') }
    await lastValueFrom(interceptor.intercept(buildContext(req), handler))
    await flush()
    expect(writeLog).toHaveBeenCalledTimes(1)
    const arg = writeLog.mock.calls[0][0] as Record<string, unknown>
    expect(arg.payload).toBeUndefined()
    expect(arg.path).toBe('/api/v1/admin/auth/login')
  })

  it('业务异常 → 透传 + 写日志 FAIL', async () => {
    const req: MockReq = {
      method: 'DELETE',
      url: '/admin/order/9',
      path: '/admin/order/9',
      headers: {}
    }
    const handler: CallHandler = {
      handle: () => throwError(() => new Error('biz fail'))
    }
    await expect(lastValueFrom(interceptor.intercept(buildContext(req), handler))).rejects.toThrow(
      'biz fail'
    )
    await flush()
    expect(writeLog).toHaveBeenCalledTimes(1)
    const arg = writeLog.mock.calls[0][0] as Record<string, unknown>
    expect(arg.result).toBe('FAIL')
    expect(arg.errorMsg).toBe('biz fail')
    expect(arg.method).toBe('DELETE')
  })

  it('writeLog 自身抛错 → 不阻断业务（响应仍正常返回）', async () => {
    writeLog.mockRejectedValueOnce(new Error('persist down'))
    const req: MockReq = {
      method: 'PUT',
      url: '/admin/system/role/1',
      path: '/admin/system/role/1',
      headers: {}
    }
    const handler: CallHandler = { handle: () => of({ ok: true }) }
    const result = await lastValueFrom(interceptor.intercept(buildContext(req), handler))
    expect(result).toEqual({ ok: true })
  })

  it('X-Forwarded-For 多跳 → 取第一个', async () => {
    const req: MockReq = {
      method: 'POST',
      url: '/admin/x',
      path: '/admin/x',
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }
    }
    const handler: CallHandler = { handle: () => of('OK') }
    await lastValueFrom(interceptor.intercept(buildContext(req), handler))
    await flush()
    const arg = writeLog.mock.calls[0][0] as Record<string, unknown>
    expect(arg.ip).toBe('1.2.3.4')
  })

  it('非 HTTP 上下文 → 直接放行', async () => {
    const ctx = {
      getType: () => 'rpc',
      switchToHttp: () => {
        throw new Error('not http')
      }
    } as unknown as ExecutionContext
    const handler: CallHandler = { handle: () => of('ok') }
    const result = await lastValueFrom(interceptor.intercept(ctx, handler))
    expect(result).toBe('ok')
    await flush()
    expect(writeLog).not.toHaveBeenCalled()
  })
})
