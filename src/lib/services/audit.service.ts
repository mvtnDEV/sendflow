import { prisma } from '@/lib/db/prisma'
import { headers } from 'next/headers'

export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'LOGIN_FAILED'
  | 'VIEW_ORDER'
  | 'VIEW_ORDER_LIST'
  | 'CREATE_ORDER'
  | 'UPDATE_ORDER_STATUS'
  | 'DELETE_ORDER'
  | 'EXPORT_DATA'
  | 'VIEW_EVIDENCE'
  | 'UPLOAD_EVIDENCE'
  | 'WEBHOOK_RECEIVED'
  | 'DATA_DELETION_REQUEST'
  | 'DATA_ANONYMIZED'
  | 'CREATE_USER'

interface AuditParams {
  userId?:   string
  action:    AuditAction
  resource?: string
  metadata?: Record<string, unknown>
}

export async function audit(params: AuditParams) {
  try {
    const hdrs      = headers()
    const ipAddress = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim()
                   ?? hdrs.get('x-real-ip')
                   ?? 'unknown'
    const userAgent = hdrs.get('user-agent') ?? undefined

    await prisma.auditLog.create({
      data: {
        userId:    params.userId,
        action:    params.action,
        resource:  params.resource,
        ipAddress,
        userAgent,
        metadata:  params.metadata
          ? JSON.parse(JSON.stringify(params.metadata))
          : undefined,
      },
    })
  } catch (err) {
    console.error('[AuditLog error]', err)
  }
}

export async function auditExport(userId: string, storeId: string, count: number) {
  await audit({
    userId,
    action:   'EXPORT_DATA',
    resource: `store:${storeId}`,
    metadata: { recordCount: count } as any,
  })
}
