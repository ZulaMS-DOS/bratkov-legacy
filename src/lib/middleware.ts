import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { NextResponse } from 'next/server'
import {
  canGiveFines,
  canManageRequests,
  isFullLeadership,
  SITE_OWNER_DISCORD_ID,
} from '@/lib/discord'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rateLimit'

export async function requireAuth() {
  const session = await getServerSession(authOptions)

  if (!session) {
    return {
      session: null,
      error: NextResponse.json(
        { error: 'Neautentificat' },
        { status: 401 }
      ),
    }
  }

  // Rate limit general — max 30 acțiuni pe minut per user
  const rl = checkRateLimit(
    `user:${session.user.id}`,
    RATE_LIMITS.general
  )

  if (!rl.allowed) {
    return {
      session: null,
      error: NextResponse.json(
        {
          error: `Prea multe cereri! Mai încearcă în ${rl.retryAfterSeconds}s.`,
        },
        { status: 429 }
      ),
    }
  }

  return { session, error: null }
}

export async function requireLeadership() {
  const { session, error } = await requireAuth()

  if (error || !session) {
    return {
      session: null,
      error: error ?? NextResponse.json(
        { error: 'Neautentificat' },
        { status: 401 }
      ),
    }
  }

  // Verificăm separat ID-ul Discord al Owner-ului.
  const discordId = (session.user as any).discordId
  const isOwner = discordId === SITE_OWNER_DISCORD_ID
  const hasLeadership = isFullLeadership(
    session.user.roleIds || []
  )

  if (!isOwner && !hasLeadership) {
    return {
      session: null,
      error: NextResponse.json(
        { error: 'Acces interzis — Leadership only' },
        { status: 403 }
      ),
    }
  }

  return { session, error: null }
}

export async function requireFineGiver() {
  const { session, error } = await requireAuth()

  if (error || !session) {
    return {
      session: null,
      error: error ?? NextResponse.json(
        { error: 'Neautentificat' },
        { status: 401 }
      ),
    }
  }

  if (!canGiveFines(session.user.roleIds || [])) {
    return {
      session: null,
      error: NextResponse.json(
        { error: 'Acces interzis' },
        { status: 403 }
      ),
    }
  }

  return { session, error: null }
}

export async function requireRequestManager() {
  const { session, error } = await requireAuth()

  if (error || !session) {
    return {
      session: null,
      error: error ?? NextResponse.json(
        { error: 'Neautentificat' },
        { status: 401 }
      ),
    }
  }

  if (!canManageRequests(session.user.roleIds || [])) {
    return {
      session: null,
      error: NextResponse.json(
        { error: 'Acces interzis' },
        { status: 403 }
      ),
    }
  }

  return { session, error: null }
}
