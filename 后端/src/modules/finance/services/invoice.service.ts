/**
 * @file invoice.service.ts
 * @stage P4/T4.34（Sprint 5）
 * @desc 发票服务：申请 → 审核 → 开票（mock PDF + 邮件）3 阶段闭环
 * @author 单 Agent V2.0
 *
 * 状态机（与 finance.types.ts InvoiceStatusEnum 对齐）：
 *   apply  → 0 申请
 *   audit pass  → 0 → 1 开票中
 *   audit reject → 0 → 3 失败 + errorMsg
 *   issue  → 1 → 2 已开 + pdfUrl + eInvoiceNo + issuedAt + 邮件通知
 *
 * 入参校验：
 *   - orderNos 数组非空、每个 18 位
 *   - amount 校验：service 层不深度校验订单总额（订单分表跨表查询代价大；本期信任入参，
 *     依赖前端在下单/订单详情页限制输入；超出可走客服流程作废）
 *   - mobile / email 至少传一个；mobile 走 CryptoUtil 三件套
 *
 * 鉴权约束（service.assertOwner）：
 *   - 用户端：applicantType=1 + applicantId === currentUser.uid
 *   - 商户端：applicantType=2 + applicantId === currentUser.uid
 *   - 管理端：可查所有
 *
 * 注：本期不真接入第三方开票通道；issue() 内部 mock 生成 PDF URL（占位）+ 邮件通知
 */

import { Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import BigNumber from 'bignumber.js'
import { Repository } from 'typeorm'
import { BizErrorCode, BusinessException, type PageResult, makePageResult } from '@/common'
import { Invoice } from '@/entities'
import { MessageService } from '@/modules/message/message.service'
import { OperationLogService } from '@/modules/user/services/operation-log.service'
import { CryptoUtil, SnowflakeId, generateBizNo } from '@/utils'
import {
  type AuditInvoiceDto,
  type CreateInvoiceDto,
  type InvoiceVo,
  type IssueInvoiceDto,
  type QueryInvoiceDto
} from '../dto/invoice.dto'
import {
  type InvoiceApplicantType,
  InvoiceStatusEnum,
  type InvoiceStatus,
  type InvoiceTitleType,
  InvoiceTitleTypeEnum,
  type InvoiceType
} from '../types/finance.types'

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name)

  constructor(
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    private readonly operationLogService: OperationLogService,
    @Optional() private readonly messageService?: MessageService
  ) {}

  /* ==========================================================================
   * 一、apply —— 用户/商户申请发票
   * ========================================================================== */

  /**
   * 申请发票
   *
   * 流程：
   *   1) 校验 orderNos 非空 + 校验 amount > 0
   *   2) 校验企业抬头必须填 taxNo
   *   3) 校验 mobile / email 至少传一个
   *   4) 加密 mobile（CryptoUtil 三件套）
   *   5) INSERT invoice(status=0)
   *
   * 参数：
   *   applicantType  1 用户 / 2 商户
   *   applicantId    主体 ID
   *   dto            CreateInvoiceDto
   * 返回值：InvoiceVo
   */
  async apply(
    applicantType: InvoiceApplicantType,
    applicantId: string,
    dto: CreateInvoiceDto
  ): Promise<InvoiceVo> {
    if (!dto.orderNos || dto.orderNos.length === 0) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, '至少关联 1 笔订单')
    }
    /* 订单号去重 */
    const uniqueOrderNos = Array.from(new Set(dto.orderNos))

    const amount = new BigNumber(dto.amount)
    if (amount.isNaN() || amount.lte(0)) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'amount 必须为正数')
    }

    if (
      dto.titleType === InvoiceTitleTypeEnum.ENTERPRISE &&
      (!dto.taxNo || dto.taxNo.length < 15)
    ) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, '企业抬头必须填 15 位以上税号')
    }

    if (!dto.email && !dto.mobile) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, 'email / mobile 至少传一个')
    }

    /* 加密 mobile（如有） */
    let mobileEnc: Buffer | null = null
    let mobileTail4: string | null = null
    if (dto.mobile) {
      mobileEnc = CryptoUtil.encrypt(dto.mobile)
      mobileTail4 = CryptoUtil.tail4(dto.mobile)
    }

    const invoiceNo = generateBizNo('I')
    const now = new Date()
    const entity = this.invoiceRepo.create({
      id: SnowflakeId.next(),
      tenantId: 1,
      invoiceNo,
      applicantType,
      applicantId,
      orderNos: uniqueOrderNos,
      invoiceType: dto.invoiceType,
      titleType: dto.titleType,
      title: dto.title,
      taxNo: dto.taxNo ?? null,
      registerAddr: dto.registerAddr ?? null,
      registerPhone: dto.registerPhone ?? null,
      bankName: dto.bankName ?? null,
      bankAccount: dto.bankAccount ?? null,
      amount: amount.toFixed(2),
      email: dto.email ?? null,
      mobileEnc,
      mobileTail4,
      encKeyVer: 1,
      status: InvoiceStatusEnum.APPLIED,
      pdfUrl: null,
      eInvoiceNo: null,
      issuedAt: null,
      errorMsg: null,
      isDeleted: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    })
    const saved = await this.invoiceRepo.save(entity)
    this.logger.log(
      `[invoice.apply] ${invoiceNo} applicant=${applicantType}:${applicantId} amount=${amount.toFixed(2)} orders=${uniqueOrderNos.length}`
    )
    return this.toVo(saved)
  }

  /* ==========================================================================
   * 二、audit —— 管理端审核
   * ========================================================================== */

  /**
   * 发票审核
   *
   * 状态流转：
   *   pass  → 0 → 1 开票中
   *   reject → 0 → 3 失败 + errorMsg
   */
  async audit(id: string, dto: AuditInvoiceDto, opAdminId: string): Promise<InvoiceVo> {
    const invoice = await this.findActiveById(id)
    if (invoice.status !== InvoiceStatusEnum.APPLIED) {
      throw new BusinessException(
        BizErrorCode.BIZ_STATE_INVALID,
        `当前状态 ${invoice.status} 不允许审核`
      )
    }
    const now = new Date()
    if (dto.action === 'reject') {
      invoice.status = InvoiceStatusEnum.FAILED
      invoice.errorMsg = (dto.remark ?? '审核驳回').slice(0, 255)
      invoice.updatedAt = now
      const saved = await this.invoiceRepo.save(invoice)
      await this.operationLogService.write({
        opAdminId,
        module: 'finance',
        action: 'audit',
        resourceType: 'invoice',
        resourceId: id,
        description: `驳回发票 ${invoice.invoiceNo}：${dto.remark ?? ''}`
      })
      return this.toVo(saved)
    }
    invoice.status = InvoiceStatusEnum.ISSUING
    invoice.errorMsg = null
    invoice.updatedAt = now
    const saved = await this.invoiceRepo.save(invoice)
    await this.operationLogService.write({
      opAdminId,
      module: 'finance',
      action: 'audit',
      resourceType: 'invoice',
      resourceId: id,
      description: `通过发票 ${invoice.invoiceNo}（金额 ${invoice.amount}）`
    })
    this.logger.log(`[invoice.audit] ${invoice.invoiceNo} PASS by ${opAdminId} → 进入开票中`)
    return this.toVo(saved)
  }

  /* ==========================================================================
   * 三、issue —— 开票（mock 生成 PDF + 邮件）
   * ========================================================================== */

  /**
   * 开票（管理端 POST /admin/invoices/:id/issue）
   *
   * 流程：
   *   1) 校验 status=1 开票中
   *   2) 生成 mock PDF URL（占位，例如 https://mock-cdn/invoices/IV...xxx.pdf）
   *   3) 生成 mock e_invoice_no（不传则用 SnowflakeId）
   *   4) UPDATE invoice SET status=2, pdf_url=?, e_invoice_no=?, issued_at=NOW
   *   5) 异步发送 INVOICE_ISSUED 邮件 / 站内信通知（best-effort）
   *
   * 参数：id；dto IssueInvoiceDto；opAdminId
   * 返回值：InvoiceVo
   */
  async issue(id: string, dto: IssueInvoiceDto, opAdminId: string): Promise<InvoiceVo> {
    const invoice = await this.findActiveById(id)
    if (invoice.status !== InvoiceStatusEnum.ISSUING) {
      throw new BusinessException(
        BizErrorCode.BIZ_STATE_INVALID,
        `当前状态 ${invoice.status} 不允许开票`
      )
    }

    const now = new Date()
    const eInvoiceNo = dto.eInvoiceNo ?? `MOCK_${SnowflakeId.next()}`
    const pdfUrl = this.generateMockPdfUrl(invoice.invoiceNo)

    invoice.status = InvoiceStatusEnum.ISSUED
    invoice.pdfUrl = pdfUrl
    invoice.eInvoiceNo = eInvoiceNo
    invoice.issuedAt = now
    invoice.errorMsg = null
    invoice.updatedAt = now
    const saved = await this.invoiceRepo.save(invoice)

    await this.operationLogService.write({
      opAdminId,
      module: 'finance',
      action: 'issue',
      resourceType: 'invoice',
      resourceId: id,
      description: `开票成功 ${invoice.invoiceNo}（金额 ${invoice.amount}）pdf=${pdfUrl}`,
      extra: { mock: true, eInvoiceNo, remark: dto.remark }
    })
    this.logger.log(`[invoice.issue] ${invoice.invoiceNo} ISSUED by ${opAdminId} pdf=${pdfUrl}`)

    void this.notifyInvoiceIssued(saved)
    return this.toVo(saved)
  }

  /* ==========================================================================
   * 四、查询 API
   * ========================================================================== */

  /**
   * 我的发票列表（用户/商户端）
   */
  async listMine(
    applicantType: InvoiceApplicantType,
    applicantId: string,
    query: QueryInvoiceDto
  ): Promise<PageResult<InvoiceVo>> {
    const qb = this.invoiceRepo
      .createQueryBuilder('i')
      .where('i.is_deleted = 0')
      .andWhere('i.applicant_type = :at', { at: applicantType })
      .andWhere('i.applicant_id = :ai', { ai: applicantId })
    if (query.status !== undefined) qb.andWhere('i.status = :s', { s: query.status })
    qb.orderBy('i.created_at', 'DESC')
      .addOrderBy('i.id', 'DESC')
      .skip(query.skip())
      .take(query.take())
    const [rows, total] = await qb.getManyAndCount()
    return makePageResult(
      rows.map((r) => this.toVo(r)),
      total,
      query.page ?? 1,
      query.pageSize ?? 20
    )
  }

  /**
   * 管理端工作台列表
   */
  async listAdmin(query: QueryInvoiceDto): Promise<PageResult<InvoiceVo>> {
    const qb = this.invoiceRepo.createQueryBuilder('i').where('i.is_deleted = 0')
    if (query.status !== undefined) qb.andWhere('i.status = :s', { s: query.status })
    if (query.applicantType !== undefined)
      qb.andWhere('i.applicant_type = :at', { at: query.applicantType })
    if (query.applicantId) qb.andWhere('i.applicant_id = :ai', { ai: query.applicantId })
    qb.orderBy('i.created_at', 'DESC')
      .addOrderBy('i.id', 'DESC')
      .skip(query.skip())
      .take(query.take())
    const [rows, total] = await qb.getManyAndCount()
    return makePageResult(
      rows.map((r) => this.toVo(r)),
      total,
      query.page ?? 1,
      query.pageSize ?? 20
    )
  }

  /**
   * 详情（管理端 / 申请方查看；service 层不做 owner 校验，由 controller 比较 applicantId）
   */
  async detail(id: string): Promise<InvoiceVo> {
    const invoice = await this.findActiveById(id)
    return this.toVo(invoice)
  }

  /**
   * 校验申请方持有该发票（被 controller 在用户/商户端调用）
   * 错误：非本人 → AUTH_PERMISSION_DENIED
   */
  async assertOwner(
    id: string,
    applicantType: InvoiceApplicantType,
    applicantId: string
  ): Promise<Invoice> {
    const inv = await this.findActiveById(id)
    if (inv.applicantType !== applicantType || inv.applicantId !== applicantId) {
      throw new BusinessException(BizErrorCode.AUTH_PERMISSION_DENIED, '非本人发票，无权访问')
    }
    return inv
  }

  /* ==========================================================================
   * 五、内部
   * ========================================================================== */

  /**
   * 找一条未删除的发票
   */
  private async findActiveById(id: string): Promise<Invoice> {
    const r = await this.invoiceRepo.findOne({ where: { id, isDeleted: 0 } })
    if (!r) {
      throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '发票不存在')
    }
    return r
  }

  /**
   * 生成 mock PDF URL（占位；真实接入时替换为开票通道返回）
   */
  private generateMockPdfUrl(invoiceNo: string): string {
    return `https://mock-cdn.o2o.local/invoices/${invoiceNo}.pdf`
  }

  /**
   * 银行账号脱敏：仅末 4 位
   */
  private maskBankAccount(plain: string | null): string | null {
    if (!plain) return null
    return plain.length <= 4 ? plain : plain.slice(-4)
  }

  /**
   * Entity → VO
   */
  private toVo(invoice: Invoice): InvoiceVo {
    return {
      id: invoice.id,
      invoiceNo: invoice.invoiceNo,
      applicantType: invoice.applicantType as InvoiceApplicantType,
      applicantId: invoice.applicantId,
      orderNos: Array.isArray(invoice.orderNos) ? invoice.orderNos : [],
      invoiceType: invoice.invoiceType as InvoiceType,
      titleType: invoice.titleType as InvoiceTitleType,
      title: invoice.title,
      taxNo: invoice.taxNo,
      registerAddr: invoice.registerAddr,
      registerPhone: invoice.registerPhone,
      bankName: invoice.bankName,
      bankAccountTail4: this.maskBankAccount(invoice.bankAccount),
      amount: invoice.amount,
      email: invoice.email,
      mobileTail4: invoice.mobileTail4,
      status: invoice.status as InvoiceStatus,
      pdfUrl: invoice.pdfUrl,
      eInvoiceNo: invoice.eInvoiceNo,
      issuedAt: invoice.issuedAt,
      errorMsg: invoice.errorMsg,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt
    }
  }

  /**
   * 异步通知开票成功（best-effort：模板缺失 / MessageService 未注入均不阻断）
   */
  private async notifyInvoiceIssued(invoice: Invoice): Promise<void> {
    if (!this.messageService) return
    try {
      await this.messageService.send({
        code: 'INVOICE_ISSUED',
        targetType: invoice.applicantType as 1 | 2 | 3 | 4,
        targetId: invoice.applicantId,
        targetAddress: invoice.email ?? undefined,
        vars: {
          invoiceNo: invoice.invoiceNo,
          amount: invoice.amount,
          pdfUrl: invoice.pdfUrl ?? '',
          eInvoiceNo: invoice.eInvoiceNo ?? ''
        },
        category: 6,
        relatedNo: invoice.invoiceNo
      })
    } catch (err) {
      this.logger.warn(
        `[invoice.notify] 发送开票通知失败 ${invoice.invoiceNo}：${(err as Error).message}`
      )
    }
  }
}
