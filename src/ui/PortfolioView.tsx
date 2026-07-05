import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getChain } from '../config/chains'
import type { PortfolioResult } from '../core/types'
import { formatAmount, formatUsd, shortAddr } from '../lib/format'

function compactUsd(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}

export function PortfolioView({ portfolio }: { portfolio: PortfolioResult }) {
  const p = portfolio
  const data = p.daily.map((d) => ({ date: d.date.slice(5), usd: Math.round(d.totalUsd * 100) / 100 }))
  const holdings = p.tokens
    .filter((t) => BigInt(t.currentBalanceRaw) > 0n)
    .sort((a, b) => (b.currentUsd ?? 0) - (a.currentUsd ?? 0))

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['期間開始時', p.periodStartUsd],
          ['期間終了時', p.periodEndUsd],
          ['外部からの入金', p.externalInUsd],
          ['外部への出金', p.externalOutUsd],
        ].map(([label, v]) => (
          <div key={label as string} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
            <p className="text-xs text-slate-400">{label as string}</p>
            <p className="mt-1 font-semibold">{formatUsd(v as number | undefined)}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900 p-3 sm:p-4">
        <p className="mb-2 text-sm font-medium">
          総資産推移(USD)
          <span className="ml-2 text-xs font-normal text-slate-500">
            逆算方式・日次評価 / カバレッジ {p.coverage.valued}/{p.coverage.total} トークン
          </span>
        </p>
        <div className="h-64 sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="usd" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} minTickGap={30} />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 10 }}
                tickFormatter={compactUsd}
                width={55}
              />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8 }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(v: number) => [formatUsd(v), '総資産']}
              />
              <Area type="monotone" dataKey="usd" stroke="#38bdf8" fill="url(#usd)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-slate-500">
          価格が取得できないトークンは評価に含まれていません(0円扱いではなく評価対象外)。評価額は下限推定です。
        </p>
      </div>

      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900 p-3 sm:p-4">
        <p className="mb-2 text-sm font-medium">現在の保有トークン</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1.5 pr-3">トークン</th>
                <th className="py-1.5 pr-3">チェーン</th>
                <th className="py-1.5 pr-3 text-right">残高</th>
                <th className="py-1.5 pr-3 text-right">評価額</th>
                <th className="py-1.5">備考</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {holdings.map((t) => (
                <tr key={`${t.chainId}:${t.tokenAddress}`} className="border-t border-slate-800">
                  <td className="py-1.5 pr-3 font-medium">
                    {t.symbol || shortAddr(t.tokenAddress)}
                  </td>
                  <td className="py-1.5 pr-3 text-slate-500">{getChain(t.chainId).shortName}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">
                    {formatAmount(t.currentBalanceRaw, t.decimals)}
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    {t.priced ? formatUsd(t.currentUsd) : <span className="text-slate-600">評価対象外</span>}
                  </td>
                  <td className="py-1.5 text-amber-400">{t.incomplete ? '参考値' : ''}</td>
                </tr>
              ))}
              {holdings.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-500">
                    保有トークンがありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
