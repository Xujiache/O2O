/**
 * @file realtime.service.spec.ts
 * @stage P9/Sprint 6 (W6.B.1)
 * @desc 单元测试：mock Server，断言 emit 调用 / try-catch 不抛错
 * @author Agent B (P9 Sprint 6)
 */

import { RealtimeService } from './realtime.service'

describe('RealtimeService', () => {
  let service: RealtimeService
  let emitSpy: jest.Mock
  let toSpy: jest.Mock
  let ofSpy: jest.Mock

  beforeEach(() => {
    service = new RealtimeService()
    emitSpy = jest.fn()
    toSpy = jest.fn().mockReturnValue({ emit: emitSpy })
    ofSpy = jest.fn().mockReturnValue({ emit: emitSpy, to: toSpy })
    service.setServer({ of: ofSpy })
  })

  describe('isReady / setServer', () => {
    it('setServer(null) 后 isReady=false', () => {
      service.setServer(null)
      expect(service.isReady()).toBe(false)
    })
    it('setServer(server) 后 isReady=true', () => {
      expect(service.isReady()).toBe(true)
    })
  })

  describe('pushToUser', () => {
    it('应推送到 namespace + 用户 room', () => {
      const ok = service.pushToUser('user', '123', 'order:status:changed', { orderId: 'O1' })
      expect(ok).toBe(true)
      expect(ofSpy).toHaveBeenCalledWith('/user')
      expect(toSpy).toHaveBeenCalledWith('user:123')
      expect(emitSpy).toHaveBeenCalledTimes(1)
      const [topic, env] = emitSpy.mock.calls[0]
      expect(topic).toBe('order:status:changed')
      expect(env).toMatchObject({ topic: 'order:status:changed', data: { orderId: 'O1' } })
      expect(typeof (env as { ts: number }).ts).toBe('number')
    })

    it('数字 userId 也应正确转换', () => {
      service.pushToUser('rider', 88, 'rider:dispatch:new', {})
      expect(toSpy).toHaveBeenCalledWith('rider:88')
    })

    it('server 未就绪应 warn 不抛错', () => {
      service.setServer(null)
      const ok = service.pushToUser('user', '1', 't', {})
      expect(ok).toBe(false)
    })

    it('emit 抛错应吞掉返回 false', () => {
      emitSpy.mockImplementation(() => {
        throw new Error('boom')
      })
      const ok = service.pushToUser('user', '1', 't', {})
      expect(ok).toBe(false)
    })
  })

  describe('pushToRoom', () => {
    it('应支持任意自定义 room', () => {
      const ok = service.pushToRoom('merchant', 'shop:42', 'merchant:order:new', {})
      expect(ok).toBe(true)
      expect(ofSpy).toHaveBeenCalledWith('/merchant')
      expect(toSpy).toHaveBeenCalledWith('shop:42')
    })

    it('server 未就绪应返回 false', () => {
      service.setServer(null)
      expect(service.pushToRoom('admin', 'r', 't', {})).toBe(false)
    })
  })

  describe('broadcast', () => {
    it('应在 namespace 上 emit（不进 to）', () => {
      const ok = service.broadcast('admin', 'admin:notice', { msg: 'hello' })
      expect(ok).toBe(true)
      expect(ofSpy).toHaveBeenCalledWith('/admin')
      expect(toSpy).not.toHaveBeenCalled()
      expect(emitSpy).toHaveBeenCalledTimes(1)
    })

    it('server 未就绪应返回 false 且不调 of', () => {
      service.setServer(null)
      const ok = service.broadcast('admin', 't', {})
      expect(ok).toBe(false)
      expect(ofSpy).not.toHaveBeenCalled()
    })

    it('内部抛错应捕获并返回 false', () => {
      ofSpy.mockImplementation(() => {
        throw new Error('boom')
      })
      const ok = service.broadcast('admin', 't', {})
      expect(ok).toBe(false)
    })
  })
})
