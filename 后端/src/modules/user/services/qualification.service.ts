/**
 * @file qualification.service.ts
 * @stage P3 / T3.10
 * @desc 商户资质 / 骑手资质 通用 CRUD + 资质审核
 * @author 员工 B
 *
 * 商户资质：merchant_qualification（qual_type 1=营业执照 2=食品经营许可证 3=法人身份证 4=其他）
 * 骑手资质：rider_qualification（qual_type 1=身份证 2=健康证 3=从业资格证 4=电动车行驶证 5=其他）
 */
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BizErrorCode, BusinessException } from '../../../common'
import { MerchantQualification, RiderQualification } from '../../../entities'
import { SnowflakeId } from '../../../utils'
import {
  AuditMerchantDto,
  QualificationVo,
  SubmitQualificationBatchDto,
  SubmitQualificationDto
} from '../dto/merchant.dto'

@Injectable()
export class QualificationService {
  private readonly logger = new Logger(QualificationService.name)

  constructor(
    @InjectRepository(MerchantQualification)
    private readonly merchQualRepo: Repository<MerchantQualification>,
    @InjectRepository(RiderQualification)
    private readonly riderQualRepo: Repository<RiderQualification>
  ) {}

  /* ========== 商户资质 ========== */

  /**
   * 商户提交单条资质
   * 参数：merchantId / dto
   * 返回值：QualificationVo
   * 用途：POST /api/v1/merchants/:id/qualifications
   */
  async merchantSubmit(merchantId: string, dto: SubmitQualificationDto): Promise<QualificationVo> {
    const e = this.merchQualRepo.create({
      id: SnowflakeId.next(),
      tenantId: 1,
      merchantId,
      qualType: dto.qualType,
      certNo: dto.certNo ?? null,
      certName: dto.certName ?? null,
      validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
      validTo: dto.validTo ? new Date(dto.validTo) : null,
      attachUrl: dto.attachUrl,
      auditStatus: 0,
      auditRemark: null,
      isDeleted: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null
    })
    await this.merchQualRepo.save(e)
    return this.toMerchantVo(e)
  }

  /**
   * 商户批量提交资质
   * 参数：merchantId / dto.list
   * 返回值：QualificationVo[]
   */
  async merchantSubmitBatch(
    merchantId: string,
    dto: SubmitQualificationBatchDto
  ): Promise<QualificationVo[]> {
    const list: QualificationVo[] = []
    for (const item of dto.list) {
      list.push(await this.merchantSubmit(merchantId, item))
    }
    return list
  }

  /**
   * 列出商户全部资质
   * 参数：merchantId
   * 返回值：QualificationVo[]
   * 用途：GET /api/v1/merchants/:id/qualifications
   */
  async merchantListByMerchant(merchantId: string): Promise<QualificationVo[]> {
    const rows = await this.merchQualRepo.find({
      where: { merchantId, isDeleted: 0 },
      order: { qualType: 'ASC', createdAt: 'DESC' }
    })
    return rows.map((r) => this.toMerchantVo(r))
  }

  /**
   * 管理后台审核单条商户资质
   * 参数：qualId / dto / opAdminId
   * 返回值：QualificationVo
   * 用途：POST /api/v1/admin/merchants/qualifications/:qualId/audit
   */
  async merchantAudit(
    qualId: string,
    dto: AuditMerchantDto,
    opAdminId: string
  ): Promise<QualificationVo> {
    const q = await this.merchQualRepo.findOne({
      where: { id: qualId, isDeleted: 0 }
    })
    if (!q) throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '资质不存在')
    if (dto.action === 2 && (!dto.remark || dto.remark.trim() === '')) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, '驳回必须填写备注')
    }
    q.auditStatus = dto.action === 1 ? 1 : 2
    q.auditRemark = dto.remark ?? null
    await this.merchQualRepo.save(q)
    this.logger.log(
      `管理员 ${opAdminId} 审核商户资质 ${qualId} → ${dto.action === 1 ? '通过' : '驳回'}`
    )
    return this.toMerchantVo(q)
  }

  /* ========== 骑手资质 ========== */

  /**
   * 骑手提交单条资质
   * 参数：riderId / dto
   * 返回值：QualificationVo
   * 用途：POST /api/v1/riders/:id/qualifications
   */
  async riderSubmit(riderId: string, dto: SubmitQualificationDto): Promise<QualificationVo> {
    const e = this.riderQualRepo.create({
      id: SnowflakeId.next(),
      tenantId: 1,
      riderId,
      qualType: dto.qualType,
      certNo: dto.certNo ?? null,
      validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
      validTo: dto.validTo ? new Date(dto.validTo) : null,
      attachUrl: dto.attachUrl,
      auditStatus: 0,
      auditRemark: null,
      isDeleted: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null
    })
    await this.riderQualRepo.save(e)
    return this.toRiderVo(e)
  }

  /**
   * 骑手批量提交资质
   */
  async riderSubmitBatch(
    riderId: string,
    dto: SubmitQualificationBatchDto
  ): Promise<QualificationVo[]> {
    const list: QualificationVo[] = []
    for (const item of dto.list) {
      list.push(await this.riderSubmit(riderId, item))
    }
    return list
  }

  /**
   * 列出骑手全部资质
   */
  async riderListByRider(riderId: string): Promise<QualificationVo[]> {
    const rows = await this.riderQualRepo.find({
      where: { riderId, isDeleted: 0 },
      order: { qualType: 'ASC', createdAt: 'DESC' }
    })
    return rows.map((r) => this.toRiderVo(r))
  }

  /**
   * 管理后台审核单条骑手资质
   */
  async riderAudit(
    qualId: string,
    dto: AuditMerchantDto,
    opAdminId: string
  ): Promise<QualificationVo> {
    const q = await this.riderQualRepo.findOne({
      where: { id: qualId, isDeleted: 0 }
    })
    if (!q) throw new BusinessException(BizErrorCode.BIZ_RESOURCE_NOT_FOUND, '资质不存在')
    if (dto.action === 2 && (!dto.remark || dto.remark.trim() === '')) {
      throw new BusinessException(BizErrorCode.PARAM_INVALID, '驳回必须填写备注')
    }
    q.auditStatus = dto.action === 1 ? 1 : 2
    q.auditRemark = dto.remark ?? null
    await this.riderQualRepo.save(q)
    this.logger.log(
      `管理员 ${opAdminId} 审核骑手资质 ${qualId} → ${dto.action === 1 ? '通过' : '驳回'}`
    )
    return this.toRiderVo(q)
  }

  /* ========== Entity → VO ========== */

  private toMerchantVo(q: MerchantQualification): QualificationVo {
    return {
      id: q.id,
      merchantId: q.merchantId,
      qualType: q.qualType,
      certNo: q.certNo,
      certName: q.certName,
      validFrom: q.validFrom,
      validTo: q.validTo,
      attachUrl: q.attachUrl,
      auditStatus: q.auditStatus,
      auditRemark: q.auditRemark,
      createdAt: q.createdAt
    }
  }

  private toRiderVo(q: RiderQualification): QualificationVo {
    return {
      id: q.id,
      // 复用 merchantId 字段；rider 维度返回 riderId
      merchantId: q.riderId,
      qualType: q.qualType,
      certNo: q.certNo,
      certName: null,
      validFrom: q.validFrom,
      validTo: q.validTo,
      attachUrl: q.attachUrl,
      auditStatus: q.auditStatus,
      auditRemark: q.auditRemark,
      createdAt: q.createdAt
    }
  }
}
