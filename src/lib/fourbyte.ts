import { db } from '../db/db'
import { mapLimit, TokenBucket } from './ratelimit'

// 4byte.directory: メソッドセレクタ → 関数名の推定(仕様v0.2 §4.1)。
// ABIが取れないコントラクト呼び出しの「不明」を減らす。結果は永続キャッシュし、
// 見つからなかったセレクタも空文字で記録して再照会しない。

const bucket = new TokenBucket(3, 3)

export async function lookupSelectors(selectors: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const missing: string[] = []
  const cached = await db.sigs.bulkGet(selectors)
  cached.forEach((row, i) => {
    if (row) {
      if (row.name) out.set(selectors[i], row.name)
    } else {
      missing.push(selectors[i])
    }
  })

  await mapLimit(missing, 2, async (sel) => {
    await bucket.take()
    try {
      const res = await fetch(
        `https://www.4byte.directory/api/v1/signatures/?hex_signature=${sel}&ordering=created_at`,
      )
      if (!res.ok) return
      const j = (await res.json()) as { results?: { text_signature?: string }[] }
      // ordering=created_at で最古を採用(後発の衝突シグネチャより正しい可能性が高い)
      const text = j.results?.[0]?.text_signature ?? ''
      const name = text.split('(')[0] ?? ''
      await db.sigs.put({ selector: sel, name })
      if (name) out.set(sel, name)
    } catch {
      // 一時エラーはキャッシュせず次回再試行
    }
  })
  return out
}
