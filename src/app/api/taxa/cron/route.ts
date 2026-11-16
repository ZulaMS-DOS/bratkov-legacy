import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notify } from '@/lib/notifications'
import { DISCORD_BOT_TOKEN, SITE_OWNER_DISCORD_ID } from '@/lib/discord'

export const dynamic = 'force-dynamic'

const CHANNEL_ID = '1542818539197698070'
const LEADERSHIP_ROLES = [
  '1107100643291828224',
  '1515017621127299303',
  '1107099637644529684',
]

function dateKey(value: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bucharest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value)
}

function addDays(key: string, days: number) {
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat('ro-RO', {
    timeZone: 'Europe/Bucharest',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(value)
}

const GRADE_PRIORITY = [
  '1518710460717731840',
  '1107098741510520852',
  '1107095888045801532',
  '1107093171026010203',
  '1107099637644529684',
  '1107100643291828224',
]

const GRADE_LABELS: Record<string, string> = {
  '1107100643291828224': 'Lider Bratkov',
  '1515017621127299303': 'Lider Secundar',
  '1107099637644529684': 'Co-Lider Bratkov',
  '1107098741510520852': 'Tester',
  '1107095888045801532': 'Membru',
  '1518710460717731840': 'Echipa Jaf',
  '1107093171026010203': 'Săgeată',
}

function primaryRole(roleIds: string[]) {
  return GRADE_PRIORITY.find(role => roleIds.includes(role)) || null
}

async function unpaidMembers(item: any) {
  const targetRoles: string[] = item.targetRoles || []
  const users = await prisma.user.findMany({
    where: targetRoles.length ? { roleIds: { hasSome: targetRoles } } : {},
    select: { id: true, username: true, discordId: true, roleIds: true },
  })
  const filtered = users.filter(user =>
    !targetRoles.length || (primaryRole(user.roleIds) && targetRoles.includes(primaryRole(user.roleIds)!))
  )
  const payments = await (prisma as any).taxPayment.findMany({
    where: { weekStart: item.weekStart, paid: true, userId: { in: filtered.map(u => u.id) } },
    select: { userId: true, roleId: true },
  })
  const paid = new Set(
    payments.filter((p: any) => targetRoles.includes(p.roleId) || p.roleId === 'all').map((p: any) => p.userId)
  )
  return filtered.filter(user => !paid.has(user.id))
}

async function alreadyLogged(title: string, itemId: string, todayKey: string) {
  const recent = await (prisma as any).botLog.findMany({
    where: { categorie: 'taxa', titlu: title, createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) } },
    select: { continut: true, createdAt: true },
  })
  return recent.some((log: any) =>
    dateKey(new Date(log.createdAt)) === todayKey && log.continut.includes(`TaxItem ID: ${itemId}`)
  )
}

async function sendExpiry(item: any, kind: 'tomorrow' | 'today', todayKey: string) {
  const title = kind === 'tomorrow' ? '⏰ Taxă Expiră Mâine' : '🚨 Taxă Expiră Azi'
  if (await alreadyLogged(title, item.id, todayKey)) return 'already-sent'

  const unpaid = await unpaidMembers(item)
  const targetRoles: string[] = item.targetRoles || []
  const gradeText = targetRoles.length
    ? targetRoles.map(role => GRADE_LABELS[role] || role).join(', ')
    : 'Toți membrii'
  const lines = unpaid.length
    ? unpaid.map(user => `> ❌ <@${user.discordId}> (${user.username})`)
    : ['> ✅ Toți au achitat!']

  const content = [
    kind === 'tomorrow' ? '## ⏰ Taxă Expiră Mâine' : '## 🚨 Taxa Expiră Astăzi',
    '━━━━━━━━━━━━━━━━━━━━',
    `> 📋 **Taxă:** ${item.name}`,
    `> 📅 **Termen:** ${formatDate(new Date(item.termen))}`,
    `> 👥 **Grade vizate:** ${gradeText}`,
    '━━━━━━━━━━━━━━━━━━━━',
    `**Membri care NU au achitat (${unpaid.length}):**`,
    ...lines,
    '━━━━━━━━━━━━━━━━━━━━',
    '<@&1107100643291828224> <@&1515017621127299303> <@&1107099637644529684>',
    `TaxItem ID: ${item.id}`,
  ].join('\\n')

  if (!DISCORD_BOT_TOKEN) throw new Error('DISCORD_BOT_TOKEN nu este configurat')
  const response = await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!response.ok) throw new Error(`Discord API ${response.status}: ${await response.text()}`)

  await (prisma as any).botLog.create({
    data: { categorie: 'taxa', titlu, continut: content },
  })

  const leaders = await prisma.user.findMany({
    where: { OR: [{ roleIds: { hasSome: LEADERSHIP_ROLES } }, { discordId: SITE_OWNER_DISCORD_ID }] },
    select: { id: true },
  })
  await Promise.all(leaders.map(leader => notify({
    userId: leader.id,
    type: 'tax',
    title,
    message: `Taxa "${item.name}" ${kind === 'tomorrow' ? 'expiră mâine' : 'expiră astăzi'} (${formatDate(new Date(item.termen))}).`,
  })))
  return 'sent'
}

async function runExpiryChecks() {
  const config = await (prisma as any).siteConfig.upsert({
    where: { id: 'main' }, update: {}, create: { id: 'main' },
  })
  if (config.taxPaused) return { paused: true, sent: 0 }

  const today = dateKey(new Date())
  const tomorrow = addDays(today, 1)
  const items = await (prisma as any).taxItem.findMany({
    where: { termen: { not: null } },
    orderBy: { termen: 'asc' },
  })

  let sent = 0
  for (const item of items) {
    const due = dateKey(new Date(item.termen))
    if (due === tomorrow) {
      if (await sendExpiry(item, 'tomorrow', today) === 'sent') sent++
    } else if (due === today) {
      if (await sendExpiry(item, 'today', today) === 'sent') sent++
    }
  }
  return { paused: false, sent, checked: items.length, today, tomorrow }
}

async function handler(req: NextRequest) {
  const secret = process.env.TAX_CRON_SECRET
  const authorization = req.headers.get('authorization')
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runExpiryChecks()
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error('Tax expiry cron failed:', error)
    return NextResponse.json({ error: 'Tax expiry check failed' }, { status: 500 })
  }
}

export const GET = handler
export const POST = handler
