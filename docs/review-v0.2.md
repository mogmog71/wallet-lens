# 仕様書 v0.2 レビュー(2026-07-05)

総評: v0.1からの改訂方針(データソース集約、逆算方式、TEXT/BigInt厳守、Event Log主軸、スパムフィルタ昇格)はいずれも妥当。以下、実装前に修正・追記すべき点を重要度順に挙げる。

## R-1. 【アーキテクチャ】「ローカルWebアプリ」要件の変更(ユーザー要望)

**要望: スマホから出先でも使える、維持費ゼロ。**

検証結果: MVPの全外部API がブラウザからの直接呼び出しを許可(CORS `Access-Control-Allow-Origin: *`)していることを実測確認した。

| API | CORS | 確認日 |
|---|---|---|
| Etherscan API V2 (`api.etherscan.io/v2/api`) | `*` | 2026-07-05 |
| DefiLlama (`coins.llama.fi`) | `*` | 2026-07-05 |
| 4byte.directory | `*` | 2026-07-05 |
| publicnode RPC (ETH) / `mainnet.base.org` / `arb1.arbitrum.io` | `*` | 2026-07-05 |

→ **サーバー不要。完全クライアントサイドSPA + 静的ホスティング(GitHub Pages / Cloudflare Pages、無料)+ PWA** が最適解。

- サーバーレス実行時間制限の懸念(v0.2 §10)は根本から消える(解析はブラウザ内で無制限に走る)
- SQLite + Drizzle → **IndexedDB(Dexie)** に変更。TEXT/BigInt方針はそのまま適用可能
- Next.js は不要(API Routesを使わないため)。**Vite + React** の静的SPAに変更
- EtherscanのAPIキーはユーザー自身の無料キーを初回に入力し `localStorage` に保存。バンドルには埋め込まない(公開ホスティングでも漏洩リスクなし)
- トレードオフ: キャッシュ(IndexedDB)は端末ごとに独立。スマホでの大規模アドレス解析は数十秒〜数分かかる。許容範囲と判断

却下した代替案:
- Vercel Hobby + Turso: 関数実行60秒制限で解析ジョブが分割前提になり複雑化。CORSが開いている以上、サーバーを挟む理由がない
- Cloudflare Workers無料枠: CPU 10ms/リクエスト制限で解析不可能

## R-2. 【残高計算】Base(OP Stack)のL1データ手数料の欠落

Baseのtxは `gasUsed × gasPrice` に **L1データ手数料が含まれない**(receiptの `l1Fee` フィールドに別建て)。Etherscanの `txlist` レスポンスにも含まれない。このままではBaseのETH残高巻き戻しが送信txの数だけ累積的にズレる。

- Arbitrumは `effectiveGasPrice` にL1コストが織り込まれるため問題なし
- 対応: MVPでは既知の制約として `data_quality` 注記(§8.1の整合性チェックが検出してくれる)。Phase 2でBaseの送信txのみ `eth_getTransactionReceipt` から `l1Fee` を取得して補正

## R-3. 【データ取得】Etherscanの10,000件上限とページング

`txlist` 系は `page × offset ≦ 10000` の壁がある。高頻度アドレスでは欠損する。

- 対応(MVP必須): `sort=asc` + `startblock` カーソル方式でページングする(最終レコードのblockNumberを次回のstartblockにし、重複をhash+indexで排除)。これで件数無制限

## R-4. 【分類】Swap Event Log判定にはreceipt/logsの取得が必要

v0.2はEvent Log判定を「レイテンシゼロ」としているが、Etherscanの `txlist` / `tokentx` は**イベントログを返さない**。トピック0を照合するには `eth_getTransactionReceipt` が必要。

- 対応: Swap候補tx(同一txでトークンin/outが両方あるもの)に限定してpublic RPCからreceiptをバッチ取得し、IndexedDBに永続キャッシュ。候補は通常全txの一部なので実用的
- receipt未取得のものは方法B(Transfer差分、Confidence: Medium)にフォールバック

## R-5. 【スパム判定】条件3は入手データだけでは判定不可

「同一txで大量のアドレスに同時配布」は、`tokentx` が**自分宛のTransferしか返さない**ため判定できない。receiptを取ればそのtxの全ログ数で近似判定できる。

- 対応: MVPは条件1・2・4(+「同一ブロックで多数の未知トークンを一括受領」というローカルで判定可能な近似条件)で運用。条件3はreceipt取得インフラに乗せてPhase 2

## R-6. 【価格】DefiLlama照会のリクエスト数爆発

トークン数 × 日数を素朴に照会すると数千リクエストになる。

- 対応: `POST /batchHistorical`(複数トークン×複数タイムスタンプの一括照会)を使用。日次粒度・キャッシュ方針はv0.2のまま

## R-7. 【分類】Approve判定の追加セレクタ

`approve` (0x095ea7b3) に加えて `increaseAllowance` (0x39509351) / `decreaseAllowance` (0xa457c2d7) もApprove系として分類すべき。

## R-8. 【残高計算】txlist/txlistinternalに現れないETH変動(既知の制約)

- ビーコンチェーン出金(ステーキング報酬)、バリデータ報酬
- 一部のセルフデストラクト経由送金(txlistinternalに出るので概ねOK)

→ 該当アドレスでは§8.1の整合性チェックが負残高を検出し参考値表示になる。UIの注記文言に「ステーキング出金は未対応」を追加。

## R-9. 軽微

- ERC721/1155転送は取得・タイムライン表示するが、資産評価からは除外(NFT評価はスコープ外)を明文化
- WETHのWrap/Unwrapは `deposit()` (0xd0e30db0) / `withdraw(uint256)` (0x2e1a7d4d) のセレクタ + 既知コントラクトアドレスの組で判定(High)
- CSVエクスポートはUTF-8 BOM付きにする(Excelでの文字化け防止、日本語ヘッダのため)

## 結論

R-1(アーキテクチャ変更)を反映した差分仕様を v0.3 として起こし(spec-v0.3.md)、R-2〜R-9はv0.3内で対応方針を確定した上でMVP実装に着手する。
