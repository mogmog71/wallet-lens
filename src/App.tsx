import { useState } from 'react'
import { runAnalysis } from './core/analyze'
import type { AnalysisParams, AnalysisResult } from './core/types'
import { getApiKey } from './db/db'
import { AddressForm } from './ui/AddressForm'
import { PortfolioView } from './ui/PortfolioView'
import { SettingsModal } from './ui/SettingsModal'
import { SummaryView } from './ui/SummaryView'
import { TimelineView } from './ui/TimelineView'

type Phase = 'idle' | 'running' | 'done' | 'error'
type Tab = 'summary' | 'timeline' | 'portfolio'

export default function App() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState<{ step: string; detail?: string }>({ step: '' })
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('summary')
  const [showSettings, setShowSettings] = useState(() => !getApiKey())

  async function handleAnalyze(params: AnalysisParams) {
    const apiKey = getApiKey()
    if (!apiKey) {
      setShowSettings(true)
      return
    }
    setPhase('running')
    setError('')
    try {
      const r = await runAnalysis(params, apiKey, (step, detail) => setProgress({ step, detail }))
      setResult(r)
      setTab('summary')
      setPhase('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-3 pb-16 sm:px-6">
      <header className="flex items-center justify-between py-4">
        <h1 className="text-lg font-bold tracking-tight sm:text-xl">
          <span className="text-sky-400">Wallet</span> Lens
          <span className="ml-2 hidden text-xs font-normal text-slate-400 sm:inline">
            EVMアドレス行動解析
          </span>
        </h1>
        <button
          onClick={() => setShowSettings(true)}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
        >
          ⚙ APIキー設定
        </button>
      </header>

      <AddressForm onSubmit={handleAnalyze} disabled={phase === 'running'} />

      {phase === 'running' && (
        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-center gap-3">
            <div className="size-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
            <div>
              <p className="text-sm font-medium">{progress.step}</p>
              {progress.detail && <p className="text-xs text-slate-400">{progress.detail}</p>}
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            解析はすべてこの端末のブラウザ内で実行されます。大きなアドレスでは数分かかることがあります。
          </p>
        </div>
      )}

      {phase === 'error' && (
        <div className="mt-6 rounded-xl border border-red-900 bg-red-950/50 p-4 text-sm text-red-300">
          エラー: {error}
        </div>
      )}

      {phase === 'done' && result && (
        <div className="mt-6">
          {result.warnings.length > 0 && (
            <div className="mb-4 rounded-xl border border-amber-900 bg-amber-950/40 p-3 text-xs text-amber-300">
              {result.warnings.map((w, i) => (
                <p key={i}>⚠ {w}</p>
              ))}
            </div>
          )}
          <nav className="mb-4 flex gap-1 rounded-xl border border-slate-800 bg-slate-900 p-1">
            {(
              [
                ['summary', '概要'],
                ['timeline', 'タイムライン'],
                ['portfolio', '資産推移'],
              ] as [Tab, string][]
            ).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  tab === t ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
          {tab === 'summary' && <SummaryView result={result} />}
          {tab === 'timeline' && <TimelineView actions={result.actions} />}
          {tab === 'portfolio' && <PortfolioView portfolio={result.portfolio} />}
        </div>
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}
