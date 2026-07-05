import { useMemo, useState } from 'react'
import { getChain } from '../config/chains'
import { actionLabel, downloadBlob, exportCsv } from '../core/csv'
import type { ActionType, DecodedAction } from '../core/types'
import { formatAmount, formatDateTime, formatUsd, shortAddr } from '../lib/format'

const ALL_TYPES: ActionType[] = [
  'swap', 'transfer_in', 'transfer_out', 'approve', 'bridge', 'wrap', 'unwrap',
  'claim', 'deployment', 'nft_transfer', 'transfer_self', 'unknown',
]

const TYPE_COLORS: Record<string, string> = {
  swap: 'bg-violet-500/20 text-violet-300',
  approve: 'bg-amber-500/20 text-amber-300',
  bridge: 'bg-cyan-500/20 text-cyan-300',
  transfer_in: 'bg-emerald-500/20 text-emerald-300',
  transfer_out: 'bg-rose-500/20 text-rose-300',
  wrap: 'bg-sky-500/20 text-sky-300',
  unwrap: 'bg-sky-500/20 text-sky-300',
  claim: 'bg-lime-500/20 text-lime-300',
  deployment: 'bg-fuchsia-500/20 text-fuchsia-300',
  nft_transfer: 'bg-pink-500/20 text-pink-300',
  transfer_self: 'bg-slate-500/20 text-slate-300',
  unknown: 'bg-slate-500/20 text-slate-400',
}

const CONF_LABEL = { high: '高', medium: '中', low: '低' } as const

export function TimelineView({ actions }: { actions: DecodedAction[] }) {
  const [types, setTypes] = useState<Set<ActionType>>(new Set(ALL_TYPES))
  const [tokenFilter, setTokenFilter] = useState('')
  const [minUsd, setMinUsd] = useState('')
  const [includeFailed, setIncludeFailed] = useState(true)
  const [showSpam, setShowSpam] = useState(false)
  const [limit, setLimit] = useState(100)

  const filtered = useMemo(() => {
    const min = Number(minUsd) || 0
    const tf = tokenFilter.trim().toLowerCase()
    return actions.filter((a) => {
      if (!showSpam && a.involvesSpamOnly) return false
      if (!types.has(a.actionType)) return false
      if (!includeFailed && a.status === 'failed') return false
      if (min > 0 && (a.amountUsd === undefined || a.amountUsd < min)) return false
      if (tf) {
        const hit = [...a.assetsIn, ...a.assetsOut].some((x) =>
          x.symbol.toLowerCase().includes(tf),
        )
        if (!hit) return false
      }
      return true
    })
  }, [actions, types, tokenFilter, minUsd, includeFailed, showSpam])

  function toggleType(t: ActionType) {
    setTypes((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  const spamHidden = actions.filter((a) => a.involvesSpamOnly).length

  return (
    <div>
      <div className="mb-3 rounded-xl border border-slate-800 bg-slate-900 p-3">
        <div className="flex flex-wrap gap-1.5">
          {ALL_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => toggleType(t)}
              className={`rounded-full px-2.5 py-1 text-xs transition ${
                types.has(t) ? TYPE_COLORS[t] : 'bg-slate-800/50 text-slate-600 line-through'
              }`}
            >
              {actionLabel(t)}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <input
            value={tokenFilter}
            onChange={(e) => setTokenFilter(e.target.value)}
            placeholder="トークン名で絞り込み"
            className="w-40 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
          />
          <label className="flex items-center gap-1.5">
            最小
            <input
              value={minUsd}
              onChange={(e) => setMinUsd(e.target.value)}
              placeholder="0"
              inputMode="decimal"
              className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 focus:border-sky-500 focus:outline-none"
            />
            USD
          </label>
          <label className="flex items-center gap-1.5 text-slate-300">
            <input
              type="checkbox"
              checked={includeFailed}
              onChange={(e) => setIncludeFailed(e.target.checked)}
            />
            失敗txを含む
          </label>
          <label className="flex items-center gap-1.5 text-slate-300">
            <input type="checkbox" checked={showSpam} onChange={(e) => setShowSpam(e.target.checked)} />
            スパムを表示{spamHidden > 0 && !showSpam ? `(${spamHidden}件 非表示中)` : ''}
          </label>
          <button
            onClick={() =>
              downloadBlob(exportCsv(filtered), `wallet-lens-${Date.now()}.csv`)
            }
            className="ml-auto rounded-lg border border-slate-700 px-3 py-1.5 text-slate-300 hover:bg-slate-800"
          >
            ⬇ CSV({filtered.length}件)
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {filtered.slice(0, limit).map((a) => {
          const chain = getChain(a.chainId)
          return (
            <details
              key={`${a.chainId}:${a.txHash}`}
              className="group rounded-xl border border-slate-800 bg-slate-900 open:border-slate-600"
            >
              <summary className="cursor-pointer list-none p-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                  <span>{formatDateTime(a.timeStamp)}</span>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5">{chain.shortName}</span>
                  <span className={`rounded px-1.5 py-0.5 ${TYPE_COLORS[a.actionType]}`}>
                    {actionLabel(a.actionType)}
                  </span>
                  {a.status === 'failed' && (
                    <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-red-300">失敗</span>
                  )}
                  {a.protocolName && <span>{a.protocolName}</span>}
                  <span className="ml-auto font-medium text-slate-300">{formatUsd(a.amountUsd)}</span>
                </div>
                <p className="mt-1.5 text-sm leading-snug">{a.summary}</p>
              </summary>
              <div className="border-t border-slate-800 p-3 text-xs text-slate-400">
                <div className="grid gap-1.5 sm:grid-cols-2">
                  <p>
                    入った資産:{' '}
                    {a.assetsIn.length > 0
                      ? a.assetsIn.map((x) => `${formatAmount(x.amountRaw, x.decimals)} ${x.symbol}`).join(' / ')
                      : 'なし'}
                  </p>
                  <p>
                    出た資産:{' '}
                    {a.assetsOut.length > 0
                      ? a.assetsOut.map((x) => `${formatAmount(x.amountRaw, x.decimals)} ${x.symbol}`).join(' / ')
                      : 'なし'}
                  </p>
                  <p>
                    相手先: {a.counterpartyLabel ?? shortAddr(a.counterparty)}
                    {a.methodName && ` / メソッド: ${a.methodName}`}
                  </p>
                  <p>
                    ガス代:{' '}
                    {a.gasFeeNative !== '0'
                      ? `${formatAmount(a.gasFeeNative, 18, 6)} ${chain.nativeSymbol}${a.gasFeeUsd !== undefined ? ` (${formatUsd(a.gasFeeUsd)})` : ''}`
                      : '—'}
                  </p>
                  <p>
                    確信度: {CONF_LABEL[a.confidence]}({a.reason})
                  </p>
                  <p>
                    <a
                      href={chain.explorerTx + a.txHash}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-400 underline"
                    >
                      エクスプローラで開く ↗
                    </a>
                  </p>
                </div>
              </div>
            </details>
          )
        })}
      </div>

      {filtered.length > limit && (
        <button
          onClick={() => setLimit((n) => n + 200)}
          className="mt-4 w-full rounded-xl border border-slate-700 py-2.5 text-sm text-slate-300 hover:bg-slate-800"
        >
          さらに表示({filtered.length - limit}件 残り)
        </button>
      )}
      {filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-slate-500">条件に一致する履歴がありません</p>
      )}
    </div>
  )
}
