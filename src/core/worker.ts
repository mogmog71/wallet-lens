// 解析パイプラインをWeb Workerで実行する(C-1)。
// 大規模アドレスの解析中にUIスレッドをブロックしない(特にモバイルで重要)。
// IndexedDB(Dexie)はWorkerからも同じDBに接続できる。
// localStorageはWorkerでは使えないため、APIキーはメッセージで受け取る。
import type { ApiKeys } from '../db/db'
import { runAnalysis } from './analyze'
import type { AnalysisParams, AnalysisResult } from './types'

export type WorkerRequest = { params: AnalysisParams; keys: ApiKeys }
export type WorkerResponse =
  | { type: 'progress'; step: string; detail?: string }
  | { type: 'done'; result: AnalysisResult }
  | { type: 'error'; message: string }

const post = (msg: WorkerResponse) => (self as unknown as Worker).postMessage(msg)

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  try {
    const result = await runAnalysis(e.data.params, e.data.keys, (step, detail) =>
      post({ type: 'progress', step, detail }),
    )
    post({ type: 'done', result })
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
