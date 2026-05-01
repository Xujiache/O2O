/**
 * @file push-token.service.spec.ts
 * @stage P9 Sprint 5 / W5.E.3
 * @desc PushTokenService 单元测试：register / unregister / heartbeat / cleanInactive / findActiveByUser
 *
 * 测试策略：
 *   - mock Repository<PushToken>：findOne / save / find / createQueryBuilder().update()...execute()
 *   - 不连接真实 DB，所有 SQL 行为通过 jest.fn() 验证
 *
 * @author Agent E (P9 Sprint 5)
 */

import { PushTokenService } from './push-token.service'
import type { Repository } from 'typeorm'
import type { PushToken } from '@/entities'

/* ============================================================================
 * Helpers
 * ============================================================================ */

interface QbExecuteResult {
  affected: number
}

interface MockUpdateChain {
  set: jest.Mock
  where: jest.Mock
  andWhere: jest.Mock
  execute: jest.Mock
}

function makeUpdateChain(execResult: QbExecuteResult): MockUpdateChain {
  const chain: MockUpdateChain = {
    set: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    execute: jest.fn().mockResolvedValue(execResult)
  }
  chain.set.mockReturnValue(chain)
  chain.where.mockReturnValue(chain)
  chain.andWhere.mockReturnValue(chain)
  return chain
}

function makeRepo(): {
  repo: Repository<PushToken>
  findOne: jest.Mock
  save: jest.Mock
  find: jest.Mock
  create: jest.Mock
  qbUpdate: MockUpdateChain
  createQueryBuilder: jest.Mock
} {
  const findOne = jest.fn()
  const save = jest.fn()
  const find = jest.fn()
  const create = jest.fn().mockImplementation((x: unknown) => x)
  const qbUpdate = makeUpdateChain({ affected: 1 })
  const createQueryBuilder = jest.fn().mockReturnValue({
    update: jest.fn().mockReturnValue(qbUpdate)
  })

  const repo = {
    findOne,
    save,
    find,
    create,
    createQueryBuilder
  } as unknown as Repository<PushToken>

  return { repo, findOne, save, find, create, qbUpdate, createQueryBuilder }
}

/* ============================================================================
 * Tests
 * ============================================================================ */

describe('PushTokenService', () => {
  /* ============================================================================ */
  /* 1) register 新建路径                                                          */
  /* ============================================================================ */
  it('register 不存在 → 新建 + 返回 ok=true / message=created', async () => {
    const { repo, findOne, save, create } = makeRepo()
    findOne.mockResolvedValue(null)
    save.mockImplementation(async (x: unknown) => x)

    const svc = new PushTokenService(repo)
    const r = await svc.register({
      userId: 'u-1',
      userType: 1,
      platform: 'ios',
      registrationId: 'RID-1',
      deviceId: 'd-1',
      appVersion: '1.2.3'
    })
    expect(r.ok).toBe(true)
    expect(r.message).toBe('created')
    expect(create).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledTimes(1)
    /* 雪花 id 已挂上 */
    expect(typeof r.id).toBe('string')
    expect(r.id?.length).toBeGreaterThan(0)
  })

  /* ============================================================================ */
  /* 2) register UPSERT：已存在 → 更新                                              */
  /* ============================================================================ */
  it('register 已存在 → 更新 registration_id + last_active_at + isDeleted=0', async () => {
    const { repo, findOne, save } = makeRepo()
    const existing = {
      id: 'EXIST-1',
      userId: 'u-1',
      userType: 1,
      platform: 'ios',
      registrationId: 'OLD-RID',
      deviceId: 'd-1',
      appVersion: '0.9.0',
      lastActiveAt: new Date('2025-01-01'),
      isDeleted: 1
    } as unknown as PushToken
    findOne.mockResolvedValue(existing)
    save.mockImplementation(async (x: unknown) => x)

    const svc = new PushTokenService(repo)
    const r = await svc.register({
      userId: 'u-1',
      userType: 1,
      platform: 'ios',
      registrationId: 'NEW-RID',
      deviceId: 'd-1',
      appVersion: '1.2.3'
    })
    expect(r.ok).toBe(true)
    expect(r.id).toBe('EXIST-1')
    expect(r.message).toBe('updated')
    expect(existing.registrationId).toBe('NEW-RID')
    expect(existing.appVersion).toBe('1.2.3')
    expect(existing.isDeleted).toBe(0)
    /* lastActiveAt 已被更新 */
    expect(existing.lastActiveAt.getTime()).toBeGreaterThan(new Date('2025-01-01').getTime())
  })

  /* ============================================================================ */
  /* 3) register 入参缺失                                                           */
  /* ============================================================================ */
  it('register 入参缺失 userId/registrationId/platform → ok=false + param_empty', async () => {
    const { repo } = makeRepo()
    const svc = new PushTokenService(repo)

    const r1 = await svc.register({
      userId: '',
      userType: 1,
      platform: 'ios',
      registrationId: 'X'
    })
    expect(r1.ok).toBe(false)
    expect(r1.message).toBe('param_empty')

    const r2 = await svc.register({
      userId: 'u',
      userType: 1,
      platform: 'ios',
      registrationId: ''
    })
    expect(r2.ok).toBe(false)
  })

  /* ============================================================================ */
  /* 4) unregister 指定 deviceId                                                    */
  /* ============================================================================ */
  it('unregister 指定 deviceId → 仅注销该设备 + andWhere device_id', async () => {
    const { repo, qbUpdate } = makeRepo()
    qbUpdate.execute.mockResolvedValue({ affected: 1 })

    const svc = new PushTokenService(repo)
    const r = await svc.unregister('u-1', 1, 'd-1')
    expect(r.ok).toBe(true)
    expect(r.message).toBe('affected_1')

    /* andWhere 至少调用 3 次：user_type / is_deleted / device_id */
    expect(qbUpdate.andWhere).toHaveBeenCalled()
    const calls = qbUpdate.andWhere.mock.calls.map((c) => c[0])
    expect(calls).toContain('device_id = :did')
  })

  /* ============================================================================ */
  /* 5) unregister 不指定 deviceId → 全部                                           */
  /* ============================================================================ */
  it('unregister 不指定 deviceId → 不带 device_id 条件', async () => {
    const { repo, qbUpdate } = makeRepo()
    qbUpdate.execute.mockResolvedValue({ affected: 3 })

    const svc = new PushTokenService(repo)
    const r = await svc.unregister('u-1', 2)
    expect(r.ok).toBe(true)
    expect(r.message).toBe('affected_3')

    const calls = qbUpdate.andWhere.mock.calls.map((c) => c[0])
    expect(calls).not.toContain('device_id = :did')
  })

  /* ============================================================================ */
  /* 6) unregister userId 空                                                        */
  /* ============================================================================ */
  it('unregister userId 空 → ok=false param_empty', async () => {
    const { repo } = makeRepo()
    const svc = new PushTokenService(repo)
    const r = await svc.unregister('', 1)
    expect(r.ok).toBe(false)
    expect(r.message).toBe('param_empty')
  })

  /* ============================================================================ */
  /* 7) heartbeat 影响行数                                                          */
  /* ============================================================================ */
  it('heartbeat 更新 last_active_at + 返回 affected_<n>', async () => {
    const { repo, qbUpdate } = makeRepo()
    qbUpdate.execute.mockResolvedValue({ affected: 2 })

    const svc = new PushTokenService(repo)
    const r = await svc.heartbeat('u-1', 1)
    expect(r.ok).toBe(true)
    expect(r.message).toBe('affected_2')
    expect(qbUpdate.set).toHaveBeenCalledWith({ lastActiveAt: expect.any(Date) })
  })

  /* ============================================================================ */
  /* 8) cleanInactive                                                               */
  /* ============================================================================ */
  it('cleanInactive：用 LessThan(threshold) + 影响行数返回', async () => {
    const { repo, qbUpdate } = makeRepo()
    qbUpdate.execute.mockResolvedValue({ affected: 5 })

    const svc = new PushTokenService(repo)
    const n = await svc.cleanInactive(7)
    expect(n).toBe(5)

    /* set 中是 isDeleted=2 */
    const setArg = qbUpdate.set.mock.calls[0][0] as Record<string, unknown>
    expect(setArg.isDeleted).toBe(2)
  })

  /* ============================================================================ */
  /* 9) findActiveByUser                                                            */
  /* ============================================================================ */
  it('findActiveByUser 走 repo.find + isDeleted=0', async () => {
    const { repo, find } = makeRepo()
    find.mockResolvedValue([{ id: '1' }, { id: '2' }])

    const svc = new PushTokenService(repo)
    const list = await svc.findActiveByUser('u-1', 3)
    expect(list).toHaveLength(2)
    expect(find).toHaveBeenCalledWith({
      where: { userId: 'u-1', userType: 3, isDeleted: 0 },
      order: { lastActiveAt: 'DESC' }
    })
  })

  /* ============================================================================ */
  /* 10) findActiveByUser userId 空                                                 */
  /* ============================================================================ */
  it('findActiveByUser userId 空 → 直接返回空数组', async () => {
    const { repo, find } = makeRepo()
    const svc = new PushTokenService(repo)
    const list = await svc.findActiveByUser('', 1)
    expect(list).toEqual([])
    expect(find).not.toHaveBeenCalled()
  })
})
