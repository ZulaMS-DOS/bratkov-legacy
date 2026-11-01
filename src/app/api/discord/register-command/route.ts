import { NextResponse } from 'next/server'
import { requireLeadership } from '@/lib/middleware'

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID!
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!
const DISCORD_GUILD_ID  = process.env.DISCORD_GUILD_ID!

export async function GET() {
  const { error } = await requireLeadership()
  if (error) return error

  const commands = [
    {
      name:        'jaf-procesat',
      description: 'Acordă puncte fixe pentru un jaf procesat',
      options: [
        {
          type:        3,
          name:        'tip-jaf',
          description: 'Tipul jafului procesat',
          required:    true,
          choices: [
            { name: 'Vinewood (1.5 pts)',  value: 'vinewood'    },
            { name: 'Alta (1.5 pts)',      value: 'alta'        },
            { name: 'Desert (1.5 pts)',    value: 'desert'      },
            { name: 'Highway (1.5 pts)',   value: 'highway'     },
            { name: 'Pacific (2 pts)',     value: 'pacific'     },
            { name: 'Blaine (2 pts)',      value: 'blaine'      },
            { name: 'Biju (2 pts)',        value: 'biju'        },
            { name: 'ATM (1.5 pts)',       value: 'atm'         },
            { name: 'Magazin (1 pt)',      value: 'magazin'     },
            { name: 'Digital Den (2 pts)', value: 'digital_den' },
            { name: 'Farmacie (2 pts)',     value: 'farmacie'    },
          ],
        },
        {
          type:        3,
          name:        'useri',
          description: 'Menționează userii (ex: @user1 @user2)',
          required:    true,
        },
      ],
    },
    {
      name:        'taxa24h',
      description: 'Acordă 10 puncte fixe pentru Taxa 24 Ore',
      options: [
        {
          type:        3,
          name:        'useri',
          description: 'Menționează userii (ex: @user1 @user2)',
          required:    true,
        },
      ],
    },
    {
      name:        'activitate',
      description: 'Acordă puncte manuale pentru activitate',
      options: [
        {
          type:        10,
          name:        'puncte',
          description: 'Câte puncte acorzi (accepta zecimale, ex: 2.5)',
          required:    true,
        },
        {
          type:        3,
          name:        'useri',
          description: 'Menționează userii (ex: @user1 @user2)',
          required:    true,
        },
      ],
    },
    {
      name:        'taxa',
      description: 'Marchează taxa achitată pentru un membru',
      options: [
        {
          type:        6, // USER
          name:        'user',
          description: 'Menționează membrul',
          required:    true,
        },
        {
          type:        3, // STRING
          name:        'grad',
          description: 'Gradul pentru care se marchează taxa',
          required:    true,
          choices: [
            { name: 'Lider',            value: '1107100643291828224' },
            { name: 'Co-Lider',         value: '1107099637644529684' },
            { name: 'Tester',           value: '1107098741510520852' },
            { name: 'Membru',           value: '1107095888045801532' },
            { name: 'Bratkov Enforcer', value: '1518710460717731840' },
            { name: 'Muncitor',         value: '1107093171026010203' },
          ],
        },
      ],
    }, // <-- Virgula lipsă a fost adăugată aici
    {
      name:        'grad',
      description: 'Oferă un grad unui membru',
      options: [
        {
          type:        6,
          name:        'user',
          description: 'Menționează membrul',
          required:    true,
        },
        {
          type:        3,
          name:        'grad',
          description: 'Gradul de acordat',
          required:    true,
          choices: [
            { name: '🌽 Farmer',           value: '1542820259809984592' },
            { name: '🔫 Recrut Jaf',       value: '1542836238707331102' },
            { name: '⚔️ Bratkov Enforcer', value: '1518710460717731840' },
          ],
        },
      ],
    },
  ]

  const results = []
  for (const command of commands) {
    const res = await fetch(
      `https://discord.com/api/v10/applications/${DISCORD_CLIENT_ID}/guilds/${DISCORD_GUILD_ID}/commands`,
      {
        method:  'POST',
        headers: {
          'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify(command),
      }
    )
    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json({ error: 'Eroare Discord', command: command.name, details: data }, { status: 500 })
    }
    results.push(data)
  }

  return NextResponse.json({ success: true, commands: results })
}
