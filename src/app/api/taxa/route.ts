import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/middleware'

const LEADERSHIP_ROLES  = ['1107100643291828224','1515017621127299303','1107099637644529684']
const NOTIFY_CHANNEL_ID = '1542818539197698070'
function getWeekStart() {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(now)
  monday.setDate(diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth()
  if (error) return error

  const weekStart    = getWeekStart()
  const siteConfig = await (prisma as any).siteConfig.upsert({ where: { id: 'main' }, update: {}, create: { id: 'main' } })
  const taxPaused = siteConfig.taxPaused
  const userId       = session!.user.id
  const myRoleIds    = session!.user.roleIds || []
  const now          = new Date()
  const filterRole   = req.nextUrl.searchParams.get('role')

  const [allItems, payments] = await Promise.all([
    (prisma as any).taxItem.findMany({
      where:   { weekStart },
      orderBy: { createdAt: 'asc' },
    }),
    (prisma as any).taxPayment.findMany({
      where: { userId, weekStart },
    }),
  ])

  // Filtreaza dupa gradul userului
  const filtered = allItems.filter((item: any) => {
    if (!item.targetRoles?.length) return true
    if (filterRole) return item.targetRoles.includes(filterRole)
    return item.targetRoles.some((r: string) => myRoleIds.includes(r))
  })

  const items = filtered.map((item: any) => ({
    ...item,
    expired: item.termen ? new Date(item.termen) < now : false,
  }))

  // Returneaza plati per grad
  const paidByRole: Record<string, { paid: boolean; paidAt: string | null }> = {}
  for (const p of payments) {
    paidByRole[p.roleId] = { paid: p.paid, paidAt: p.paidAt }
  }

  // Daca e filtrat dupa un rol specific, returneaza plata pentru acel rol
  const rolePayment = filterRole
    ? (paidByRole[filterRole] || { paid: false, paidAt: null })
    : (paidByRole['all'] || { paid: false, paidAt: null })



  return NextResponse.json({
    items,
    paid:      rolePayment.paid,
    paidAt:    rolePayment.paidAt,
    paidByRole,
    weekStart: weekStart.toISOString(),
    taxPaused,
  })
}
