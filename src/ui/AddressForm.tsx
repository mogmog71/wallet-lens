import { useState } from 'react'
import { CHAINS } from '../config/chains'
import type { AnalysisParams } from '../core/types'
import { isValidAddress } from '../lib/format'

const PERIOD_PRESETS = [
  { label: '30日', days: 30 },
  { label: '90日', days: 90 },
  { label: '180日', days: 180 },
  { label: '1年', days: 365 },
] as const

export function AddressForm(props: {
  onSubmit: (params: AnalysisParams) => void
  disabled: boolean
}) {
  const [address, setAddress] = useState('')
  const [chainIds, setChainIds] = useState<number[]>([1, 8453, 42161])
  const [days, setDays] = useState(90)
  const [addrError, setAddrError] = useState('')

  function toggleChain(id: number) {
    setChainIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  }

  function submit() {
    const a = address.trim()
    if (!isValidAddress(a)) {
      setAddrError('0xから始まる40桁のアドレスを入力してください')
      return
    }
    if (chainIds.length === 0) {
      setAddrError('チェーンを1つ以上選択してください')
      return
    }
    setAddrError('')
    const now = Math.floor(Date.now() / 1000)
    props.onSubmit({ address: a, chainIds, startTs: now - days * 86400, endTs: now })
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
      <label className="block text-xs font-medium text-slate-400">対象アドレス</label>
      <input
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="0x…"
        inputMode="text"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-sm placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
      />
      {addrError && <p className="mt-1 text-xs text-red-400">{addrError}</p>}

      <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <p className="text-xs font-medium text-slate-400">
            チェーン
            <button
              type="button"
              onClick={() =>
                setChainIds(
                  chainIds.length === CHAINS.length ? [] : CHAINS.map((c) => c.chainId),
                )
              }
              className="ml-2 text-[11px] text-sky-400 underline"
            >
              {chainIds.length === CHAINS.length ? '全解除' : '全選択'}
            </button>
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {CHAINS.map((c) => (
              <button
                key={c.chainId}
                type="button"
                onClick={() => toggleChain(c.chainId)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                  chainIds.includes(c.chainId)
                    ? 'border-sky-500 bg-sky-500/15 text-sky-300'
                    : 'border-slate-700 text-slate-500 hover:text-slate-300'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-400">期間</p>
          <div className="mt-1.5 flex gap-2">
            {PERIOD_PRESETS.map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => setDays(p.days)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                  days === p.days
                    ? 'border-sky-500 bg-sky-500/15 text-sky-300'
                    : 'border-slate-700 text-slate-500 hover:text-slate-300'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={submit}
          disabled={props.disabled}
          className="ml-auto rounded-lg bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50"
        >
          解析する
        </button>
      </div>
    </div>
  )
}
