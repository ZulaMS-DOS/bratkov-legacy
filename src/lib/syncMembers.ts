import { prisma } from '@/lib/prisma'

const DISCORD_GUILD_ID  = process.env.DISCORD_GUILD_ID!
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!
const MUNCITOR_ROLE_ID  = '1107093171026010203'
const MEMBRU_ROLE_ID    = '1107095888045801532'
const NOTIFY_CHANNEL_ID = '1542818782979031070'
const DIVIDER           = '━━━━━━━━━━━━━━━━━━━━'

async function fetchAllDiscordMembers() {
  const allMembers: any[] = []
  let after = '0'
  while (true) {
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members?limit=1000&after=${after}`,
      { headers: { 'Authorization': `Bot ${DISCORD_BOT_TOKEN}` } }
    )
    if (!res.ok) throw new Error(`Discord API error: ${res.status}`)
    const batch = await res.json()
    if (!batch.length) break
    allMembers.push(...batch)
    after = batch[batch.length - 1].user.id
    if (batch.length < 1000) break
  }
  return allMembers
}

async function saveLog(categorie: string, titlu: string, continut: string) {
  try {
    await (prisma as any).botLog.create({
      data: { categorie, titlu, continut },
    })
  } catch {}
}

async function deleteOldMessages() {
  try {
    const existing = await fetch(
      `https://discord.com/api/v10/channels/${NOTIFY_CHANNEL_ID}/messages?limit=10`,
      { headers: { 'Authorization': `Bot ${DISCORD_BOT_TOKEN}` } }
    )
    const messages = await existing.json()
    if (Array.isArray(messages)) {
      for (const msg of messages) {
        if (msg.author?.bot) {
          await fetch(
            `https://discord.com/api/v10/channels/${NOTIFY_CHANNEL_ID}/messages/${msg.id}`,
            { method: 'DELETE', headers: { 'Authorization': `Bot ${DISCORD_BOT_TOKEN}` } }
          )
          await new Promise(r => setTimeout(r, 500))
        }
      }
    }
  } catch {}
}

async function sendDiscordMessage(content: string) {
  try {
    await deleteOldMessages()
    await fetch(`https://discord.com/api/v10/channels/${NOTIFY_CHANNEL_ID}/messages`, {
      method:  'POST',
      headers: { 'Authorization': `Bot ${DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ content }),
    })
  } catch {}
}

async function addRole(discordId: string, roleId: string) {
  try {
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${discordId}/roles/${roleId}`,
      { method: 'PUT', headers: { 'Authorization': `Bot ${DISCORD_BOT_TOKEN}` } }
    )
    if (!res.ok) {
      const err = await res.json()
      console.error('Eroare addRole:', err)
    }
  } catch (e: any) {
    console.error('Eroare addRole fetch:', e.message)
  }
}

async function removeRole(discordId: string, roleId: string) {
  try {
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${discordId}/roles/${roleId}`,
      { method: 'DELETE', headers: { 'Authorization': `Bot ${DISCORD_BOT_TOKEN}` } }
    )
    if (!res.ok) {
      const err = await res.json()
      console.error('Eroare removeRole:', err)
    }
  } catch (e: any) {
    console.error('Eroare removeRole fetch:', e.message)
  }
}

function getWeekStart() {
  const now  = new Date()
  const day  = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(now)
  monday.setDate(diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

async function hasPaidTaxa(userId: string): Promise<boolean> {
  const weekStart = getWeekStart()
  // Verifica plata pentru rolul de Muncitor SAU 'all'
  const payments = await (prisma as any).taxPayment.findMany({
    where: {
      userId,
      weekStart,
      paid: true,
      roleId: { in: ['all', MUNCITOR_ROLE_ID] },
    },
  })
  return payments.length > 0
}

export async function syncDiscordMembers() {
  const discordMembers = await fetchAllDiscordMembers()
  const discordIds     = new Set(discordMembers.map((m: any) => m.user.id))
  const now            = new Date()
  const siteConfig = await (prisma as any).siteConfig.upsert({ where: { id: 'main' }, update: {}, create: { id: 'main' } })
  const taxPaused = siteConfig.taxPaused

  for (const m of discordMembers) {
    const discordId  = m.user.id
    const username   = m.nick || m.user.global_name || m.user.username
    const roleIds    = m.roles || []
    const avatar     = m.user.avatar
      ? `https://cdn.discordapp.com/avatars/${discordId}/${m.user.avatar}.png`
      : null
    const isMuncitor = roleIds.includes(MUNCITOR_ROLE_ID)

    const existing = await prisma.user.findUnique({
      where:  { discordId },
      select: { id: true, joinedAt: true },
    })

    if (existing) {
      await prisma.user.update({
        where: { discordId },
        data:  { username, roleIds, avatar },
      })
    } else {
      await prisma.user.create({
        data: {
          discordId, username, roleIds, avatar, points: 0,
          joinedAt: isMuncitor ? new Date(m.joined_at) : null,
        },
      })
    }
  }

  // Stergere useri plecati — DOAR cei fara demisii/invoiri active
  const dbUsers  = await prisma.user.findMany({ select: { id: true, discordId: true } })
  const toDelete = dbUsers.filter((u: any) => !discordIds.has(u.discordId))
  if (toDelete.length) {
    await prisma.user.deleteMany({
      where: { id: { in: toDelete.map((u: any) => u.id) } },
    })
  }

  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  // ── ZIUA 6 — Reminder cu o zi înainte ──────────────────────
  const sixDaysAgo    = new Date(now)
  sixDaysAgo.setDate(sixDaysAgo.getDate() - 6)
  sixDaysAgo.setHours(0, 0, 0, 0)
  const sixDaysAgoEnd = new Date(sixDaysAgo)
  sixDaysAgoEnd.setDate(sixDaysAgoEnd.getDate() + 1)

  const reminderMuncitori = await prisma.user.findMany({
    where: {
      roleIds:  { has: MUNCITOR_ROLE_ID },
      joinedAt: { gte: sixDaysAgo, lt: sixDaysAgoEnd },
    },
    select: { id: true, username: true, discordId: true, joinedAt: true },
  })

  if (reminderMuncitori.length > 0) {
    const alreadyReminded = await (prisma as any).notification.findFirst({
      where: {
        type:      'task',
        title:     '⚠️ Muncitori — Reminder Perioadă Probă',
        createdAt: { gte: todayStart },
      },
    })

    if (!alreadyReminded) {
      const lines = reminderMuncitori.map((u: any) =>
        `${DIVIDER}\n` +
        `> 👤 <@${u.discordId}> **(${u.username})**\n` +
        `> 📅 Intrat pe: ${u.joinedAt ? new Date(u.joinedAt).toLocaleDateString('ro-RO') : '?'}\n` +
        `> ⏳ Perioada de probă expiră **mâine!**`
      )

      const reminderMsg =
        `## ⚠️ Muncitori — Perioadă de Probă Expiră Mâine!\n` +
        `${DIVIDER}\n` +
        lines.join('\n') + '\n' +
        `${DIVIDER}\n` +
        `<@&1107100643291828224> <@&1515017621127299303> <@&1107099637644529684>`

      await sendDiscordMessage(reminderMsg)
      await saveLog('muncitori', '⚠️ Reminder Perioadă Probă', reminderMsg)

      // Marker ca sa nu trimita de mai multe ori azi
      const leaders = await prisma.user.findMany({
        where:  { roleIds: { hasSome: ['1107100643291828224', '1107099637644529684'] } },
        select: { id: true },
      })
      if (leaders.length > 0) {
        await (prisma as any).notification.create({
          data: {
            userId:  leaders[0].id,
            type:    'task',
            title:   '⚠️ Muncitori — Reminder Perioadă Probă',
            message: `${reminderMuncitori.length} muncitori expira maine.`,
            read:    true, // marcam ca citit automat — nu apare ca notificare
          },
        })
      }
    }
  }

  // ── ZIUA 7 — Expirare + promovare automată ──────────────────
  const sevenDaysAgo    = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  sevenDaysAgo.setHours(0, 0, 0, 0)
  const sevenDaysAgoEnd = new Date(sevenDaysAgo)
  sevenDaysAgoEnd.setDate(sevenDaysAgoEnd.getDate() + 1)

  const expiringMuncitori = await prisma.user.findMany({
    where: {
      roleIds:  { has: MUNCITOR_ROLE_ID },
      joinedAt: { gte: sevenDaysAgo, lt: sevenDaysAgoEnd },
    },
    select: { id: true, username: true, discordId: true, joinedAt: true, roleIds: true },
  })

  if (expiringMuncitori.length > 0) {
    const alreadyNotified = await (prisma as any).notification.findFirst({
      where: {
        type:      'task',
        title:     '⏰ Muncitori — Perioadă Probă Expirată',
        createdAt: { gte: todayStart },
      },
    })

    if (!alreadyNotified) {
      const promotati:   string[] = []
      const nepromotati: string[] = []

      for (const u of expiringMuncitori) {
        const paid      = taxPaused || await hasPaidTaxa(u.id)
        const joinedStr = u.joinedAt ? new Date(u.joinedAt).toLocaleDateString('ro-RO') : '?'

        if (paid) {
          await removeRole(u.discordId, MUNCITOR_ROLE_ID)
          await addRole(u.discordId, MEMBRU_ROLE_ID)
          const newRoleIds = (u.roleIds as string[])
            .filter((r: string) => r !== MUNCITOR_ROLE_ID)
            .concat(MEMBRU_ROLE_ID)
          await prisma.user.update({
            where: { id: u.id },
            data:  { roleIds: { set: newRoleIds }, joinedAt: null },
          })
          promotati.push(
            `${DIVIDER}\n` +
            `> 👤 <@${u.discordId}> **(${u.username})**\n` +
            `> 📅 Intrat pe: ${joinedStr}\n` +
            `> 💰 Taxă: ${taxPaused ? '⏸️ Suspendată' : '✅ Achitată'}\n` +
            `> 🎉 **Promovat automat la Membru!**`
          )
        } else {
          nepromotati.push(
            `${DIVIDER}\n` +
            `> 👤 <@${u.discordId}> **(${u.username})**\n` +
            `> 📅 Intrat pe: ${joinedStr}\n` +
            `> 💰 Taxă: ❌ Neachitată\n` +
            `> ⚠️ **Necesită decizie manuală!**`
          )
        }
      }

      let message = `## ⏰ Muncitori — Perioadă de Probă Expirată!\n${DIVIDER}\n`
      if (promotati.length > 0) {
        message += `**✅ Promovați automat la Membru (${promotati.length}):**\n`
        message += promotati.join('\n') + '\n'
      }
      if (nepromotati.length > 0) {
        message += `**❌ Necesită decizie manuală (${nepromotati.length}):**\n`
        message += nepromotati.join('\n') + '\n'
      }
      message += `${DIVIDER}\n<@&1515017621127299303> <@&1107100643291828224>`

      await sendDiscordMessage(message)
      await saveLog('muncitori', '⏰ Perioadă Probă Expirată', message)

      // Marker citit automat
      const leaders = await prisma.user.findMany({
        where:  { roleIds: { hasSome: ['1107100643291828224', '1107099637644529684'] } },
        select: { id: true },
      })
      if (leaders.length > 0) {
        await (prisma as any).notification.create({
          data: {
            userId:  leaders[0].id,
            type:    'task',
            title:   '⏰ Muncitori — Perioadă Probă Expirată',
            message: `${promotati.length} promovați, ${nepromotati.length} necesită decizie manuală.`,
            read:    true,
          },
        })
      }
    }
  }

  return {
    totalOnServer:     discordMembers.length,
    deleted:           toDelete.length,
    deletedUsers:      toDelete.map((u: any) => u.discordId),
    expiringMuncitori: expiringMuncitori.length,
  }
}
