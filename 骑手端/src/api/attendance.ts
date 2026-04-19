/**
 * @file api/attendance.ts
 * @stage P7/T7.36~T7.38 (Sprint 5)
 * @desc 考勤：上下班打卡、考勤记录、排班、请假
 *
 * @author 单 Agent V2.0 (P7 骑手端)
 */
import type { AttendanceRecord, AttendanceDay, ScheduleSlot, LeaveApply } from '@/types/biz'
import { get, post, genIdemKey } from '@/utils/request'

/** 打卡（上班 / 下班） */
export function checkInOut(payload: {
  type: 'in' | 'out'
  lng: number
  lat: number
  address?: string
  remark?: string
}): Promise<AttendanceRecord> {
  return post<AttendanceRecord>('/rider/attendance/check', payload, {
    idemKey: genIdemKey()
  })
}

/** 考勤记录列表（按月） */
export function fetchAttendanceHistory(payload: { yearMonth: string }): Promise<AttendanceDay[]> {
  return get('/rider/attendance/history', payload as Record<string, unknown>, { silent: true })
}

/** 排班 */
export function fetchSchedule(payload: { yearMonth: string }): Promise<ScheduleSlot[]> {
  return get('/rider/attendance/schedule', payload as Record<string, unknown>, { silent: true })
}

/** 请假申请 */
export function applyLeave(payload: {
  leaveType: 1 | 2 | 3
  startDate: string
  endDate: string
  reason: string
}): Promise<LeaveApply> {
  return post('/rider/attendance/leave', payload, { idemKey: genIdemKey() })
}

/** 请假历史 */
export function fetchLeaveHistory(): Promise<LeaveApply[]> {
  return get('/rider/attendance/leave/history', {}, { silent: true })
}
