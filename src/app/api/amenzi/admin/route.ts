import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireFineGiver, requireLeadership } from '@/lib/middleware'

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID!
const FW_CHANNEL_ID = '1542898040627536012'
const AMENDA_CHANNEL_ID = '1107388564146225213'

const FW_ROLES: Record<number, string> = {
  1: '1542899996024639508',
  2: '1542900207795306507',
  3: '1542900241462853682',
}

async function deleteDiscordMessage(channelId: string, messageId: string) {
  return fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`,
    { method: 'DELETE', headers: { 'Authorization': `Bot ${DISCORD_BOT_TOKEN}` } }
  )
}

async function setFwRole(discordId: string, roleId: string, method: 'PUT' | 'DELETE') {
  return fetch(
    `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${discordId}/roles/${roleId}`,
    { method, headers: { 'Authorization': `Bot ${DISCORD_BOT_TOKEN}` } }
  )
}

export async function GET() {
  const { error } = await requireFineGiver()
  if (error) return error

  const [fines, members] = await Promise.all([
    (prisma as any).fine.findMany({
      orderBy: { createdAt: 'desc' },
      take:    100,
      include: { user: { select: { username: true, avatar: true, discordId: true } } },
    }),
    prisma.user.findMany({
      where: {
        roleIds: { hasSome: ['1107100643291828224','1107099637644529684','1107098741510520852','1107095888045801532','1518710460717731840','1107093171026010203'] }
      },
      orderBy: { username: 'asc' },
      select:  { id: true, username: true, avatar: true, discordId: true },
    })
  ])

  const amenzi = fines.filter((f: any) => f.tip === 'amenda' || !f.tip)
  const fwuri  = fines.filter((f: any) => f.tip === 'fw')

  return NextResponse.json({ fines, amenzi, fwuri, members })
}

export async function DELETE(req: NextRequest) {
  const { error } = await requireLeadership()
  if (error) return error

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID lipsa' }, { status: 400 })

  const fine = await (prisma as any).fine.findUnique({
    where: { id },
    include: { user: { select: { discordId: true } } },
  })

  if (!fine) {
    return NextResponse.json({ error: 'Sancțiunea nu a fost găsită' }, { status: 404 })
  }

  const channelId = fine.tip === 'fw' ? FW_CHANNEL_ID : AMENDA_CHANNEL_ID

  // Ștergem mesajul exact asociat sancțiunii. 404 înseamnă că a fost deja șters.
  if (fine.discordMessageId) {
    const response = await deleteDiscordMessage(channelId, fine.discordMessageId)
    if (!response.ok && response.status !== 404) {
      console.error('Discord message deletion failed:', response.status, await response.text())
      return NextResponse.json(
        { error: 'Nu am putut șterge mesajul din Discord. Sancțiunea a rămas pe site.' },
        { status: 502 }
      )
    }
  }

  // La ștergerea unui FW recalculăm nivelul din toate FW-urile rămase.
  if (fine.tip === 'fw' && fine.user?.discordId) {
    const remainingFws = await (prisma as any).fine.findMany({
      where: { userId: fine.userId, tip: 'fw', id: { not: fine.id } },
      select: { fwLevel: true },
      orderBy: { createdAt: 'asc' },
    })

    const totalFw = Math.min(
      remainingFws.reduce((sum: number, item: any) => sum + (item.fwLevel || 1), 0),
      3
    )

    for (const roleId of Object.values(FW_ROLES)) {
      const response = await setFwRole(fine.user.discordId, roleId, 'DELETE')
      if (!response.ok && response.status !== 404) {
        console.error('Discord FW role removal failed:', response.status)
        return NextResponse.json(
          { error: 'Mesajul a fost șters, dar nu am putut actualiza rolul FW pe Discord. Reîncearcă ștergerea.' },
          { status: 502 }
        )
      }
    }

    if (totalFw > 0 && FW_ROLES[totalFw]) {
      const response = await setFwRole(fine.user.discordId, FW_ROLES[totalFw], 'PUT')
      if (!response.ok) {
        console.error('Discord FW role update failed:', response.status)
        return NextResponse.json(
          { error: 'Mesajul a fost șters, dar nu am putut actualiza rolul FW pe Discord. Reîncearcă ștergerea.' },
          { status: 502 }
        )
      }
    }
  }

  await (prisma as any).fine.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
