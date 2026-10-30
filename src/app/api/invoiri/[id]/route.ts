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

  // Owner-ul are acces permanent
  const isOwner = user.discordId === SITE_OWNER_DISCORD_ID

  // Lider, Lider Secundar și Co-Lider
  const hasLeadershipRole = roleIds.some((r: string) =>
    LEADERSHIP_ROLES.includes(r)
  )

  if (!isOwner && !hasLeadershipRole) {
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

  const invoire = await prisma.leaveRequest.update({
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

  if (invoire.user?.id) {
    await notify({
      userId: invoire.user.id,
      type: 'leave',
      title:
        status === 'ACCEPTED'
          ? '✅ Învoire Aprobată'
          : '❌ Învoire Respinsă',
      message:
        status === 'ACCEPTED'
          ? `Învoirea ta a fost aprobată de ${invoire.approver?.username}.`
          : `Învoirea ta a fost respinsă de ${invoire.approver?.username}.`,
    })
  }

  return NextResponse.json({ invoire })
}
