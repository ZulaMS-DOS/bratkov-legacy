import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/middleware'
import { notify } from '@/lib/notifications'

const LEADERSHIP_ROLES  = ['1107100643291828224','1515017621127299303','1107099637644529684']
const NOTIFY_CHANNEL_ID = '1542818539197698070'
const GRADE_LABELS: Record<string, string> = {
  '1107100643291828224': 'Lider Bratkov',
  '1515017621127299303': 'Lider Secundar',
  '1107099637644529684': 'Co-Lider Bratkov',
  '1107098741510520852': 'Tester',
  '1107095888045801532': 'Membru',
  '1518710460717731840': 'Echipa Jaf',
  '1107093171026010203': 'Săgeată',
}

function getWeekStart() {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(now)
  monday.setDate(diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

async function sendDiscordMessage(content: string, titlu: string) {
  try {
    // Sterge mesajele vechi ale botului
    const existing = await fetch(
      `https://discord.com/api/v10/channels/${NOTIFY_CHANNEL_ID}/messages?limit=10`,
      { headers: { 'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}` } }
    )
    const messages = await existing.json()
    if (Array.isArray(messages)) {
      for (const msg of messages) {
        if (msg.author?.bot) {
          await fetch(
            `https://discord.com/api/v10/channels/${NOTIFY_CHANNEL_ID}/messages/${msg.id}`,
            { method: 'DELETE', headers: { 'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}` } }
          )
          await new Promise(r => setTimeout(r, 500))
        }
      }
    }

    // Trimite mesaj nou
    await fetch(`https://discord.com/api/v10/channels/${NOTIFY_CHANNEL_ID}/messages`, {
      method:  'POST',
      headers: { 'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ content }),
    })

    // Salveaza log pe site
    await (prisma as any).botLog.create({
      data: { categorie: 'taxa', titlu, continut: content },
    })
  } catch {}
}

// Prioritate grade — un user apare doar la gradul sau principal
const GRADE_PRIORITY = [
  '1518710460717731840', // Grove Killer
  '1107098741510520852', // Tester
  '1107095888045801532', // Membru
  '1107093171026010203', // Muncitor
  '1107099637644529684', // Co-Lider
  '1107100643291828224', // Lider
]

function getPrimaryRole(roleIds: string[]): string | null {
  for (const roleId of GRADE_PRIORITY) {
    if (roleIds.includes(roleId)) return roleId
  }
  return null
}

async function buildUnpaidList(item: any, weekStart: Date): Promise<string[]> {
  const targetRoles: string[] = item.targetRoles || []

  const allUsers = await prisma.user.findMany({
    where: targetRoles.length > 0 ? { roleIds: { hasSome: targetRoles } } : {},
    select: { id: true, username: true, discordId: true, roleIds: true },
  })

  // Filtreaza userii care au gradul principal in targetRoles
  const filteredUsers = allUsers.filter((u: any) => {
    if (targetRoles.length === 0) return true
    const primaryRole = getPrimaryRole(u.roleIds)
    return primaryRole && targetRoles.includes(primaryRole)
  })

  const payments = await (prisma as any).taxPayment.findMany({
    where: {
      weekStart,
      paid:   true,
      userId: { in: filteredUsers.map((u: any) => u.id) },
    },
    select: { userId: true, roleId: true },
  })

  // Verifica plata pentru rolul specific
  const paidSet = new Set(
    payments
      .filter((p: any) => targetRoles.includes(p.roleId) || p.roleId === 'all')
      .map((p: any) => p.userId)
  )

  return filteredUsers
    .filter((u: any) => !paidSet.has(u.id))
    .map((u: any) => `> ❌ <@${u.discordId}> (${u.username})`)
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

  // Notificari taxe care expira
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  const dayAfterTomorrow = new Date(tomorrow)
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1)

  const today    = new Date(now)
  today.setHours(0, 0, 0, 0)
  const todayEnd = new Date(today)
  todayEnd.setDate(todayEnd.getDate() + 1)

  const expiringTomorrow = allItems.filter((item: any) => {
    if (!item.termen) return false
    const t = new Date(item.termen)
    return t >= tomorrow && t < dayAfterTomorrow
  })

  const expiringToday = allItems.filter((item: any) => {
    if (!item.termen) return false
    const t = new Date(item.termen)
    return t >= today && t < todayEnd
  })

  // Suspendă toate notificările de expirare cât timp taxa este oprită.
  if (!taxPaused) {
    for (const item of expiringTomorrow) {
      const alreadyNotified = await (prisma as any).notification.findFirst({
        where: { type: 'tax', title: '⏰ Taxă Expiră Mâine', message: { contains: item.name }, createdAt: { gte: todayStart } },
      })
      if (!alreadyNotified) {
        const leaders = await prisma.user.findMany({ where: { roleIds: { hasSome: LEADERSHIP_ROLES } }, select: { id: true } })
        await Promise.all(leaders.map(l => notify({ userId: l.id, type: 'tax', title: '⏰ Taxă Expiră Mâine', message: `Taxa "${item.name}" expiră mâine!` })))
        const targetRoles: string[] = item.targetRoles || []
        const gradeText = targetRoles.length > 0 ? targetRoles.map((r: string) => GRADE_LABELS[r] || r).join(', ') : 'Toți membrii'
        const unpaidLines = await buildUnpaidList(item, weekStart)
        const unpaidText  = unpaidLines.length > 0 ? unpaidLines.join('\n') : '> ✅ Toți au achitat!'
        await sendDiscordMessage(
    `## ⏰ Taxă Expiră Mâine
  ━━━━━━━━━━━━━━━━━━━━
  > 📋 **${item.name}**
  > 👥 **Grade vizate:** ${gradeText}
  ━━━━━━━━━━━━━━━━━━━━
  **Membri care NU au achitat (${unpaidLines.length}):**
  ${unpaidText}
  ━━━━━━━━━━━━━━━━━━━━
  <@&1107100643291828224> <@&1107099637644529684>`,
    '⏰ Taxă Expiră Mâine'
  )
      }
    }
  
    for (const item of expiringToday) {
      const alreadyNotified = await (prisma as any).notification.findFirst({
        where: { type: 'tax', title: '🚨 Taxă Expiră Azi', message: { contains: item.name }, createdAt: { gte: todayStart } },
      })
      if (!alreadyNotified) {
        const leaders = await prisma.user.findMany({ where: { roleIds: { hasSome: LEADERSHIP_ROLES } }, select: { id: true } })
        await Promise.all(leaders.map(l => notify({ userId: l.id, type: 'tax', title: '🚨 Taxă Expiră Azi', message: `Taxa "${item.name}" expiră AZI!` })))
        const targetRoles: string[] = item.targetRoles || []
        const gradeText = targetRoles.length > 0 ? targetRoles.map((r: string) => GRADE_LABELS[r] || r).join(', ') : 'Toți membrii'
        const unpaidLines = await buildUnpaidList(item, weekStart)
        const unpaidText  = unpaidLines.length > 0 ? unpaidLines.join('\n') : '> ✅ Toți au achitat!'
        await sendDiscordMessage(
          
    `## 🚨 Taxă Expiră Azi
  ━━━━━━━━━━━━━━━━━━━━
  > 📋 **${item.name}**
  > 👥 **Grade vizate:** ${gradeText}
  ━━━━━━━━━━━━━━━━━━━━
  **Membri care NU au achitat (${unpaidLines.length}):**
  ${unpaidText}
  ━━━━━━━━━━━━━━━━━━━━
  <@&1107100643291828224> <@&1107099637644529684>`,
    '🚨 Taxă Expiră Azi'
  )
      }
    }
  
  }

  return NextResponse.json({
    items,
    paid:      rolePayment.paid,
    paidAt:    rolePayment.paidAt,
    paidByRole,
    weekStart: weekStart.toISOString(),
    taxPaused,
  })
}
