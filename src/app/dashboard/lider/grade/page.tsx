'use client'
import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { RefreshCw } from 'lucide-react'

const GRADE_CONFIG = [
  { id: '1107100643291828224', label: 'Lider',            color: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10' },
  { id: '1515017621127299303', label: 'Lider Secundar',   color: 'text-amber-400 border-amber-500/30 bg-amber-500/10' },
  { id: '1107099637644529684', label: 'Co-Lider',         color: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
  { id: '1107098741510520852', label: 'Tester',           color: 'text-purple-400 border-purple-500/30 bg-purple-500/10' },
  { id: '1107095888045801532', label: 'Membru',           color: 'text-grove-green border-grove-border bg-grove-dim' },
  { id: '1518710460717731840', label: 'Bratkov Enforcer', color: 'text-red-400 border-red-500/30 bg-red-500/10' },
  { id: '1107093171026010203', label: 'Muncitor',         color: 'text-zinc-400 border-zinc-600/30 bg-zinc-600/10' },
]

const GRADE_ORDER = ['Lider', 'Lider Secundar', 'Co-Lider', 'Tester', 'Membru', 'Bratkov Enforcer', 'Muncitor', 'Fără Grad']

interface Member {
  id: string; discordId: string; username: string
  avatar: string | null; points: number; roleIds: string[]
}

// Returneaza TOATE gradele unui user
function getGrades(roleIds: string[]): { label: string; color: string }[] {
  const grades = GRADE_CONFIG.filter(g => roleIds.includes(g.id))
  if (grades.length === 0) return [{ label: 'Fără Grad', color: 'text-zinc-600 border-zinc-700/30 bg-zinc-700/10' }]
  return grades
}

export default function GradePage() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch]   = useState('')
  const [msg, setMsg]         = useState('')

  const load = useCallback(async () => {
    const r = await fetch('/api/members')
    const d = await r.json()
    setMembers(d.members || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const sync = async () => {
    setSyncing(true)
    setMsg('')
    const r = await fetch('/api/discord/members')
    const d = await r.json()
    if (r.ok) {
      setMsg(`✅ Sincronizat! ${d.totalOnServer} membri găsiți, ${d.deleted} șterși`)
      await load()
    } else {
      setMsg(`❌ Eroare: ${d.error}`)
    }
    setSyncing(false)
    setTimeout(() => setMsg(''), 6000)
  }

  const filtered = members.filter(m =>
    m.username.toLowerCase().includes(search.toLowerCase())
  )

  // Grupare — un user poate apare in mai multe categorii daca are mai multe grade
  const grouped = GRADE_ORDER.map(gradeName => {
    const gradeConf = GRADE_CONFIG.find(g => g.label === gradeName)
    const gradeMembers = gradeName === 'Fără Grad'
      ? filtered.filter(m => !GRADE_CONFIG.some(g => m.roleIds.includes(g.id)))
      : filtered.filter(m => gradeConf && m.roleIds.includes(gradeConf.id))

    return { grade: gradeName, members: gradeMembers }
  }).filter(g => g.members.length > 0)

  return (
    <div className="space-y-5 animate-slide-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-black text-white">Grade Membri</h1>
          <p className="text-zinc-500 text-sm mt-1">Gradele sunt detectate automat din rolurile Discord</p>
        </div>
        <button onClick={sync} disabled={syncing}
          className="grove-btn flex items-center gap-2 text-sm disabled:opacity-60">
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Se sincronizează...' : 'Sincronizează cu Discord'}
        </button>
      </div>

      {msg && (
        <div className="p-3 bg-dark-hover rounded-xl text-sm text-grove-green border border-grove-border">{msg}</div>
      )}

      <div className="grove-card p-3">
        <input type="text" className="grove-input" placeholder="🔍 Caută după username..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="grove-card text-center py-10 text-zinc-600">Se încarcă...</div>
      ) : grouped.length === 0 ? (
        <div className="grove-card text-center py-10 text-zinc-600 text-sm">
          Niciun membru. Apasă "Sincronizează cu Discord" pentru a aduce toți membrii serverului.
        </div>
      ) : (
        grouped.map(group => (
          <div key={group.grade} className="space-y-2">
            <div className="text-xs text-zinc-600 uppercase tracking-widest px-1 flex items-center gap-2">
              {group.grade} <span className="text-zinc-700">({group.members.length})</span>
            </div>
            {group.members.map(m => {
              const grades = getGrades(m.roleIds)
              return (
                <div key={`${group.grade}-${m.id}`} className="grove-card flex items-center gap-3 py-2.5">
                  <div className="w-10 h-10 rounded-full border-2 border-dark-border overflow-hidden shrink-0 bg-dark-muted flex items-center justify-center">
                    {m.avatar
                      ? <Image src={m.avatar} alt={m.username} width={40} height={40} className="object-cover" unoptimized />
                      : <span className="text-lg">👤</span>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-white text-sm truncate">{m.username}</div>
                    <div className="text-xs text-zinc-600">{m.points} Bratkov Coins</div>
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end shrink-0 max-w-[160px]">
                    {grades.map(g => (
                      <span key={g.label} className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${g.color}`}>
                        {g.label}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ))
      )}
    </div>
  )
}
