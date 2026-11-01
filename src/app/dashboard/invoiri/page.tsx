'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { format } from 'date-fns'
import { ro } from 'date-fns/locale'
import { Plus, Check, X } from 'lucide-react'

const LEADERSHIP_ROLES = ['1107100643291828224', '1515017621127299303', '1107099637644529684']
const TESTER_ROLE = '1107098741510520852'
const SITE_OWNER_DISCORD_ID = '949760812518617138'

interface Invoire {
  id: string
  reason: string
  startDate: string
  endDate: string
  status: string
  createdAt: string
  approvedAt: string | null
  user: { username: string | null; avatar: string | null } | null
  approver: { username: string | null } | null
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

export default function InvoiriPage() {
  const { data: session } = useSession()
  const [invoiri, setInvoiri] = useState<Invoire[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSub] = useState(false)
  const [form, setForm] = useState({ reason: '', startDate: '', endDate: '' })
  const [tab, setTab] = useState<StatusTab>('PENDING')

  const canManage = session?.user.discordId === SITE_OWNER_DISCORD_ID || session?.user.roleIds?.some((r: string) =>
    [...LEADERSHIP_ROLES, TESTER_ROLE].includes(r)
  )

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/invoiri')
      if (!r.ok) throw new Error('Nu s-au putut încărca învoirile.')
      const d = await r.json()
      setInvoiri(Array.isArray(d.invoiri) ? d.invoiri : [])
    } catch (error) {
      console.error('Eroare la încărcarea învoirilor:', error)
      setInvoiri([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const submit = async () => {
    if (!form.reason.trim() || !form.startDate || !form.endDate) return
    setSub(true)
    try {
      const response = await fetch('/api/invoiri', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!response.ok) throw new Error('Cererea nu a putut fi trimisă.')
      setForm({ reason: '', startDate: '', endDate: '' })
      setShowForm(false)
      await load()
    } catch (error) {
      console.error('Eroare la trimiterea învoirii:', error)
      alert(error instanceof Error ? error.message : 'A apărut o eroare.')
    } finally {
      setSub(false)
    }
  }

  const review = async (id: string, status: 'ACCEPTED' | 'REJECTED') => {
    try {
      const response = await fetch(`/api/invoiri/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Cererea nu a putut fi actualizată.')
      }
      await load()
    } catch (error) {
      console.error('Eroare la procesarea învoirii:', error)
      alert(error instanceof Error ? error.message : 'A apărut o eroare.')
    }
  }

  const statusBadge = (s: string) => ({
    PENDING: <span className="badge-pending">Pending</span>,
    ACCEPTED: <span className="badge-accepted">Acceptat</span>,
    REJECTED: <span className="badge-rejected">Respins</span>,
  }[s] ?? null)

  const counts = useMemo(() => ({
    PENDING: invoiri.filter(i => i.status === 'PENDING').length,
    ACCEPTED: invoiri.filter(i => i.status === 'ACCEPTED').length,
    REJECTED: invoiri.filter(i => i.status === 'REJECTED').length,
  }), [invoiri])

  const filtered = useMemo(() => invoiri.filter(i => i.status === tab), [invoiri, tab])

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white">Învoiri</h1>
          <p className="text-zinc-500 text-sm mt-1">
            {canManage ? 'Toate cererile de învoire ale membrilor' : 'Cererile tale de învoire'}
          </p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="grove-btn flex items-center gap-2">
          <Plus size={16} /> Cerere Nouă
        </button>
      </div>

      {showForm && (
        <div className="grove-card border-grove-border animate-slide-up">
          <h2 className="text-sm font-semibold text-grove-green uppercase tracking-widest mb-4">📝 Cerere Învoire</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="grove-label">Motiv</label>
              <textarea className="grove-input resize-none" rows={3} placeholder="Descrie motivul învoirii..."
                value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
            <div>
              <label className="grove-label">Data Început</label>
              <input type="date" className="grove-input" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div>
              <label className="grove-label">Data Sfârșit</label>
              <input type="date" className="grove-input" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={submit} disabled={submitting} className="grove-btn">{submitting ? 'Se trimite...' : 'Trimite Cererea'}</button>
            <button onClick={() => setShowForm(false)} className="grove-btn-outline">Anulare</button>
          </div>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['PENDING', 'ACCEPTED', 'REJECTED'] as StatusTab[]).map(s => (
          <button key={s} onClick={() => setTab(s)}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
              tab === s
                ? 'bg-grove-green text-black border-grove-green'
                : 'bg-dark-card text-zinc-400 border-dark-border hover:text-white hover:border-grove-border'
            }`}>
            {TAB_LABELS[s]} <span className="opacity-60">({counts[s]})</span>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {loading && <div className="grove-card text-center text-zinc-600 py-8">Se încarcă...</div>}
        {!loading && filtered.length === 0 && (
          <div className="grove-card text-center text-zinc-600 py-8">{EMPTY_LABELS[tab]}</div>
        )}
        {filtered.map(inv => (
          <div key={inv.id} className="grove-card">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-semibold text-white">{inv.user?.username || 'Membru necunoscut'}</span>
                  {statusBadge(inv.status)}
                </div>
                <p className="text-zinc-400 text-sm mb-2">{inv.reason}</p>
                <div className="flex flex-wrap gap-4 text-xs text-zinc-600">
                  <span>📅 {format(new Date(inv.startDate), 'dd MMM yyyy', { locale: ro })} → {format(new Date(inv.endDate), 'dd MMM yyyy', { locale: ro })}</span>
                  <span>🕐 {format(new Date(inv.createdAt), 'dd MMM HH:mm', { locale: ro })}</span>
                </div>
                {inv.approver?.username && (
                  <div className="mt-2 text-xs text-zinc-600">
                    {inv.status === 'ACCEPTED' ? '✅' : '❌'} {inv.approver.username} — {inv.approvedAt ? format(new Date(inv.approvedAt), 'dd MMM HH:mm', { locale: ro }) : ''}
                  </div>
                )}
              </div>
              {canManage && inv.status === 'PENDING' && (
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => review(inv.id, 'ACCEPTED')} aria-label="Acceptă învoirea" className="p-2 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors border border-green-500/20"><Check size={14} /></button>
                  <button onClick={() => review(inv.id, 'REJECTED')} aria-label="Respinge învoirea" className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors border border-red-500/20"><X size={14} /></button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
