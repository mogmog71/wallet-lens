import { useState } from 'react'
import { getApiKey, setApiKey } from '../db/db'

export function SettingsModal(props: { onClose: () => void }) {
  const [key, setKey] = useState(getApiKey())

  function save() {
    setApiKey(key)
    props.onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={props.onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold">Etherscan APIキー</h2>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          解析には無料のEtherscan APIキーが必要です(1つでEthereum / Base / Arbitrumに対応)。
          <a
            href="https://etherscan.io/myapikey"
            target="_blank"
            rel="noreferrer"
            className="text-sky-400 underline"
          >
            etherscan.io
          </a>
          で無料登録して発行できます。キーはこの端末のブラウザ内(localStorage)にのみ保存され、
          Etherscan以外に送信されることはありません。
        </p>
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="APIキーを貼り付け"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-sm placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
        />
        <div className="mt-4 flex justify-end gap-2">
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
