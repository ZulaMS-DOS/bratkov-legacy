import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/middleware'
import { notify } from '@/lib/notifications'
import { SITE_OWNER_DISCORD_ID } from '@/lib/discord'

const LEADERSHIP_ROLES = [
  '1107100643291828224', // Lider
  '1515017621127299303', // Lider Secundar
  '1107099637644529684', // Co-Lider
]

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth()
  if (error) return error

  const user = session!.user as any
  const roleIds = user.roleIds || []

  // Owner-ul site-ului are acces permanent
  const isOwner = user.discordId === SITE_OWNER_DISCORD_ID

  // Verificăm rolurile de leadership
  const hasLeadershipRole = roleIds.some((r: string) =>
    LEADERSHIP_ROLES.includes(r)
  )

  const canManage = isOwner || hasLeadershipRole

  if (!canManage) {
    return NextResponse.json(
      { error: 'Nu ai acces.' },
      { status: 403 }
    )
  }

  const { status } = await req.json()

  if (!['ACCEPTED', 'REJECTED'].includes(status)) {
    return NextResponse.json(
      { error: 'Status invalid' },
      { status: 400 }
    )
  }

  const { id } = await context.params

  const demisie = await prisma.resignation.update({
    where: { id },
    data: {
      status,
      approvedBy: session!.user.id,
      approvedAt: new Date(),
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
        },
      },
      approver: {
        select: {
          username: true,
        },
      },
    },
  })

  if (demisie.user?.id) {
    await notify({
      userId: demisie.user.id,
      type: 'resignation',
      title:
        status === 'ACCEPTED'
          ? '✅ Demisie Acceptată'
          : '❌ Demisie Respinsă',
      message:
        status === 'ACCEPTED'
          ? `Demisia ta a fost acceptată de ${demisie.approver?.username}.`
          : `Demisia ta a fost respinsă de ${demisie.approver?.username}.`,
    })
  }

  return NextResponse.json({ demisie })
}
