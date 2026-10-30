import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireLeadership } from '@/lib/middleware'
import { notifyAll } from '@/lib/notifications'
import { SITE_OWNER_DISCORD_ID } from '@/lib/discord'

const ALL_ROLE_IDS     = ['1107100643291828224','1107099637644529684','1107098741510520852','1107095888045801532','1518710460717731840','1107093171026010203']
const MUNCITOR_ROLE_ID = '1107093171026010203'
const TAX_PAUSE_ROLE_IDS = ['1107100643291828224', '1515017621127299303']

function getWeekStart() {
  const now  = new Date()
  const day  = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(now)
  monday.setDate(diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

function getPrevWeekStart() {
  const prev = getWeekStart()
  prev.setDate(prev.getDate() - 7)
  return prev
}

export async function GET() {
  const { session, error } = await requireLeadership()
  if (error) return error

  const weekStart = getWeekStart()
  const config = await (prisma as any).siteConfig.upsert({
    where: { id: 'main' },
    update: {},
    create: { id: 'main' },
  })
  const roleIds = (session!.user.roleIds || []) as string[]
  const canToggleTax = session!.user.discordId === SITE_OWNER_DISCORD_ID || roleIds.some(id => TAX_PAUSE_ROLE_IDS.includes(id))

  // Copiaza automat taxa permanenta pentru Muncitori din saptamana trecuta
  const prevWeekStart  = getPrevWeekStart()
  const existingItems  = await (prisma as any).taxItem.findMany({ where: { weekStart } })
  const muncitorExists = existingItems.some((i: any) => i.targetRoles?.includes(MUNCITOR_ROLE_ID))

  if (!muncitorExists) {
    const prevMuncitorItems = await (prisma as any).taxItem.findMany({
      where: { weekStart: prevWeekStart, targetRoles: { has: MUNCITOR_ROLE_ID } },
    })
    for (const item of prevMuncitorItems) {
      await (prisma as any).taxItem.create({
        data: {
          name:        item.name,
          bucati:      item.bucati,
          termen:      null,
          targetRoles: item.targetRoles,
          jafuri:      item.jafuri,
          weekStart,
          createdBy:   item.createdBy,
        },
      })
    }
  }

  const [items, payments, members] = await Promise.all([
    (prisma as any).taxItem.findMany({ where: { weekStart }, orderBy: { createdAt: 'asc' } }),
    (prisma as any).taxPayment.findMany({
      where:   { weekStart },
      include: { user: { select: { username: true, avatar: true, discordId: true, roleIds: true } } },
    }),
    prisma.user.findMany({
      where:  { roleIds: { hasSome: ALL_ROLE_IDS } },
      select: { id: true, username: true, avatar: true, discordId: true, roleIds: true },
    })
  ])

  return NextResponse.json({ items, payments, members, weekStart: weekStart.toISOString(), taxPaused: config.taxPaused, canToggleTax })
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireLeadership()
  if (error) return error

  const { items } = await req.json()
  if (!Array.isArray(items)) return NextResponse.json({ error: 'Items invalid' }, { status: 400 })

  const weekStart = getWeekStart()
  await (prisma as any).taxItem.deleteMany({ where: { weekStart } })
  if (items.length === 0) return NextResponse.json({ items: [] })

  const created = await Promise.all(
    items
      .filter((item: any) => item.name && item.name.trim() !== '')
      .map((item: any) =>
        (prisma as any).taxItem.create({
          data: {
            name:        item.name.trim(),
            bucati:      parseInt(item.bucati) || 0,
            termen:      item.termen && item.termen.trim() !== '' ? new Date(item.termen) : null,
            targetRoles: Array.isArray(item.targetRoles) ? item.targetRoles : [],
            jafuri:      item.jafuri || null,
            weekStart,
            createdBy:   session!.user.id,
          },
        })
      )
  )

  const siteConfig = await (prisma as any).siteConfig.upsert({
    where: { id: 'main' },
    update: {},
    create: { id: 'main' },
  })

  if (!siteConfig.taxPaused) {
    await notifyAll({
      type:    'tax',
      title:   '💰 Taxă Sindicat Nouă',
      message: 'Taxa pentru săptămâna aceasta a fost setată. Verifică materialele de predat!',
    })
  }

  return NextResponse.json({ items: created })
}

export async function PATCH(req: NextRequest) {
  const { session, error } = await requireLeadership()
  if (error) return error

  const body = await req.json()

  // Pauza globala poate fi controlata strict de Lider si Lider Secundar.
  if (body.action === 'setTaxPaused') {
    const roleIds = (session!.user.roleIds || []) as string[]
    const allowed = session!.user.discordId === SITE_OWNER_DISCORD_ID || roleIds.some(id => TAX_PAUSE_ROLE_IDS.includes(id))

    if (!allowed) {
      return NextResponse.json(
        { error: 'Doar Liderul și Liderul Secundar pot modifica pauza taxei.' },
        { status: 403 }
      )
    }

    if (typeof body.paused !== 'boolean') {
      return NextResponse.json({ error: 'Valoare paused invalidă' }, { status: 400 })
    }

    const config = await (prisma as any).siteConfig.upsert({
      where: { id: 'main' },
      update: { taxPaused: body.paused },
      create: { id: 'main', taxPaused: body.paused },
    })

    return NextResponse.json({ success: true, taxPaused: config.taxPaused })
  }

  const { userId, roleId, paid, action } = body
  const weekStart = getWeekStart()

  // Reset toate platile (inafara de Muncitori)
  if (action === 'reset') {
    const membersToReset = await prisma.user.findMany({
      where:  { roleIds: { hasSome: ALL_ROLE_IDS } },
      select: { id: true, roleIds: true },
    })

    const nonMuncitori = membersToReset.filter(
      m => !m.roleIds.includes(MUNCITOR_ROLE_ID) ||
           m.roleIds.some(r => ALL_ROLE_IDS.filter(id => id !== MUNCITOR_ROLE_ID).includes(r))
    )

    await (prisma as any).taxPayment.updateMany({
      where: {
        weekStart,
        userId: { in: nonMuncitori.map(m => m.id) },
        roleId: { not: MUNCITOR_ROLE_ID },
      },
      data: { paid: false, paidAt: null },
    })

    return NextResponse.json({ success: true, reset: nonMuncitori.length })
  }

  if (!userId) return NextResponse.json({ error: 'userId lipsa' }, { status: 400 })

  const finalRoleId = roleId || 'all'
  const payment = await (prisma as any).taxPayment.upsert({
    where:  { userId_roleId_weekStart: { userId, roleId: finalRoleId, weekStart } },
    update: { paid, paidAt: paid ? new Date() : null },
    create: { userId, roleId: finalRoleId, weekStart, paid, paidAt: paid ? new Date() : null },
  })

  return NextResponse.json({ payment })
}

export async function DELETE(req: NextRequest) {
  const { error } = await requireLeadership()
  if (error) return error

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id lipsa' }, { status: 400 })

  await (prisma as any).taxItem.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
