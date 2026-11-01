import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/middleware'
import { notify } from '@/lib/notifications'
import {
  SITE_OWNER_DISCORD_ID,
  isFullLeadership,
} from '@/lib/discord'

const LEADERSHIP_ROLES = [
  '1107100643291828224', // Lider
  '1515017621127299303', // Lider secundar
  '1107099637644529684', // Co-Lider
]

async function sendDiscordDM(discordId: string, content: string) {
  const token = process.env.DISCORD_BOT_TOKEN

  if (!token) {
    console.error('DISCORD_BOT_TOKEN lipsește; DM-ul pentru demisie nu a fost trimis.')
    return false
  }

  try {
    const dmResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ recipient_id: discordId }),
    })

    if (!dmResponse.ok) {
      console.error('Nu s-a putut deschide DM-ul Discord:', discordId, await dmResponse.text())
      return false
    }

    const dm = await dmResponse.json()
    if (!dm.id) return false

    const messageResponse = await fetch(`https://discord.com/api/v10/channels/${dm.id}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    })

    if (!messageResponse.ok) {
      console.error('Nu s-a putut trimite DM-ul Discord:', discordId, await messageResponse.text())
      return false
    }

    return true
  } catch (error) {
    console.error('Eroare trimitere DM demisie:', discordId, error)
    return false
  }
}

export async function GET() {
  const { session, error } = await requireAuth()
  if (error) return error

  const userId = session!.user.id
  const discordId = (session!.user as any).discordId
  const roleIds = session!.user.roleIds || []

  // Owner-ul are acces permanent, indiferent de rolurile Discord.
  const isLeader =
    discordId === SITE_OWNER_DISCORD_ID ||
    isFullLeadership(roleIds) ||
    roleIds.some((role: string) => LEADERSHIP_ROLES.includes(role))

  const demisii = await prisma.resignation.findMany({
    where: isLeader ? {} : { userId },
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

  return NextResponse.json({ demisii })
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth()
  if (error) return error

  const { reason } = await req.json()

  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return NextResponse.json(
      { error: 'Motivul este obligatoriu' },
      { status: 400 }
    )
  }

  const demisie = await prisma.resignation.create({
    data: {
      userId: session!.user.id,
      username: session!.user.name,
      reason: reason.trim(),
    },
    include: {
      user: {
        select: {
          username: true,
          avatar: true,
          discordId: true,
        },
      },
    },
  })

  // Notificări în site pentru membrii leadership-ului.
  const lideri = await prisma.user.findMany({
    where: {
      roleIds: {
        hasSome: LEADERSHIP_ROLES,
      },
    },
    select: {
      id: true,
      discordId: true,
      username: true,
    },
  })

  await Promise.all(
    lideri.map((lider) =>
      notify({
        userId: lider.id,
        type: 'resignation',
        title: '🚪 Cerere Demisie Nouă',
        message: `${session!.user.name || 'Un membru'} a depus o cerere de demisie. Verifică și acționează!`,
      })
    )
  )

  // DM Discord către Lider, Lider Secundar și Co-Lider.
  const applicantName =
    demisie.user?.username || session!.user.name || 'Membru necunoscut'
  const divider = '━━━━━━━━━━━━━━━━━━━━'
  const dmContent = [
    '## 🚪 Cerere Nouă de Demisie',
    divider,
    `> **Membru:** ${applicantName}`,
    `> **Discord:** ${demisie.user?.discordId ? `<@${demisie.user.discordId}>` : 'Nedisponibil'}`,
    `> **Motiv:** ${reason.trim().slice(0, 1200)}`,
    divider,
    'Verifică cererea în panoul **Demisii** de pe site-ul Bratkov Legacy.',
  ].join('\n')

  const uniqueDiscordIds = Array.from(
    new Set(lideri.map(lider => lider.discordId).filter((id): id is string => Boolean(id)))
  )

  await Promise.all(
    uniqueDiscordIds.map(discordId => sendDiscordDM(discordId, dmContent))
  )

  return NextResponse.json({ demisie })
}
