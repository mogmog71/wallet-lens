import { getChain } from '../config/chains'
import type { AnalysisResult } from '../core/types'
import { formatAmount, formatDateTime, formatUsd, shortAddr } from '../lib/format'

function Card(props: { label: string; children: React.ReactNode; note?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <p className="text-xs text-slate-400">{props.label}</p>
      <div className="mt-1 text-lg font-semibold">{props.children}</div>
      {props.note && <p className="mt-1 text-[11px] leading-snug text-slate-500">{props.note}</p>}
    </div>
  )
}

export function SummaryView({ result }: { result: AnalysisResult }) {
  const s = result.summary
  const p = result.portfolio
  const change = p.estimatedChangeUsd

  return (
    <div>
      <p className="mb-3 break-all font-mono text-xs text-slate-400">{s.address}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card
          label="現在の推定資産額"
          note={`評価カバレッジ: ${p.coverage.valued}/${p.coverage.total} トークン(評価額は下限推定)`}
        >
          {formatUsd(p.currentTotalUsd)}
        </Card>
        <Card label="期間内の推定資産増減(参考値)" note="入出金を除いた概算。損益の断定ではありません">
          <span className={change === undefined ? '' : change >= 0 ? 'text-emerald-400' : 'text-red-400'}>
            {change === undefined ? '—' : `${change >= 0 ? '+' : ''}${formatUsd(change)}`}
          </span>
        </Card>
        <Card label="期間内トランザクション数" note={s.failedTxCount > 0 ? `うち失敗 ${s.failedTxCount} 件` : undefined}>
          {s.txCount.toLocaleString()}
        </Card>
        <Card label="ガス代合計(失敗tx含む)">
          {formatUsd(s.gasFeeUsd)}
          <div className="mt-1 space-y-0.5 text-xs font-normal text-slate-400">
            {Object.entries(s.gasFeeNativeByChain)
              .filter(([, v]) => v !== '0')
              .map(([cid, v]) => (
                <p key={cid}>
                  {getChain(Number(cid)).name}: {formatAmount(v, 18, 5)} {getChain(Number(cid)).nativeSymbol}
                </p>
              ))}
          </div>
        </Card>
        <Card label="Swap / Approve / Bridge" note="Approve回数はオンチェーンApproveのみ(Permit2等の署名Approveは含まれません)">
          {s.swapCount} / {s.approveCount} / {s.bridgeCount}
        </Card>
        <Card label="活動期間">
          <span className="text-sm">
            {s.firstSeen ? formatDateTime(s.firstSeen).split(' ')[0] : '—'} 〜{' '}
            {s.lastSeen ? formatDateTime(s.lastSeen).split(' ')[0] : '—'}
          </span>
        </Card>
        <Card label="主なトークン">
          <div className="flex flex-wrap gap-1.5 text-xs font-normal">
            {s.topTokens.length === 0 && <span className="text-slate-500">—</span>}
            {s.topTokens.map((t) => (
              <span key={t.symbol} className="rounded bg-slate-800 px-2 py-0.5">
                {t.symbol} <span className="text-slate-500">×{t.count}</span>
              </span>
            ))}
          </div>
        </Card>
        <Card label="主なプロトコル">
          <div className="flex flex-wrap gap-1.5 text-xs font-normal">
            {s.topProtocols.length === 0 && <span className="text-slate-500">—</span>}
            {s.topProtocols.map((t) => (
              <span key={t.name} className="rounded bg-slate-800 px-2 py-0.5">
                {t.name} <span className="text-slate-500">×{t.count}</span>
              </span>
            ))}
          </div>
        </Card>
        <Card label="その他">
          <div className="space-y-1 text-xs font-normal text-slate-300">
            <p>コントラクト作成: {s.hasDeployment ? 'あり' : 'なし'}</p>
            <p>
              CEX入出金らしき動き:{' '}
              {s.cexActivity.length > 0 ? s.cexActivity.join('、') : '既知ラベルとの一致なし'}
            </p>
            <p className="text-slate-500">対象: {s.chains.map((c) => getChain(c).name).join(' / ')}</p>
          </div>
        </Card>
      </div>

      {p.tokens.some((t) => t.incomplete) && (
        <p className="mt-3 text-xs text-amber-400">
          ⚠ 一部トークン(
          {p.tokens
            .filter((t) => t.incomplete)
            .slice(0, 5)
            .map((t) => t.symbol || shortAddr(t.tokenAddress))
            .join('、')}
          )は期間外の取引があるため、推移は参考値です。
        </p>
      )}
    </div>
  )
}
