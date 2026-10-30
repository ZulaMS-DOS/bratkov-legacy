'use client'
import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { ro } from 'date-fns/locale'
import { RefreshCw, CheckCircle, XCircle } from 'lucide-react'

interface TaxItem {
  id: string; name: string; bucati: number; termen: string | null; expired: boolean
}

export default function TaxaPage() {
  const [items, setItems]     = useState<TaxItem[]>([])
  const [paid, setPaid]       = useState(false)
  const [paidAt, setPaidAt]   = useState<string | null>(null)
  const [taxPaused, setTaxPaused] = useState(false)
  const [weekStart, setWeek]  = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLast] = useState(new Date())

  const load = useCallback(async () => {
    const r = await fetch('/api/taxa?role=1501319885488390184')
    const d = await r.json()
    setItems(d.items || [])
    setPaid(d.paid)
    setPaidAt(d.paidAt)
    setTaxPaused(Boolean(d.taxPaused))
    setWeek(d.weekStart)
    setLast(new Date())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [load])

  return (
    <div className="space-y-5 animate-slide-up max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white">Taxa Sindicat</h1>
          <p className="text-zinc-500 text-sm mt-1">
            {weekStart ? `Săptămâna: ${format(new Date(weekStart), 'dd MMM yyyy', { locale: ro })}` : ''}
          </p>
        </div>
        <button onClick={load} className="p-2 rounded-lg text-zinc-600 hover:text-grove-green hover:bg-grove-dim transition-colors" title="Actualizează">
          <RefreshCw size={16} />
        </button>
      </div>

      {taxPaused ? (
        <div className="grove-card border-amber-500/40 bg-amber-500/5">
          <div className="text-xl font-black text-amber-400">⏸️ TAXA SUSPENDATĂ</div>
          <div className="text-xs text-zinc-500 mt-1">Nu trebuie să achiți taxa cât timp suspendarea este activă. Istoricul plăților rămâne păstrat.</div>
        </div>
      ) : (
        <div className={`grove-card flex items-center gap-4 ${paid ? 'border-green-500/40 bg-green-500/5' : 'border-red-500/40 bg-red-500/5'}`}>
          {paid
            ? <CheckCircle size={32} className="text-green-400 shrink-0" />
            : <XCircle size={32} className="text-red-400 shrink-0" />
          }
          <div>
            <div className={`text-xl font-black ${paid ? 'text-green-400' : 'text-red-400'}`}>
              {paid ? 'TAXA ACHITATĂ ✓' : 'TAXA NEACHITATĂ'}
            </div>
            {paid && paidAt
              ? <div className="text-xs text-zinc-500 mt-0.5">Confirmat la {format(new Date(paidAt), 'dd MMM yyyy HH:mm', { locale: ro })}</div>
              : <div className="text-xs text-zinc-500 mt-0.5">Contactează un Lider după ce ai plătit taxa</div>
            }
          </div>
        </div>
      )}

      <div className="grove-card p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-dark-border">
          <h2 className="text-sm font-semibold text-grove-green uppercase tracking-widest">Materiale de Predat</h2>
        </div>

        {loading ? (
          <div className="text-center py-10 text-zinc-600">Se încarcă...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-10">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-zinc-600 text-sm">Nicio taxă setată pentru această săptămână.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 px-5 py-2.5 bg-dark-hover border-b border-dark-border">
              <div className="col-span-1 text-xs text-zinc-600 uppercase tracking-wider">Material</div>
              <div className="text-xs text-zinc-600 uppercase tracking-wider text-center">Bucăți</div>
              <div className="text-xs text-zinc-600 uppercase tracking-wider text-center">Termen</div>
            </div>
            {items.map((item, i) => (
              <div key={item.id}
                className={`grid grid-cols-3 px-5 py-3.5 border-b border-dark-border/50 hover:bg-dark-hover transition-colors ${i % 2 === 1 ? 'bg-white/[0.01]' : ''} ${item.expired ? 'opacity-60' : ''}`}>
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.expired ? 'bg-red-500' : 'bg-grove-green'}`} />
                  <span className="text-white text-sm font-medium">{item.name}</span>
                </div>
                <div className="text-center text-grove-green font-bold text-sm">{item.bucati.toLocaleString()}</div>
                <div className="text-center text-sm">
                  {item.termen ? (
                    <span className={item.expired ? 'text-red-400 font-semibold' : 'text-yellow-400'}>
                      {item.expired ? '⛔ Expirat' : format(new Date(item.termen), 'dd MMM yyyy', { locale: ro })}
                    </span>
                  ) : (
                    <span className="text-zinc-700">—</span>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <p className="text-xs text-zinc-700 text-center">
        Actualizat la {format(lastUpdate, 'HH:mm:ss')} · Se actualizează automat la 30s
      </p>
    </div>
  )
}
