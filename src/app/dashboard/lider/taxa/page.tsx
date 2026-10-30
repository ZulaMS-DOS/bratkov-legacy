'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Trash2, Save, Users, RefreshCw, X, RotateCcw, Pause, Play } from 'lucide-react'
import { format } from 'date-fns'
import { ro } from 'date-fns/locale'
import Image from 'next/image'

const GRADE_OPTIONS = [
  { id: '1107100643291828224', label: 'Lider',            color: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10' },
  { id: '1107099637644529684', label: 'Co-Lider',         color: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
  { id: '1107098741510520852', label: 'Tester',           color: 'text-purple-400 border-purple-500/30 bg-purple-500/10' },
  { id: '1107095888045801532', label: 'Membru',           color: 'text-grove-green border-grove-border bg-grove-dim' },
  { id: '1518710460717731840', label: 'Bratkov Enforcer', color: 'text-red-400 border-red-500/30 bg-red-500/10' },
  { id: '1107093171026010203', label: 'Muncitor',         color: 'text-zinc-400 border-zinc-600/30 bg-zinc-600/10' },
]

const GROVE_KILLER_ID = '1518710460717731840'

const JAF_TYPES = [
  { value: 'vinewood',    label: '🎬 Vinewood'    },
  { value: 'alta',        label: '🏦 Alta'        },
  { value: 'desert',      label: '🏜️ Desert'      },
  { value: 'highway',     label: '🛣️ Highway'     },
  { value: 'pacific',     label: '🌊 Pacific'     },
  { value: 'blaine',      label: '⛰️ Blaine'      },
  { value: 'biju',        label: '💎 Biju'        },
  { value: 'magazin',     label: '🏪 Magazin'     },
  { value: 'digital_den', label: '💻 Digital Den' },
  { value: 'atm',         label: '💳 ATM'         },

]

interface JafEntry { type: string; count: number }
interface TaxItem {
  id?: string; name: string; bucati: number; termen: string
  targetRoles: string[]; jafuri: JafEntry[] | null
}
interface Payment {
  id: string; paid: boolean; paidAt: string | null
  user: { username: string; avatar: string | null; discordId: string; roleIds: string[] }
  roleId?: string
}
interface Member { id: string; username: string; avatar: string | null; discordId: string; roleIds: string[] }

const emptyItem = (): TaxItem => ({ name: '', bucati: 0, termen: '', targetRoles: [], jafuri: null })

export default function LiderTaxaPage() {
  const [items, setItems]         = useState<TaxItem[]>([emptyItem()])
  const [payments, setPayments]   = useState<Payment[]>([])
  const [members, setMembers]     = useState<Member[]>([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [deleting, setDeleting]   = useState<number | null>(null)
  const [toggling, setToggling]   = useState<string | null>(null)
  const [msg, setMsg]             = useState('')
  const [resetting, setResetting] = useState(false)
  const [taxPaused, setTaxPaused] = useState(false)
  const [canToggleTax, setCanToggleTax] = useState(false)
  const [taxPauseBusy, setTaxPauseBusy] = useState(false)
  const [tab, setTab]             = useState<'seteaza' | 'status'>('seteaza')
  const [activeGrade, setActiveGrade] = useState<string>(GRADE_OPTIONS[0].id)

  const itemsRef = useRef<TaxItem[]>(items)
  useEffect(() => { itemsRef.current = items }, [items])

  const load = useCallback(async () => {
    const r = await fetch('/api/taxa/admin')
    const d = await r.json()
    if (d.items?.length) {
      setItems(d.items.map((i: any) => ({
        id:          i.id,
        name:        i.name,
        bucati:      i.bucati,
        termen:      i.termen ? new Date(i.termen).toISOString().split('T')[0] : '',
        targetRoles: i.targetRoles || [],
        jafuri:      i.jafuri || null,
      })))
    } else {
      setItems([emptyItem()])
    }
    setPayments(d.payments || [])
    setMembers(d.members   || [])
    setTaxPaused(Boolean(d.taxPaused))
    setCanToggleTax(Boolean(d.canToggleTax))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const addItem = () => setItems(prev => [...prev, emptyItem()])

  const removeItem = async (idx: number) => {
    const item = items[idx]
    if (item.id) {
      setDeleting(idx)
      await fetch('/api/taxa/admin', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id: item.id }),
      })
      setDeleting(null)
      setMsg('🗑️ Material șters!')
      setTimeout(() => setMsg(''), 3000)
    }
    setItems(prev => {
      const filtered = prev.filter((_, j) => j !== idx)
      return filtered.length ? filtered : [emptyItem()]
    })
  }

  const updateItem = (idx: number, field: keyof TaxItem, value: any) => {
    setItems(prev => prev.map((item, j) => j === idx ? { ...item, [field]: value } : item))
  }

  const toggleRole = (idx: number, roleId: string) => {
    setItems(prev => prev.map((item, j) => {
      if (j !== idx) return item
      const has = item.targetRoles.includes(roleId)
      const newRoles = has ? item.targetRoles.filter(r => r !== roleId) : [...item.targetRoles, roleId]
      const newJafuri = newRoles.includes(GROVE_KILLER_ID) && !item.jafuri ? [] : item.jafuri
      return { ...item, targetRoles: newRoles, jafuri: newJafuri }
    }))
  }

  const addJaf = (idx: number) => {
    setItems(prev => prev.map((item, j) => {
      if (j !== idx) return item
      return { ...item, jafuri: [...(item.jafuri || []), { type: 'alta', count: 1 }] }
    }))
  }

  const updateJaf = (idx: number, jafIdx: number, field: 'type' | 'count', value: string | number) => {
    setItems(prev => prev.map((item, j) => {
      if (j !== idx) return item
      const finalValue = field === 'type' ? String(value).toLowerCase() : value
      const jafuri = (item.jafuri || []).map((jaf, k) => k === jafIdx ? { ...jaf, [field]: finalValue } : jaf)
      return { ...item, jafuri }
    }))
  }

  const removeJaf = (idx: number, jafIdx: number) => {
    setItems(prev => prev.map((item, j) => {
      if (j !== idx) return item
      return { ...item, jafuri: (item.jafuri || []).filter((_, k) => k !== jafIdx) }
    }))
  }

  const save = async () => {
    const valid = itemsRef.current.filter(i => i.name.trim() !== '')
    setSaving(true)
    const r = await fetch('/api/taxa/admin', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ items: valid }),
    })
    if (r.ok) { setMsg(`✅ Taxa salvată! ${valid.length} materiale.`); await load() }
    else       { setMsg('❌ Eroare la salvare') }
    setSaving(false)
    setTimeout(() => setMsg(''), 4000)
  }

  const togglePaid = async (memberId: string, currentPaid: boolean, roleId: string) => {
    setToggling(memberId)
    await fetch('/api/taxa/admin', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ userId: memberId, roleId, paid: !currentPaid }),
    })
    await load()
    setToggling(null)
  }
  const toggleTaxPause = async () => {
    const nextPaused = !taxPaused
    const confirmed = confirm(
      nextPaused
        ? 'Suspendă taxa pentru toți membrii? Nu se vor trimite notificări pentru neachitare, iar Muncitorii vor fi promovați după 7 zile.'
        : 'Reactivează taxa? Verificările și notificările normale vor fi reluate.'
    )
    if (!confirmed) return

    setTaxPauseBusy(true)
    try {
      const r = await fetch('/api/taxa/admin', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setTaxPaused', paused: nextPaused }),
      })
      const d = await r.json()
      if (!r.ok) {
        setMsg(d.error || '❌ Nu s-a putut modifica starea taxei.')
      } else {
        setTaxPaused(Boolean(d.taxPaused))
        setMsg(d.taxPaused ? '⏸️ Taxa a fost suspendată pentru toți.' : '▶️ Taxa a fost reactivată.')
      }
    } catch {
      setMsg('❌ Eroare de conexiune la modificarea taxei.')
    } finally {
      setTaxPauseBusy(false)
      setTimeout(() => setMsg(''), 4000)
    }
  }

  const resetAll = async () => {
  if (!confirm('Ești sigur? Toți membrii (exceptând Muncitorii) vor fi trecuți pe neachitat!')) return

  setResetting(true)

  const r = await fetch('/api/taxa/admin', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reset' }),
  })

  if (r.ok) {
    setMsg('✅ Reset efectuat!')
    await load()
  } else {
    setMsg('❌ Eroare la reset')
  }

  setResetting(false)
  setTimeout(() => setMsg(''), 3000)
}

  // Map cu cheie userId_roleId pentru plati separate per grad
  const paidMap = new Map(payments.map((p: any) => [`${p.userId}_${p.roleId}`, p]))

  const gradesWithMembers = GRADE_OPTIONS.map(grade => {
    const gradeMembers = members.filter(m => m.roleIds.includes(grade.id))
    const paidCount    = gradeMembers.filter(m => paidMap.get(`${m.id}_${grade.id}`)?.paid).length
    return { ...grade, members: gradeMembers, paidCount, total: gradeMembers.length }
  }).filter(g => g.total > 0)

  const totalPaid  = payments.filter(p => p.paid).length
  const totalCount = members.length

  // Gradul activ pentru status
  const activeGradeData = gradesWithMembers.find(g => g.id === activeGrade) || gradesWithMembers[0]
  const [jafProgress, setJafProgress] = useState<any[]>([])

  useEffect(() => {
    if (activeGrade === GROVE_KILLER_ID && tab === 'status') {
      fetch('/api/taxa/progress')
        .then(r => r.json())
        .then(d => setJafProgress(d.progress || []))
    }
  }, [activeGrade, tab])

  return (
    <div className="space-y-5 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white">Taxa Sindicat — Lider</h1>
          <p className="text-zinc-500 text-sm mt-1">Setează materialele și marchează plățile</p>
        </div>
        <div className="flex gap-2">
  {canToggleTax && (
    <button
      onClick={toggleTaxPause}
      disabled={taxPauseBusy}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-50 ${
        taxPaused
          ? 'text-green-400 border-green-500/30 bg-green-500/10 hover:bg-green-500/20'
          : 'text-amber-400 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20'
      }`}
    >
      {taxPauseBusy ? <RefreshCw size={14} className="animate-spin" /> : taxPaused ? <Play size={14} /> : <Pause size={14} />}
      {taxPauseBusy ? 'Se actualizează...' : taxPaused ? 'Reactivează taxa' : 'Suspendă taxa'}
    </button>
  )}
  <button
    onClick={resetAll}
    disabled={resetting}
    className="flex items-center gap-2 px-3 py-2 rounded-lg text-red-400 hover:bg-red-500/10 border border-red-500/20 text-xs font-semibold transition-colors disabled:opacity-50"
  >
    <RotateCcw size={14} className={resetting ? 'animate-spin' : ''} />
    {resetting ? 'Se resetează...' : 'Reset Săptămână'}
  </button>

  <button
    onClick={load}
    className="p-2 rounded-lg text-zinc-600 hover:text-grove-green hover:bg-grove-dim transition-colors"
  >
    <RefreshCw size={16} />
  </button>
</div>
      </div>

      <div className="flex gap-1 border-b border-dark-border">
        <button onClick={() => setTab('seteaza')}
          className={`px-5 py-2.5 text-sm font-medium transition-all ${
            tab === 'seteaza' ? 'text-grove-green border-b-2 border-grove-green' : 'text-zinc-500 hover:text-white'
          }`}>
          📋 Setează Taxa
        </button>
        <button onClick={() => setTab('status')}
          className={`px-5 py-2.5 text-sm font-medium transition-all flex items-center gap-2 ${
            tab === 'status' ? 'text-grove-green border-b-2 border-grove-green' : 'text-zinc-500 hover:text-white'
          }`}>
          <Users size={14} /> Status Membri
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-grove-dim text-grove-green border border-grove-border">
            {totalPaid}/{totalCount}
          </span>
        </button>
      </div>

      {taxPaused && (
        <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-sm">
          ⏸️ Taxa Sindicat este suspendată pentru toți membrii. Plățile și istoricul sunt păstrate.
        </div>
      )}
      {msg && <div className="p-3 bg-dark-hover rounded-xl text-sm text-grove-green border border-grove-border">{msg}</div>}

      {tab === 'seteaza' && (
        <div className="grove-card space-y-4">
          <h2 className="text-sm font-semibold text-grove-green uppercase tracking-widest">Materiale Săptămâna Curentă</h2>

          {items.map((item, idx) => {
            const isGroveKiller = item.targetRoles.includes(GROVE_KILLER_ID)
            return (
              <div key={item.id || idx} className="space-y-3 pb-4 border-b border-dark-border/50 last:border-0">
                <div className="grid grid-cols-12 gap-2 items-center">
                  <input className="grove-input col-span-5 text-sm" placeholder="ex: Monede Sindicat"
                    value={item.name} onChange={e => updateItem(idx, 'name', e.target.value)} />
                  {!isGroveKiller && (
                    <input type="number" min="0" className="grove-input col-span-2 text-sm text-center"
                      placeholder="0" value={item.bucati || ''}
                      onChange={e => updateItem(idx, 'bucati', parseInt(e.target.value) || 0)} />
                  )}
                  <input type="date" className={`grove-input text-sm ${isGroveKiller ? 'col-span-6' : 'col-span-4'}`}
                    value={item.termen} onChange={e => updateItem(idx, 'termen', e.target.value)} />
                  <button onClick={() => removeItem(idx)} disabled={deleting === idx}
                    className="col-span-1 p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 flex items-center justify-center disabled:opacity-50">
                    {deleting === idx
                      ? <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                      : <Trash2 size={13} />
                    }
                  </button>
                </div>

                <div>
                  <div className="text-xs text-zinc-600 uppercase tracking-wider mb-1.5 px-1">Pentru ce grade?</div>
                  <div className="flex flex-wrap gap-2">
                    {GRADE_OPTIONS.map(g => {
                      const checked = item.targetRoles.includes(g.id)
                      return (
                        <button key={g.id} type="button" onClick={() => toggleRole(idx, g.id)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                            checked ? g.color : 'text-zinc-600 border-dark-border bg-dark-hover'
                          }`}>
                          {checked ? '✓' : ''} {g.label}
                        </button>
                      )
                    })}
                  </div>
                  {item.targetRoles.length === 0 && (
                    <p className="text-xs text-zinc-700 mt-1">Niciun grad selectat = se aplică tuturor</p>
                  )}
                </div>

                {isGroveKiller && (
                  <div className="space-y-2 p-3 rounded-xl bg-red-500/5 border border-red-500/20">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-red-400 uppercase tracking-wider font-semibold">⚔️ Jafuri Bratkov Enforcer</div>
                      <button onClick={() => addJaf(idx)}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20">
                        <Plus size={11} /> Adaugă jaf
                      </button>
                    </div>
                    {(!item.jafuri || item.jafuri.length === 0) ? (
                      <p className="text-xs text-zinc-600 text-center py-2">Apasă "Adaugă jaf" pentru a specifica cerințele</p>
                    ) : (
                      <div className="space-y-2">
                        {item.jafuri.map((jaf, jafIdx) => (
                          <div key={jafIdx} className="flex items-center gap-2">
                            <select className="grove-select text-xs flex-1"
                              value={jaf.type} onChange={e => updateJaf(idx, jafIdx, 'type', e.target.value)}>
                              {JAF_TYPES.map(j => <option key={j.value} value={j.value}>{j.label}</option>)}
                            </select>
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-zinc-500">x</span>
                              <input type="number" min="1" className="grove-input text-xs w-16 text-center"
                                value={jaf.count} onChange={e => updateJaf(idx, jafIdx, 'count', parseInt(e.target.value) || 1)} />
                            </div>
                            <button onClick={() => removeJaf(idx, jafIdx)}
                              className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20">
                              <X size={11} />
                            </button>
                          </div>
                        ))}
                        <div className="text-xs text-zinc-600 pt-1">
                          Total: {item.jafuri.map(j => {
                            const label = JAF_TYPES.find(t => t.value === j.type)?.label || j.type
                            return `${j.count}x ${label}`
                          }).join(' + ')}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {items.length === 0 && (
            <div className="text-center py-4 text-zinc-600 text-sm border border-dashed border-dark-border rounded-xl">
              Niciun material. Apasă "Adaugă Material".
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={addItem} className="grove-btn-outline flex items-center gap-2 text-sm">
              <Plus size={14} /> Adaugă Material
            </button>
            <button onClick={save} disabled={saving} className="grove-btn flex items-center gap-2 text-sm">
              <Save size={14} /> {saving ? 'Se salvează...' : 'Salvează Taxa'}
            </button>
          </div>
        </div>
      )}

      {tab === 'status' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {gradesWithMembers.map(g => (
              <button key={g.id} onClick={() => setActiveGrade(g.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border transition-all ${
                  activeGrade === g.id ? g.color : 'text-zinc-600 border-dark-border bg-dark-hover hover:text-white'
                }`}>
                {g.label}
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                  activeGrade === g.id ? 'bg-white/20' : 'bg-dark-border'
                }`}>
                  {g.paidCount}/{g.total}
                </span>
              </button>
            ))}
          </div>

          {activeGradeData && (
            <div className="grove-card p-0 overflow-hidden">
              <div className="px-5 py-3 border-b border-dark-border space-y-2">
                <div className="flex justify-between items-center">
                  <span className={`text-sm font-bold ${activeGradeData.color.split(' ')[0]}`}>
                    {activeGradeData.label}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {activeGradeData.paidCount} din {activeGradeData.total} au plătit
                    ({activeGradeData.total ? Math.round((activeGradeData.paidCount / activeGradeData.total) * 100) : 0}%)
                  </span>
                </div>
                <div className="w-full h-2 bg-dark-border rounded-full overflow-hidden">
                  <div className="h-full bg-grove-green rounded-full transition-all duration-500"
                    style={{ width: activeGradeData.total ? `${(activeGradeData.paidCount / activeGradeData.total) * 100}%` : '0%' }} />
                </div>
              </div>

              {loading ? (
                <div className="text-center py-8 text-zinc-600">Se încarcă...</div>
              ) : activeGradeData.members.length === 0 ? (
                <div className="text-center py-8 text-zinc-600 text-sm">Niciun membru în acest grad</div>
              ) : (
                <>
        {activeGrade === GROVE_KILLER_ID && jafProgress.length > 0 && (
  <div className="px-5 py-4 border-b border-dark-border space-y-3">
    <div className="text-xs text-red-400 uppercase tracking-widest font-semibold">
      ⚔️ Progres Jafuri Colectiv
    </div>

    {jafProgress[0]?.itemProgress.map((item: any, i: number) => {
      const totalDone = jafProgress.reduce(
        (s: number, u: any) => s + (u.itemProgress[i]?.totalDone || 0),
        0
      )

      const totalRequired = item.totalRequired
      const completed = totalDone >= totalRequired

      return (
        <div key={i} className="space-y-1">
          <div className="flex justify-between text-xs text-zinc-400">
            <span>{item.itemName}</span>
            <span className={completed ? 'text-green-400 font-bold' : ''}>
              {totalDone}/{totalRequired} {completed ? '✅' : ''}
            </span>
          </div>

          <div className="w-full h-2 bg-dark-border rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                completed ? 'bg-green-400' : 'bg-red-400'
              }`}
              style={{
                width: totalRequired
                  ? `${Math.min((totalDone / totalRequired) * 100, 100)}%`
                  : '0%',
              }}
            />
          </div>

          {item.jafProgress.map((jaf: any, j: number) => {
            const jafDone = jafProgress.reduce(
              (s: number, u: any) =>
                s + (u.itemProgress[i]?.jafProgress[j]?.done || 0),
              0
            )

            return (
              <div key={j} className="flex justify-between text-xs text-zinc-700 pl-2">
                <span>{jaf.type}</span>
                <span>{jafDone}/{jaf.required}</span>
              </div>
            )
          })}
        </div>
      )
    })}
  </div>
)}

                  <div className="divide-y divide-dark-border/50">
                    {activeGradeData.members.map(m => {
                      const payment = paidMap.get(`${m.id}_${activeGrade}`)
                      const hasPaid = payment?.paid ?? false
                      const isToggling = toggling === m.id
                      return (
                        <div key={m.id} className="flex items-center justify-between px-5 py-3 hover:bg-dark-hover transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full border border-dark-border overflow-hidden bg-dark-muted flex items-center justify-center shrink-0">
                              {m.avatar
                                ? <Image src={m.avatar} alt={m.username} width={36} height={36} className="object-cover" unoptimized />
                                : <span className="text-sm">👤</span>
                              }
                            </div>
                            <div>
                              <div className="text-sm font-medium text-white">{m.username}</div>
                              {hasPaid && payment?.paidAt && (
                                <div className="text-xs text-zinc-600">
                                  {format(new Date(payment.paidAt), 'dd MMM HH:mm', { locale: ro })}
                                </div>
                              )}
                            </div>
                          </div>
                          <button onClick={() => togglePaid(m.id, hasPaid, activeGrade)} disabled={isToggling}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                              hasPaid
                                ? 'text-green-400 border-green-500/30 bg-green-500/10 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30'
                                : 'text-red-400 border-red-500/30 bg-red-500/10 hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/30'
                            } disabled:opacity-50`}>
                            {isToggling
                              ? <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                              : hasPaid ? '✓ Achitat' : '✗ Neachitat'
                            }
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
