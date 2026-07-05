import { useState } from 'react'
import { getApiKeys, setApiKeys } from '../db/db'

export function SettingsModal(props: { onClose: () => void }) {
  const [keys, setKeys] = useState(getApiKeys())

  function save() {
    setApiKeys(keys)
    props.onClose()
  }

  const inputCls =
    'mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-sm placeholder:text-slate-600 focus:border-sky-500 focus:outline-none'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={props.onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold">APIキー設定</h2>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          解析するチェーンに応じて無料のAPIキーが必要です。キーはこの端末のブラウザ内
          (localStorage)にのみ保存され、各APIプロバイダ以外に送信されることはありません。
        </p>

        <label className="mt-4 block text-xs font-medium text-slate-300">
          Moralis APIキー <span className="text-sky-400">(推奨・全チェーン対応)</span>
        </label>
        <p className="mt-0.5 text-[11px] text-slate-500">
          <a href="https://admin.moralis.com/" target="_blank" rel="noreferrer" className="text-sky-400 underline">
            admin.moralis.com
          </a>
          で無料登録 → 「API Keys」からコピー(無料枠 40,000 CU/日)。これ1つで全チェーンを解析できます
        </p>
        <input
          value={keys.moralis}
          onChange={(e) => setKeys({ ...keys, moralis: e.target.value })}
          placeholder="Moralisキーを貼り付け"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className={inputCls}
        />

        <label className="mt-4 block text-xs font-medium text-slate-300">
          Etherscan APIキー <span className="text-slate-500">(任意・Ethereumの解析品質向上)</span>
        </label>
        <p className="mt-0.5 text-[11px] text-slate-500">
          <a href="https://etherscan.io/myapikey" target="_blank" rel="noreferrer" className="text-sky-400 underline">
            etherscan.io/myapikey
          </a>
          で無料発行。設定するとEthereumはEtherscanから取得します(メソッド名の精度が高い)
        </p>
        <input
          value={keys.etherscan}
          onChange={(e) => setKeys({ ...keys, etherscan: e.target.value })}
          placeholder="Etherscanキーを貼り付け(任意)"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className={inputCls}
        />

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={props.onClose}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            閉じる
          </button>
          <button
            onClick={save}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
