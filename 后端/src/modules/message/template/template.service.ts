/**
 * @file template.service.ts
 * @stage P3 / T3.13
 * @desc 消息模板 CRUD + 启动时 bootstrap 18+ 默认模板（缺失则插入）+ 模板渲染
 * @author 员工 B
 *
 * Bootstrap 策略：
 *   - 启动时遍历 TEMPLATE_REGISTRATIONS
 *   - 按 (template_code, channel) 唯一性检查；缺失则插入
 *   - 已存在的模板不覆盖（保留运营在后台手工调整的内容）
 *
 * 渲染：
 *   - replaceVars(template, vars) → 把 `{var}` 替换为 vars[var]，未定义占位符保留原样并 logger.warn
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { MessageTemplate } from '../../../entities'
import { SnowflakeId } from '../../../utils'
import {
  ChannelTypeName,
  MessageChannelType,
  TEMPLATE_REGISTRATIONS,
  TEMPLATE_REGISTRATIONS_MAP,
  TemplateRegistration
} from './template-codes'

@Injectable()
export class TemplateService implements OnModuleInit {
  private readonly logger = new Logger(TemplateService.name)

  /** 启动后内存缓存：(code+channel) → MessageTemplate */
  private cache = new Map<string, MessageTemplate>()

  constructor(
    @InjectRepository(MessageTemplate)
    private readonly templateRepo: Repository<MessageTemplate>
  ) {}

  /**
   * 模块启动钩子：bootstrap 默认 18+ 模板（缺失则插入）+ 预热缓存
   * 用途：NestJS lifecycle，无需手动调用
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.bootstrapDefaults()
      await this.warmCache()
      this.logger.log(
        `TemplateService 启动完成：默认 ${TEMPLATE_REGISTRATIONS.length} 个 code，DB 内当前 ${this.cache.size} 个模板（含通道维度）`
      )
    } catch (err) {
      // 启动期 DB 未就绪时不阻塞应用；运行期再次拉模板时会自动 lazy-load
      this.logger.warn(`TemplateService bootstrap 失败（DB 未就绪？）：${(err as Error).message}`)
    }
  }

  /**
   * 取模板（按 code + channel）
   * 参数：code 模板编码；channel 通道枚举
   * 返回值：MessageTemplate 或 null
   * 用途：MessageService.send 内分通道查找具体模板
   */
  async getTemplate(code: string, channel: MessageChannelType): Promise<MessageTemplate | null> {
    const cacheKey = this.cacheKey(code, channel)
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!
    }
    const t = await this.templateRepo.findOne({
      where: { templateCode: code, channel, isDeleted: 0, status: 1 }
    })
    if (t) this.cache.set(cacheKey, t)
    return t
  }

  /**
   * 取注册项（不查 DB；仅取代码内置元信息）
   * 参数：code
   * 返回值：TemplateRegistration | undefined
   * 用途：MessageService.send 在 DB 查询前先取启用通道列表
   */
  getRegistration(code: string): TemplateRegistration | undefined {
    return TEMPLATE_REGISTRATIONS_MAP.get(code)
  }

  /**
   * 模板变量渲染（{var} 替换）
   * 参数：template 含占位符 `{var}` 的字符串；vars 变量字典
   * 返回值：渲染后字符串（占位符未提供时保留原样并 warn）
   * 用途：Channel.send 之前最终确定标题/内容
   */
  render(template: string | null | undefined, vars: Record<string, unknown>): string {
    if (!template) return ''
    return template.replace(/\{(\w+)\}/g, (full, key: string) => {
      if (key in vars) return String(vars[key] ?? '')
      this.logger.warn(`模板变量缺失：{${key}}`)
      return full
    })
  }

  /**
   * 列出全部已注册的 code 清单（运营 / 测试用）
   * 返回值：string[]
   */
  listRegisteredCodes(): string[] {
    return TEMPLATE_REGISTRATIONS.map((r) => r.code)
  }

  /* ========== 内部辅助 ========== */

  /**
   * Bootstrap 默认模板：缺失则插入
   * 一个 code 可能对应多通道（多行 message_template，channel 不同，template_code 重复）
   * 注意：09_message.sql 把 `uk_template_code` 设为 UNIQUE 单字段。
   *       为兼容多通道场景，本服务 DB 查询用 (code, channel) 复合判定；
   *       insert 时若 UNIQUE 冲突，自动跳过该通道（依赖 ORM 异常）
   */
  private async bootstrapDefaults(): Promise<void> {
    for (const reg of TEMPLATE_REGISTRATIONS) {
      for (const channel of reg.channels) {
        const exists = await this.templateRepo.findOne({
          where: { templateCode: reg.code, channel, isDeleted: 0 }
        })
        if (exists) continue
        // SQL UNIQUE 约束允许 (code, channel) 组合的 cache 维度；若 unique 仅 code
        // 则后续通道使用同一行（content 一致），跳过插入
        const sameCodeAny = await this.templateRepo.findOne({
          where: { templateCode: reg.code, isDeleted: 0 }
        })
        if (sameCodeAny) {
          // 已有同 code 行（其他通道）→ 模板内容共享，无需为每通道插入
          this.logger.verbose(
            `模板 ${reg.code} 已存在（通道 ${ChannelTypeName[sameCodeAny.channel as MessageChannelType] ?? sameCodeAny.channel}），跳过 ${ChannelTypeName[channel]}`
          )
          continue
        }
        const e = this.templateRepo.create({
          id: SnowflakeId.next(),
          tenantId: 1,
          templateCode: reg.code,
          templateName: reg.name,
          channel,
          targetType: reg.targetType,
          bizScene: reg.bizScene,
          externalTemplateId: null,
          titleTemplate: reg.titleTemplate ?? null,
          contentTemplate: reg.contentTemplate,
          varSchema: null,
          priority: reg.priority ?? 1,
          status: 1,
          isDeleted: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null
        })
        try {
          await this.templateRepo.save(e)
          this.logger.log(`Bootstrap 模板：${reg.code} (${ChannelTypeName[channel]})`)
        } catch (err) {
          // UNIQUE 冲突等 → 容错跳过
          this.logger.verbose(
            `Bootstrap ${reg.code}/${ChannelTypeName[channel]} 跳过：${(err as Error).message}`
          )
        }
      }
    }
  }

  /**
   * 把 DB 内全量模板预热到内存缓存
   */
  private async warmCache(): Promise<void> {
    const all = await this.templateRepo.find({ where: { isDeleted: 0, status: 1 } })
    for (const t of all) {
      this.cache.set(this.cacheKey(t.templateCode, t.channel as MessageChannelType), t)
    }
  }

  private cacheKey(code: string, channel: MessageChannelType): string {
    return `${code}:${channel}`
  }
}
