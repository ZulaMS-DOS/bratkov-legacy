'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { format } from 'date-fns'
import { ro } from 'date-fns/locale'
import { Plus, Check, X } from 'lucide-react'

const SITE_OWNER_DISCORD_ID = '949760812518617138'

const LEADERSHIP_ROLES = [
  '1107100643291828224', // Lider
  '1515017621127299303', // Lider secundar
  '1107099637644529684', // Co-Lider
]

interface Demisie {
  id: string
  reason: string
  status: string
  createdAt: string
  approvedAt: string | null
  username: string | null
  user: { username: string } | null
  approver: { username: string } | null
}

type StatusTab = 'PENDING' | 'ACCEPTED' | 'REJECTED'

const TAB_LABELS: Record<StatusTab, string> = {
  PENDING: 'Pending',
  ACCEPTED: 'Acceptate',
  REJECTED: 'Respinse',
}

const EMPTY_LABELS: Record<StatusTab, string> = {
  PENDING: 'Nicio cerere în așteptare',
  ACCEPTED: 'Nicio cerere acceptată',
  REJECTED: 'Nicio cerere respinsă',
}

export default function DemisiiPage() {
  const { data: session, status: sessionStatus } = useSession()

  const [demisii, setDemisii] = useState<Demisie[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSub] = useState(false)
  const [tab, setTab] = useState<StatusTab>('PENDING')

  const user = session?.user as any

  const canManage =
    user?.discordId === SITE_OWNER_DISCORD_ID ||
    user?.isLeadership === true ||
    user?.roleIds?.some((r: string) =>
      LEADERSHIP_ROLES.includes(r)
    ) === true

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/demisii')
      const d = await r.json()

      if (!r.ok) {
        console.error('Eroare la încărcarea demisiilor:', d.error)
        return
      }

      setDemisii(d.demisii || [])
    } catch (error) {
      console.error('Eroare la încărcarea demisiilor:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (sessionStatus === 'authenticated') {
      load()
    }

    if (sessionStatus === 'unauthenticated') {
      setLoading(false)
    }
  }, [load, sessionStatus])

  const submit = async () => {
    if (!reason.trim() || submitting) return

    setSub(true)

    try {
      const response = await fetch('/api/demisii', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })

      const data = await response.json()

      if (!response.ok) {
        alert(data.error || 'Nu s-a putut trimite demisia.')
        return
      }

      setReason('')
      setShowForm(false)
      await load()
    } catch {
      alert('A apărut o eroare la trimiterea demisiei.')
    } finally {
      setSub(false)
    }
  }

  const review = async (
    id: string,
    status: 'ACCEPTED' | 'REJECTED'
  ) => {
    try {
      const response = await fetch(`/api/demisii/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })

      const data = await response.json()

      if (!response.ok) {
        alert(data.error || 'Nu s-a putut actualiza demisia.')
        return
      }

      await load()
    } catch {
      alert('A apărut o eroare la actualizarea demisiei.')
    }
  }

  const statusBadge = (s: string) => ({
    PENDING: <span className="badge-pending">Pending</span>,
    ACCEPTED: <span className="badge-accepted">Acceptat</span>,
    REJECTED: <span className="badge-rejected">Respins</span>,
  }[s] ?? null)

  const counts = useMemo(() => ({
    PENDING: demisii.filter(d => d.status === 'PENDING').length,
    ACCEPTED: demisii.filter(d => d.status === 'ACCEPTED').length,
    REJECTED: demisii.filter(d => d.status === 'REJECTED').length,
  }), [demisii])

  const filtered = useMemo(
    () => demisii.filter(d => d.status === tab),
    [demisii, tab]
  )

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white">Demisii</h1>
          <p className="text-zinc-500 text-sm mt-1">
            {canManage
              ? 'Toate cererile de demisie ale membrilor'
              : 'Cererile tale de demisie'}
          </p>
        </div>

        <button
          onClick={() => setShowForm(!showForm)}
          className="grove-btn-danger flex items-center gap-2"
        >
          <Plus size={16} /> Demisie
        </button>
      </div>

      {showForm && (
        <div className="grove-card border-red-500/30 animate-slide-up">
          <h2 className="text-sm font-semibold text-red-400 uppercase tracking-widest mb-4">
            🚪 Cerere Demisie
          </h2>

          <div className="mb-4 p-3 bg-red-500/5 border border-red-500/20 rounded-lg text-xs text-red-400">
            ⚠️ Această acțiune notifică leadership-ul imediat.
          </div>

          <div className="form-group">
            <label className="grove-label">Motivul demisiei</label>
            <textarea
              className="grove-input resize-none"
              rows={4}
              placeholder="Explică decizia ta..."
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>

          <div className="flex gap-3 mt-4">
            <button
              onClick={submit}
              disabled={submitting}
              className="grove-btn-danger"
            >
              {submitting ? 'Se trimite...' : '💀 Trimite Demisia'}
            </button>

            <button
              onClick={() => setShowForm(false)}
              className="grove-btn-outline"
            >
              Anulare
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['PENDING', 'ACCEPTED', 'REJECTED'] as StatusTab[]).map(s => (
          <button
            key={s}
            onClick={() => setTab(s)}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
              tab === s
                ? 'bg-grove-green text-black border-grove-green'
                : 'bg-dark-card text-zinc-400 border-dark-border hover:text-white hover:border-grove-border'
            }`}
          >
            {TAB_LABELS[s]}{' '}
            <span className="opacity-60">({counts[s]})</span>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {loading && (
          <div className="grove-card text-center text-zinc-600 py-8">
            Se încarcă...
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="grove-card text-center text-zinc-600 py-8">
            {EMPTY_LABELS[tab]}
          </div>
        )}

        {filtered.map(d => (
          <div key={d.id} className="grove-card">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-semibold text-white">
                    {d.user?.username || d.username || 'Utilizator șters'}
                  </span>
                  {statusBadge(d.status)}
                </div>

                <p className="text-zinc-400 text-sm mb-2">
                  {d.reason}
                </p>

                <div className="text-xs text-zinc-600">
                  {format(
                    new Date(d.createdAt),
                    'dd MMM yyyy HH:mm',
                    { locale: ro }
                  )}
                </div>

                {d.approver && (
                  <div className="mt-2 text-xs text-zinc-600">
                    {d.status === 'ACCEPTED' ? '✅' : '❌'}{' '}
                    {d.approver.username}
                    {d.approvedAt
                      ? ` — ${format(
                          new Date(d.approvedAt),
                          'dd MMM HH:mm',
                          { locale: ro }
                        )}`
                      : ''}
                  </div>
                )}
              </div>

              {canManage && d.status === 'PENDING' && (
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => review(d.id, 'ACCEPTED')}
                    className="p-2 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20"
                    title="Acceptă demisia"
                  >
                    <Check size={14} />
                  </button>

                  <button
                    onClick={() => review(d.id, 'REJECTED')}
                    className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
                    title="Respinge demisia"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
