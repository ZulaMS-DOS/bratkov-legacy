'use client'
import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, Plus, Trash2, RefreshCw, Shield, ScrollText } from 'lucide-react'
import { format } from 'date-fns'
import { ro } from 'date-fns/locale'
import Image from 'next/image'
import { useSession } from 'next-auth/react'

interface Fine {
  id: string; tip: string; motiv: string; material: string; bucati: number; termen: string
  fwLevel: number | null; givenByName: string; createdAt: string
  user: { username: string; avatar: string | null; discordId: string }
}
interface Member { id: string; username: string; avatar: string | null; discordId: string }

const LEADER_ROLES = ['1107100643291828224', '1107099637644529684']
const TESTER_ROLE  = '1107098741510520852'

export default function LiderAmenziPage() {
  const { data: session } = useSession()
  const [amenzi, setAmenzi]     = useState<Fine[]>([])
  const [fwuri, setFwuri]       = useState<Fine[]>([])
  const [members, setMembers]   = useState<Member[]>([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [msg, setMsg]           = useState('')
  const [tab, setTab]           = useState<'amenda' | 'fw' | 'logs'>('amenda')

  const roleIds  = session?.user.roleIds || []
  const isLeader = roleIds.some((r: string) => LEADER_ROLES.includes(r))
  const isTester = roleIds.includes(TESTER_ROLE) && !isLeader

  // Form amenda
  const [userId, setUserId]     = useState('')
  const [motiv, setMotiv]       = useState('')
  const [material, setMaterial] = useState('')
  const [bucati, setBucati]     = useState('')
  const [termen, setTermen]     = useState('')

  // Form fw
  const [fwUserId, setFwUserId] = useState('')
  const [fwMotiv, setFwMotiv]   = useState('')
  const [fwNivel, setFwNivel]   = useState('1')

  const resetAmenda = () => { setUserId(''); setMotiv(''); setMaterial(''); setBucati(''); setTermen('') }
  const resetFw     = () => { setFwUserId(''); setFwMotiv(''); setFwNivel('1') }

  const load = useCallback(async () => {
    const r = await fetch('/api/amenzi/admin')
    const d = await r.json()
    setAmenzi(d.amenzi  || [])
    setFwuri(d.fwuri    || [])
    setMembers(d.members || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const showMsg = (text: string) => { setMsg(text); setTimeout(() => setMsg(''), 3000) }

  const submitAmenda = async () => {
    if (!userId || !material.trim()) { showMsg('⚠️ Selectează membrul și completează materialul!'); return }
    setSaving(true)
    const r = await fetch('/api/amenzi', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        userId, tip: 'amenda', motiv,
        material, bucati: parseInt(bucati) || 0, termen,
      }),
    })
    if (r.ok) { showMsg('✅ Amendă aplicată!'); resetAmenda(); await load() }
    else       { showMsg('❌ Eroare la aplicare') }
    setSaving(false)
  }

  const submitFw = async () => {
    if (!fwUserId || !fwMotiv.trim()) { showMsg('⚠️ Selectează membrul și completează motivul!'); return }
    setSaving(true)
    const r = await fetch('/api/amenzi', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        userId: fwUserId, tip: 'fw', material: fwMotiv,
        bucati: 0, termen: '', fwLevel: parseInt(fwNivel),
      }),
    })
    if (r.ok) { showMsg('✅ Faction Warn aplicat!'); resetFw(); await load() }
    else       { showMsg('❌ Eroare la aplicare') }
    setSaving(false)
  }

  const remove = async (id: string) => {
    const response = await fetch('/api/amenzi/admin', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id }),
    })
    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      showMsg(data.error || '❌ Nu am putut șterge sancțiunea complet')
      return
    }

    showMsg('🗑️ Sancțiunea și mesajul Discord au fost șterse!')
    await load()
  }

  // Grupeaza FW-urile per user
  const fwPerUser = fwuri.reduce((acc: Record<string, Fine[]>, f) => {
    const key = f.user.username
    if (!acc[key]) acc[key] = []
    acc[key].push(f)
    return acc
  }, {})

  const allSorted = [...amenzi, ...fwuri].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  const FineCard = ({ f }: { f: Fine }) => (
    <div className="flex items-center gap-3 px-5 py-3 hover:bg-dark-hover transition-colors">
      <div className="w-9 h-9 rounded-full border border-dark-border overflow-hidden bg-dark-muted flex items-center justify-center shrink-0">
        {f.user.avatar
          ? <Image src={f.user.avatar} alt="" width={36} height={36} className="object-cover" unoptimized />
          : <span className="text-sm">👤</span>
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-white font-semibold text-sm">{f.user.username}</div>
        {f.motiv && <div className="text-xs text-zinc-400">📝 {f.motiv}</div>}
        <div className="text-xs text-zinc-500 flex items-center gap-2 flex-wrap">
          <span>{f.material}</span>
          {f.bucati > 0 && <span>· {f.bucati} buc</span>}
          {f.termen && <span>· ⏰ {f.termen}</span>}
        </div>
        <div className="text-xs text-zinc-700 mt-0.5">
          {f.givenByName} · {format(new Date(f.createdAt), 'dd MMM HH:mm', { locale: ro })}
        </div>
      </div>
      <button onClick={() => remove(f.id)}
        className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 shrink-0">
        <Trash2 size={13} />
      </button>
    </div>
  )

  return (
    <div className="space-y-5 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white flex items-center gap-3">
            <AlertTriangle size={28} className="text-red-400" /> Amenzi & FW
          </h1>
          <p className="text-zinc-500 text-sm mt-1">Aplică amenzi și Faction Warn-uri</p>
        </div>
        <button onClick={load} className="p-2 rounded-lg text-zinc-600 hover:text-grove-green hover:bg-grove-dim transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="flex gap-1 border-b border-dark-border">
        <button onClick={() => setTab('amenda')}
          className={`px-5 py-2.5 text-sm font-medium transition-all flex items-center gap-2 ${
            tab === 'amenda' ? 'text-red-400 border-b-2 border-red-400' : 'text-zinc-500 hover:text-white'
          }`}>
          <AlertTriangle size={14} /> Amenzi
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
            {amenzi.length}
          </span>
        </button>
        {!isTester && (
          <button onClick={() => setTab('fw')}
            className={`px-5 py-2.5 text-sm font-medium transition-all flex items-center gap-2 ${
              tab === 'fw' ? 'text-orange-400 border-b-2 border-orange-400' : 'text-zinc-500 hover:text-white'
            }`}>
            <Shield size={14} /> Faction Warn
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
              {Object.keys(fwPerUser).length}
            </span>
          </button>
        )}
        <button onClick={() => setTab('logs')}
          className={`px-5 py-2.5 text-sm font-medium transition-all flex items-center gap-2 ${
            tab === 'logs' ? 'text-zinc-300 border-b-2 border-zinc-300' : 'text-zinc-500 hover:text-white'
          }`}>
          <ScrollText size={14} /> Logs
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-zinc-500/20 text-zinc-400 border border-zinc-600/30">
            {allSorted.length}
          </span>
        </button>
      </div>

      {msg && <div className="p-3 bg-dark-hover rounded-xl text-sm text-grove-green border border-grove-border">{msg}</div>}

      {/* Tab Amenzi */}
      {tab === 'amenda' && (
        <div className="space-y-4">
          <div className="grove-card space-y-3">
            <h2 className="text-sm font-semibold text-red-400 uppercase tracking-widest">+ Aplică Amendă</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="grove-label">Membru *</label>
                <select className="grove-select text-sm" value={userId} onChange={e => setUserId(e.target.value)}>
                  <option value="">Selectează membru...</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.username}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="grove-label">Motiv</label>
                <input className="grove-input text-sm" placeholder="ex: Nerespectarea regulamentului"
                  value={motiv} onChange={e => setMotiv(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <label className="grove-label">Material / Amendă *</label>
                <input className="grove-input text-sm" placeholder="ex: 500 Monede Sindicat"
                  value={material} onChange={e => setMaterial(e.target.value)} />
              </div>
              <div>
                <label className="grove-label">Bucăți</label>
                <input type="number" className="grove-input text-sm" placeholder="0"
                  value={bucati} onChange={e => setBucati(e.target.value)} />
              </div>
              <div>
                <label className="grove-label">Termen</label>
                <input className="grove-input text-sm" placeholder="ex: 24h"
                  value={termen} onChange={e => setTermen(e.target.value)} />
              </div>
            </div>
            <button onClick={submitAmenda} disabled={saving}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 text-sm font-semibold transition-all disabled:opacity-50">
              <Plus size={14} /> {saving ? 'Se aplică...' : 'Aplică Amendă'}
            </button>
          </div>

          <div className="grove-card p-0 overflow-hidden">
            <div className="px-5 py-3 border-b border-dark-border">
              <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">{amenzi.length} Amenzi</h2>
            </div>
            {loading ? (
              <div className="text-center py-8 text-zinc-600">Se încarcă...</div>
            ) : amenzi.length === 0 ? (
              <div className="text-center py-8 text-zinc-600 text-sm">Nicio amendă aplicată</div>
            ) : (
              <div className="divide-y divide-dark-border/50">
                {amenzi.map(f => <FineCard key={f.id} f={f} />)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab FW */}
      {tab === 'fw' && !isTester && (
        <div className="space-y-4">
          <div className="grove-card space-y-3">
            <h2 className="text-sm font-semibold text-orange-400 uppercase tracking-widest">+ Aplică Faction Warn</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="grove-label">Membru *</label>
                <select className="grove-select text-sm" value={fwUserId} onChange={e => setFwUserId(e.target.value)}>
                  <option value="">Selectează membru...</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.username}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="grove-label">Motiv *</label>
                <input className="grove-input text-sm" placeholder="ex: Nerespectarea regulamentului"
                  value={fwMotiv} onChange={e => setFwMotiv(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <label className="grove-label">Nivel FW de adăugat</label>
                <select className="grove-select text-sm" value={fwNivel} onChange={e => setFwNivel(e.target.value)}>
                  <option value="1">+1 FW</option>
                  <option value="2">+2 FW</option>
                </select>
              </div>
            </div>
            <button onClick={submitFw} disabled={saving}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 border border-orange-500/20 text-sm font-semibold transition-all disabled:opacity-50">
              <Plus size={14} /> {saving ? 'Se aplică...' : 'Aplică Faction Warn'}
            </button>
          </div>

          <div className="grove-card p-0 overflow-hidden">
            <div className="px-5 py-3 border-b border-dark-border">
              <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">
                {Object.keys(fwPerUser).length} Membri cu FW
              </h2>
            </div>
            {loading ? (
              <div className="text-center py-8 text-zinc-600">Se încarcă...</div>
            ) : Object.keys(fwPerUser).length === 0 ? (
              <div className="text-center py-8 text-zinc-600 text-sm">Niciun FW aplicat</div>
            ) : (
              <div className="divide-y divide-dark-border/50">
                {Object.entries(fwPerUser).map(([username, userFws]) => {
                  const sorted   = [...userFws].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                  const totalFw  = Math.min(sorted.reduce((s, f) => s + (f.fwLevel || 1), 0), 3)
                  const history  = sorted.map(f => `FW ${f.fwLevel}/3`)
                  const histText = history.length > 1 ? `${history.join(' + ')} = FW ${totalFw}/3` : `FW ${totalFw}/3`
                  const color    = totalFw === 3 ? 'text-red-400' : totalFw === 2 ? 'text-orange-400' : 'text-yellow-400'
                  const firstFw  = sorted[0]

                  return (
                    <div key={username} className="px-5 py-3 hover:bg-dark-hover transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full border border-dark-border overflow-hidden bg-dark-muted flex items-center justify-center shrink-0">
                          {firstFw.user.avatar
                            ? <Image src={firstFw.user.avatar} alt="" width={36} height={36} className="object-cover" unoptimized />
                            : <span className="text-sm">👤</span>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-semibold text-sm">{username}</span>
                            <span className={`text-xs font-black px-2 py-0.5 rounded-full border ${
                              totalFw === 3 ? 'text-red-400 border-red-500/30 bg-red-500/10'
                              : totalFw === 2 ? 'text-orange-400 border-orange-500/30 bg-orange-500/10'
                              : 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10'
                            }`}>
                              FW {totalFw}/3
                            </span>
                          </div>
                          <div className={`text-xs mt-0.5 ${color}`}>{histText}</div>
                          <div className="text-xs text-zinc-700 mt-0.5">
                            {sorted.map(f => f.material).join(' · ')}
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {sorted.map(f => (
                            <button key={f.id} onClick={() => remove(f.id)}
                              className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20">
                              <Trash2 size={11} />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab Logs */}
      {tab === 'logs' && (
        <div className="grove-card p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-border">
            <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">
              {allSorted.length} Sancțiuni Totale
            </h2>
          </div>
          {allSorted.length === 0 ? (
            <div className="text-center py-8 text-zinc-600 text-sm">Nicio sancțiune</div>
          ) : (
            <div className="divide-y divide-dark-border/50">
              {allSorted.map(f => (
                <div key={f.id} className="flex items-center gap-3 px-5 py-3 hover:bg-dark-hover transition-colors">
                  <div className="w-9 h-9 rounded-full border border-dark-border overflow-hidden bg-dark-muted flex items-center justify-center shrink-0">
                    {f.user.avatar
                      ? <Image src={f.user.avatar} alt="" width={36} height={36} className="object-cover" unoptimized />
                      : <span className="text-sm">👤</span>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-semibold text-sm">{f.user.username}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full border font-semibold ${
                        f.tip === 'fw'
                          ? 'text-orange-400 border-orange-500/30 bg-orange-500/10'
                          : 'text-red-400 border-red-500/30 bg-red-500/10'
                      }`}>
                        {f.tip === 'fw' ? `FW ${f.fwLevel}/3` : 'Amendă'}
                      </span>
                    </div>
                    {f.motiv && <div className="text-xs text-zinc-400 truncate">📝 {f.motiv}</div>}
                    <div className="text-xs text-zinc-500 truncate">{f.material}</div>
                    <div className="text-xs text-zinc-700 mt-0.5">
                      {f.givenByName} · {format(new Date(f.createdAt), 'dd MMM HH:mm', { locale: ro })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
