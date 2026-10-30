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

export async function GET() {
  const { session, error } = await requireAuth()
  if (error) return error

  const user = session!.user as any
  const userId = user.id
  const roleIds = user.roleIds || []

  const isOwner = user.discordId === SITE_OWNER_DISCORD_ID
  const isLeader = roleIds.some((r: string) =>
    LEADERSHIP_ROLES.includes(r)
  )

  // Owner și Leadership văd toate învoirile
  const invoiri = await prisma.leaveRequest.findMany({
    where: isOwner || isLeader ? {} : { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      user: {
        select: {
          username: true,
          avatar: true,
          discordId: true,
        },
      },
      approver: {
        select: {
          username: true,
        },
      },
    },
  })

  return NextResponse.json({ invoiri })
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth()
  if (error) return error

  const { reason, startDate, endDate } = await req.json()

  if (!reason || !startDate || !endDate) {
    return NextResponse.json(
      { error: 'Câmpuri lipsă' },
      { status: 400 }
    )
  }

  const invoire = await prisma.leaveRequest.create({
    data: {
      userId: session!.user.id,
      reason,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    },
    include: {
      user: {
        select: {
          username: true,
          avatar: true,
        },
      },
    },
  })

  // Notificăm liderii și Owner-ul
  const lideri = await prisma.user.findMany({
    where: {
      OR: [
        { roleIds: { hasSome: LEADERSHIP_ROLES } },
        { discordId: SITE_OWNER_DISCORD_ID },
      ],
    },
    select: {
      id: true,
    },
  })

  await Promise.all(
    lideri.map(l =>
      notify({
        userId: l.id,
        type: 'leave',
        title: '🏖️ Cerere Învoire Nouă',
        message: `${session!.user.name} a depus o cerere de învoire. Verifică și aprobă!`,
      })
    )
  )

  return NextResponse.json({ invoire })
}
