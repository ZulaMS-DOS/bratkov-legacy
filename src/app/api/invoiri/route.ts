import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/middleware'
import { notify } from '@/lib/notifications'
import { DISCORD_BOT_TOKEN, SITE_OWNER_DISCORD_ID } from '@/lib/discord'

const LEAVE_CHANNEL_ID = '1155954199247454248'

const LEADERSHIP_ROLES = [
  '1107100643291828224', // Lider
  '1515017621127299303', // Lider Secundar
  '1107099637644529684', // Co-Lider
]

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Bucharest',
  })
}

async function sendDiscordDM(discordId: string, content: string) {
  if (!DISCORD_BOT_TOKEN) {
    console.error('DISCORD_BOT_TOKEN lipsește; DM-ul pentru învoire nu a fost trimis.')
    return false
  }

  try {
    const dmResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ recipient_id: discordId }),
    })

    if (!dmResponse.ok) {
      console.error('Nu s-a putut deschide DM-ul Discord pentru învoire:', discordId, await dmResponse.text())
      return false
    }

    const dm = await dmResponse.json()
    if (!dm.id) return false

    const messageResponse = await fetch(`https://discord.com/api/v10/channels/${dm.id}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    })

    if (!messageResponse.ok) {
      console.error('Nu s-a putut trimite DM-ul Discord pentru învoire:', discordId, await messageResponse.text())
      return false
    }

    return true
  } catch (error) {
    console.error('Eroare trimitere DM învoire:', discordId, error)
    return false
  }
}

async function publishLeaveRequest(invoire: {
  id: string
  reason: string
  startDate: Date
  endDate: Date
  user: { username: string | null; discordId: string } | null
}) {
  if (!DISCORD_BOT_TOKEN) {
    console.error('DISCORD_BOT_TOKEN lipsește; învoirea nu a fost publicată pe Discord.')
    return
  }

  const content = [
    '## 🏖️ Cerere Nouă de Învoire',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    `**Membru:** ${invoire.user?.username || 'Membru necunoscut'}`,
    `**Discord:** ${invoire.user?.discordId ? `<@${invoire.user.discordId}>` : 'Nedisponibil'}`,
    `**Perioadă:** ${formatDate(invoire.startDate)} – ${formatDate(invoire.endDate)}`,
    `**Motiv:** ${invoire.reason.slice(0, 1200)}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    '⏳ **Status:** În așteptare',
  ].join('\n')

  try {
    const response = await fetch(`https://discord.com/api/v10/channels/${LEAVE_CHANNEL_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    })

    if (!response.ok) {
      console.error('Nu s-a putut publica învoirea pe Discord:', await response.text())
      return
    }

    const message = await response.json()
    if (message.id) {
      await prisma.leaveRequest.update({
        where: { id: invoire.id },
        data: { discordMessageId: message.id },
      })
    }
  } catch (error) {
    console.error('Eroare la publicarea învoirii pe Discord:', error)
  }
}

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
      reason: String(reason).trim(),
      startDate: new Date(startDate),
      endDate: new Date(endDate),
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

  await publishLeaveRequest(invoire)

  const lideri = await prisma.user.findMany({
    where: {
      OR: [
        { roleIds: { hasSome: LEADERSHIP_ROLES } },
        { discordId: SITE_OWNER_DISCORD_ID },
      ],
    },
    select: {
      id: true,
      discordId: true,
    },
  })

  await Promise.all(
    lideri.map(l =>
      notify({
        userId: l.id,
        type: 'leave',
        title: '🏖️ Cerere Învoire Nouă',
        message: `${session!.user.name || 'Un membru'} a depus o cerere de învoire. Verifică și aprobă!`,
      })
    )
  )

  // DM Discord către Lider, Lider Secundar, Co-Lider și proprietarul site-ului.
  const applicantName =
    invoire.user?.username || session!.user.name || 'Membru necunoscut'
  const divider = '━━━━━━━━━━━━━━━━━━━━'
  const dmContent = [
    '## 🏖️ Cerere Nouă de Învoire',
    divider,
    `> **Membru:** ${applicantName}`,
    `> **Discord:** ${invoire.user?.discordId ? `<@${invoire.user.discordId}>` : 'Nedisponibil'}`,
    `> **Perioadă:** ${formatDate(invoire.startDate)} – ${formatDate(invoire.endDate)}`,
    `> **Motiv:** ${String(reason).trim().slice(0, 1200)}`,
    divider,
    'Verifică cererea în panoul **Învoiri** de pe site-ul Bratkov Legacy.',
  ].join('\n')

  const uniqueDiscordIds = Array.from(
    new Set(lideri.map(lider => lider.discordId).filter((id): id is string => Boolean(id)))
  )

  await Promise.all(
    uniqueDiscordIds.map(discordId => sendDiscordDM(discordId, dmContent))
  )

  return NextResponse.json({ invoire })
}
