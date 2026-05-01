/**
 * @file realtime.gateway.spec.ts
 * @stage P9/Sprint 6 (W6.B.1)
 * @desc 单元测试：mock client + JWT，断言连接 / 订阅 / 心跳 / 断开
 * @author Agent B (P9 Sprint 6)
 */

import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { WsJwtGuard } from './guards/ws-jwt.guard'
import { GatewayClient, RealtimeGateway } from './realtime.gateway'
import { RealtimeService } from './realtime.service'

interface MutableClient extends GatewayClient {
  joinedRooms: string[]
  leftRooms: string[]
  emitted: { event: string; payload?: unknown }[]
  disconnected: boolean
}

function makeClient(
  opts: {
    ns?: string
    token?: string | null
    query?: { token?: string }
  } = {}
): MutableClient {
  const c: MutableClient = {
    id: 'sock-1',
    nsp: { name: opts.ns ?? '/user' },
    handshake: {
      auth: opts.token ? { token: opts.token } : undefined,
      query: opts.query,
      headers: {}
    },
    data: {},
    joinedRooms: [],
    leftRooms: [],
    emitted: [],
    disconnected: false,
    join(this: MutableClient, room: string): void {
      this.joinedRooms.push(room)
    },
    leave(this: MutableClient, room: string): void {
      this.leftRooms.push(room)
    },
    emit(this: MutableClient, event: string, payload?: unknown): boolean {
      this.emitted.push({ event, payload })
      return true
    },
    disconnect(this: MutableClient): void {
      this.disconnected = true
    }
  }
  return c
}

describe('RealtimeGateway', () => {
  let gateway: RealtimeGateway
  let realtimeService: RealtimeService
  let guard: WsJwtGuard
  let jwt: JwtService
  let config: ConfigService

  beforeEach(() => {
    jwt = { verifyAsync: jest.fn() } as unknown as JwtService
    config = {
      get: jest.fn().mockImplementation((k: string) => (k === 'jwt.secret' ? 'test-secret' : null))
    } as unknown as ConfigService
    guard = new WsJwtGuard(jwt, config)
    realtimeService = new RealtimeService()
    gateway = new RealtimeGateway(guard, realtimeService)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('afterInit', () => {
    it('应把 server 注入到 RealtimeService', () => {
      const fakeServer = { of: jest.fn() }
      gateway.afterInit(fakeServer)
      expect(realtimeService.isReady()).toBe(true)
    })
  })

  describe('handleConnection', () => {
    it('JWT 通过 + namespace 匹配 → join 用户 room', async () => {
      ;(jwt.verifyAsync as jest.Mock).mockResolvedValue({
        uid: 'U001',
        userType: 'user',
        tenantId: 1,
        ver: 1,
        iat: 0,
        exp: 9999
      })
      const c = makeClient({ ns: '/user', token: 'tok' })
      const ok = await gateway.handleConnection(c)
      expect(ok).toBe(true)
      expect(c.joinedRooms).toEqual(['user:U001'])
      expect(c.disconnected).toBe(false)
    })

    it('无 token → 断开', async () => {
      const c = makeClient({ ns: '/user' })
      const ok = await gateway.handleConnection(c)
      expect(ok).toBe(false)
      expect(c.disconnected).toBe(true)
    })

    it('JWT 验签失败 → 断开', async () => {
      ;(jwt.verifyAsync as jest.Mock).mockRejectedValue(new Error('invalid signature'))
      const c = makeClient({ ns: '/user', token: 'bad' })
      const ok = await gateway.handleConnection(c)
      expect(ok).toBe(false)
      expect(c.disconnected).toBe(true)
    })

    it('namespace 与 userType 不匹配 → 断开', async () => {
      ;(jwt.verifyAsync as jest.Mock).mockResolvedValue({
        uid: 'A1',
        userType: 'admin',
        tenantId: 1,
        ver: 1,
        iat: 0,
        exp: 9999
      })
      const c = makeClient({ ns: '/user', token: 'tok' })
      const ok = await gateway.handleConnection(c)
      expect(ok).toBe(false)
      expect(c.disconnected).toBe(true)
    })

    it('未知 namespace → 断开', async () => {
      ;(jwt.verifyAsync as jest.Mock).mockResolvedValue({
        uid: 'X',
        userType: 'user',
        tenantId: 1,
        ver: 1,
        iat: 0,
        exp: 9999
      })
      const c = makeClient({ ns: '/unknown', token: 'tok' })
      const ok = await gateway.handleConnection(c)
      expect(ok).toBe(false)
      expect(c.disconnected).toBe(true)
    })

    it('支持 query.token 取 JWT', async () => {
      ;(jwt.verifyAsync as jest.Mock).mockResolvedValue({
        uid: 'U2',
        userType: 'user',
        tenantId: 1,
        ver: 1,
        iat: 0,
        exp: 9999
      })
      const c = makeClient({ ns: '/user', query: { token: 'qtok' } })
      const ok = await gateway.handleConnection(c)
      expect(ok).toBe(true)
      expect(jwt.verifyAsync).toHaveBeenCalledWith(
        'qtok',
        expect.objectContaining({ secret: 'test-secret' })
      )
    })
  })

  describe('handleSubscribe / handleUnsubscribe', () => {
    function authedClient(): MutableClient {
      const c = makeClient({ ns: '/user' })
      c.data = {
        user: {
          uid: 'U001',
          userType: 'user',
          tenantId: 1,
          ver: 1,
          iat: 0,
          exp: 9999
        }
      }
      return c
    }

    it('合法 topic → join `${userType}:${uid}:${topic}`', async () => {
      const c = authedClient()
      const ack = await gateway.handleSubscribe(c, { topic: 'order:status' })
      expect(ack).toEqual({ ok: true, topic: 'order:status' })
      expect(c.joinedRooms).toEqual(['user:U001:order:status'])
    })

    it('topic 含非法字符 → 拒绝', async () => {
      const c = authedClient()
      const ack = await gateway.handleSubscribe(c, { topic: 'a b c' })
      expect(ack.ok).toBe(false)
    })

    it('未认证客户端 → 拒绝', async () => {
      const c = makeClient({ ns: '/user' })
      const ack = await gateway.handleSubscribe(c, { topic: 'order' })
      expect(ack).toEqual({ ok: false, topic: 'order', reason: 'unauthenticated' })
    })

    it('取消订阅 → leave', async () => {
      const c = authedClient()
      const ack = await gateway.handleUnsubscribe(c, { topic: 'order' })
      expect(ack).toEqual({ ok: true, topic: 'order' })
      expect(c.leftRooms).toEqual(['user:U001:order'])
    })

    it('取消订阅未认证 → 拒绝', async () => {
      const c = makeClient({ ns: '/user' })
      const ack = await gateway.handleUnsubscribe(c, { topic: 'order' })
      expect(ack.ok).toBe(false)
    })
  })

  describe('handlePing (心跳)', () => {
    it('应 emit pong + 返回 ts', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-05-01T00:00:00Z'))
      const c = makeClient({ ns: '/user' })
      const pong = gateway.handlePing(c)
      expect(pong.type).toBe('pong')
      expect(pong.ts).toBe(new Date('2026-05-01T00:00:00Z').getTime())
      expect(c.emitted).toEqual([{ event: 'pong', payload: pong }])
    })

    it('client.emit 抛错应被吞掉', () => {
      const c = makeClient({ ns: '/user' })
      c.emit = (): boolean => {
        throw new Error('boom')
      }
      expect(() => gateway.handlePing(c)).not.toThrow()
    })
  })

  describe('handleDisconnect', () => {
    it('断开钩子不抛错', () => {
      const c = makeClient({ ns: '/user' })
      expect(() => gateway.handleDisconnect(c)).not.toThrow()
    })
  })
})

describe('WsJwtGuard', () => {
  let jwt: JwtService
  let config: ConfigService
  let guard: WsJwtGuard

  beforeEach(() => {
    jwt = { verifyAsync: jest.fn() } as unknown as JwtService
    config = {
      get: jest.fn().mockImplementation((k: string) => (k === 'jwt.secret' ? 'sec' : null))
    } as unknown as ConfigService
    guard = new WsJwtGuard(jwt, config)
  })

  it('Authorization Bearer header 取 token', async () => {
    ;(jwt.verifyAsync as jest.Mock).mockResolvedValue({
      uid: 'U1',
      userType: 'user',
      tenantId: 1,
      ver: 1,
      iat: 0,
      exp: 1
    })
    const client = {
      handshake: { headers: { authorization: 'Bearer hdr-tok' } },
      data: {}
    }
    const ok = await guard.verifyClient(client)
    expect(ok).toBe(true)
    expect(jwt.verifyAsync).toHaveBeenCalledWith('hdr-tok', expect.any(Object))
  })

  it('jwt.secret 缺失抛 WsException', async () => {
    ;(config.get as jest.Mock).mockReturnValue(null)
    await expect(guard.verifyClient({ handshake: { auth: { token: 't' } } })).rejects.toThrow(
      /JWT 配置/
    )
  })

  it('payload 字段缺失 → 抛 WsException', async () => {
    ;(jwt.verifyAsync as jest.Mock).mockResolvedValue({ uid: '' })
    await expect(guard.verifyClient({ handshake: { auth: { token: 't' } } })).rejects.toThrow(/JWT/)
  })

  it('无 token → 抛 WsException', async () => {
    await expect(guard.verifyClient({ handshake: {} })).rejects.toThrow(/未提供/)
  })

  it('canActivate(ExecutionContext) 兼容路径', async () => {
    ;(jwt.verifyAsync as jest.Mock).mockResolvedValue({
      uid: 'U1',
      userType: 'user',
      tenantId: 1,
      ver: 1,
      iat: 0,
      exp: 1
    })
    const client = { handshake: { auth: { token: 'tk' } }, data: {} }
    const ctx = {
      switchToWs: () => ({ getClient: <T>(): T => client as unknown as T }),
      getArgs: <T>(): T => [client] as unknown as T
    } as unknown as Parameters<typeof guard.canActivate>[0]
    await expect(guard.canActivate(ctx)).resolves.toBe(true)
  })
})
