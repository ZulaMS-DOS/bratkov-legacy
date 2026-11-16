import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireFineGiver } from '@/lib/middleware'

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!
const DISCORD_GUILD_ID  = process.env.DISCORD_GUILD_ID!
const FW_CHANNEL_ID     = '1542898040627536012'
const AMENDA_CHANNEL_ID = '1107388564146225213'
const DIVIDER           = '━━━━━━━━━━━━━━━━━━━━'

const FW_ROLES: Record<number, string> = {
  1: '1542899996024639508',
  2: '1542900207795306507',
  3: '1542900241462853682',
}

async function sendDiscordMessage(channelId: string, content: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      }
    )

    if (!response.ok) {
      console.error('Discord message send failed:', response.status, await response.text())
      return null
    }

    const message = await response.json()
    return message.id || null
  } catch (error) {
    console.error('Discord message send error:', error)
    return null
  }
}

async function addRole(discordId: string, roleId: string) {
  return fetch(
    `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${discordId}/roles/${roleId}`,
    { method: 'PUT', headers: { 'Authorization': `Bot ${DISCORD_BOT_TOKEN}` } }
  )
}

async function removeRole(discordId: string, roleId: string) {
  return fetch(
    `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${discordId}/roles/${roleId}`,
    { method: 'DELETE', headers: { 'Authorization': `Bot ${DISCORD_BOT_TOKEN}` } }
  )
}

export async function GET() {
  const { session, error } = await requireAuth()
  if (error) return error

  const userId = session!.user.id

  const fines = await (prisma as any).fine.findMany({
    where:   { userId },
    orderBy: { createdAt: 'desc' },
    take:    50,
  })

  return NextResponse.json({ fines })
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireFineGiver()
  if (error) return error

  const { userId, tip, motiv, material, bucati, termen, fwLevel } = await req.json()
  if (!userId || !material) {
    return NextResponse.json({ error: 'Membru și material obligatorii' }, { status: 400 })
  }

  const tipFinal = tip === 'fw' ? 'fw' : 'amenda'

  const fine = await (prisma as any).fine.create({
    data: {
      userId,
      tip:         tipFinal,
      motiv:       motiv?.trim() || '',
      material,
      bucati:      parseInt(bucati) || 0,
      termen:      termen?.trim()   || '',
      fwLevel:     fwLevel ? parseInt(fwLevel) : null,
      givenBy:     session!.user.id,
      givenByName: session!.user.name,
    },
  })

  if (tipFinal === 'fw') {
    const newFwLevel = Math.max(1, Math.min(3, parseInt(fwLevel) || 1))

    const previousFws = await (prisma as any).fine.findMany({
      where:   { userId, tip: 'fw', id: { not: fine.id } },
      orderBy: { createdAt: 'asc' },
      select:  { fwLevel: true },
    })

    const totalFw = Math.min(
      previousFws.reduce((sum: number, f: any) => sum + (f.fwLevel || 1), 0) + newFwLevel,
      3
    )

    const history = [
      ...previousFws.map((f: any) => `FW ${f.fwLevel}/3`),
      `FW ${newFwLevel}/3`,
    ]
    const historyText = history.length > 1
      ? `${history.join(' + ')} = FW ${totalFw}/3`
      : `FW ${totalFw}/3`

    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { username: true, discordId: true },
    })

    if (user?.discordId) {
      for (const [level, roleId] of Object.entries(FW_ROLES)) {
        if (parseInt(level) !== totalFw) {
          const response = await removeRole(user.discordId, roleId)
          if (!response.ok && response.status !== 404) {
            console.error('Discord FW role removal failed:', response.status)
          }
        }
      }

      if (FW_ROLES[totalFw]) {
        const response = await addRole(user.discordId, FW_ROLES[totalFw])
        if (!response.ok) console.error('Discord FW role assignment failed:', response.status)
      }

      const messageId = await sendDiscordMessage(
        FW_CHANNEL_ID,
        `## 🚨 Faction Warn — ${user.username}\n` +
        `${DIVIDER}\n` +
        `> 👤 **Membru:** <@${user.discordId}>\n` +
        `> 📋 **Motiv:** ${material}\n` +
        `> 📊 **Istoric:** ${historyText}\n` +
        `> 👮 **Dat de:** ${session!.user.name}\n` +
        `${DIVIDER}`
      )

      if (messageId) {
        await (prisma as any).fine.update({
          where: { id: fine.id },
          data: { discordMessageId: messageId },
        })
      }
    }

    await (prisma as any).botLog.create({
      data: {
        categorie: 'sanctiuni',
        titlu:     `🚨 FW ${totalFw}/3 — ${user?.username || 'Necunoscut'}`,
        continut:
          `Membru: ${user?.username}\n` +
          `Motiv: ${material}\n` +
          `Istoric: ${historyText}\n` +
          `Dat de: ${session!.user.name}`,
      },
    })

  } else {
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { username: true, discordId: true },
    })

    const messageId = await sendDiscordMessage(
      AMENDA_CHANNEL_ID,
      `## ⚠️ Amendă — ${user?.username || 'Necunoscut'}\n` +
      `${DIVIDER}\n` +
      `> 👤 **Membru:** <@${user?.discordId}>\n` +
      `> 📋 **Motiv:** ${material}\n` +
      `${bucati ? `> 📦 **Cantitate:** ${bucati} buc\n` : ''}` +
      `${termen ? `> ⏰ **Termen:** ${termen}\n` : ''}` +
      `> 👮 **Dat de:** ${session!.user.name}\n` +
      `${DIVIDER}`
    )

    if (messageId) {
      await (prisma as any).fine.update({
        where: { id: fine.id },
        data: { discordMessageId: messageId },
      })
    }

    await (prisma as any).botLog.create({
      data: {
        categorie: 'sanctiuni',
        titlu:     `⚠️ Amendă — ${user?.username || 'Necunoscut'}`,
        continut:
          `Membru: ${user?.username}\n` +
          `Material: ${material}\n` +
          `Bucăți: ${bucati || 0}\n` +
          `Termen: ${termen || '—'}\n` +
          `Dat de: ${session!.user.name}`,
      },
    })
  }

  return NextResponse.json({ fine })
}
