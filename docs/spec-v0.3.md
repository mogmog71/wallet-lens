# EVMアドレス行動解析ツール 仕様書 v0.3(差分)

v0.2からの変更点。記載のない項目はv0.2(spec-v0.2.md)を踏襲する。
変更理由の詳細は review-v0.2.md を参照。

> **改訂(2026-07-05実装後の変更)**: Etherscan API V2の無料プランは実測で
> Ethereum以外のチェーンを提供しなくなっていた(「Free API access is not
> supported for this chain」)。Basescan/ArbiscanのV1 APIも廃止済み、
> Blockscoutは一部セキュリティソフトがURLブラックリストでブロックするため不採用。
> 対応として履歴取得プロバイダをチェーンごとに切り替える構成に変更した:
> - **Ethereum → Etherscan API V2**(無料キー)
> - **Base / Arbitrum → Moralis Wallet History API**(無料キー1個、40k CU/日。
>   tx本体・internal tx・ERC20/NFT転送・失敗txを1エンドポイントで返し、
>   possible_spamフラグはスパム判定の条件に加える)
> 必要キーは最大2個になる(§4.1の「1個のみ」から変更)。

## 主な変更点

1. **デプロイ形態を「ローカルWebアプリ」から「完全クライアントサイドSPA(静的ホスティング + PWA)」に変更**(R-1)
2. 技術スタック変更: Next.js → Vite + React、SQLite + Drizzle → IndexedDB (Dexie)(R-1)
3. Swap Event Log判定のデータ源を明記: public RPCからのreceiptバッチ取得 + 永続キャッシュ(R-4)
4. Etherscanページングをstartblockカーソル方式に確定(R-3)
5. スパム判定条件3をPhase 2に降格、代替のローカル判定条件を追加(R-5)
6. DefiLlama照会をbatchHistorical一括方式に確定(R-6)
7. BaseのL1データ手数料をMVPの既知制約として明記、補正はPhase 2(R-2)
8. Approve系セレクタにincrease/decreaseAllowanceを追加(R-7)

## 1. デプロイ形態(v0.2 §1, §10を改訂)

- **完全クライアントサイドSPA**。ビルド成果物は静的ファイルのみで、GitHub Pages / Cloudflare Pages 等の無料静的ホスティングに置く。**維持費ゼロ、スマホのブラウザから利用可能**
- **PWA対応**: manifest + service worker により、スマホのホーム画面に追加してアプリのように起動できる
- 解析パイプライン(取得→正規化→分類→表示)はすべてブラウザ内で実行する。サーバー実行時間制限の概念自体が存在しないため、v0.2 §10のジョブ分離・ポーリングAPI設計は**廃止**(アプリ内の非同期処理 + 進捗表示に置換)
- 全外部API(Etherscan V2 / DefiLlama / 4byte / public RPC)はCORS開放を実測確認済み(2026-07-05)

### APIキーの扱い

- EtherscanのAPIキーはユーザーが自分の無料キーを設定画面で入力し、`localStorage` に保存する
- キーをソースコード・ビルド成果物に埋め込まない
- キー未設定時は設定画面に誘導し、取得手順(etherscan.ioでの無料登録)を表示する

## 2. データ層(v0.2 §7を改訂)

- **IndexedDB(Dexie)** を採用。テーブル構成はv0.2 §7の論理設計を踏襲:
  - `transactions` / `internal_transactions` / `token_transfers` / `nft_transfers` / `tokens` / `token_prices` / `decoded_actions` / `receipts` / `labels` / `fetch_ranges` / `settings`
- **TEXT/BigInt方針は不変**: オンチェーン生値はstringで保存し、計算はBigIntで行う
- `fetch_ranges`: `(chain_id, address, endpoint)` ごとに取得済みブロック範囲を記録し、再解析時は差分のみ取得(v0.2 §4.4のキャッシュ方針のIndexedDB版)
- `receipts`: Swap判定用に取得したtx receipt(logs含む)を `(chain_id, tx_hash)` で永続キャッシュ
- キャッシュは端末ごとに独立する(制約として許容)

## 3. データ取得(v0.2 §4を補強)

- Etherscanページング: `sort=asc` + `startblock` カーソル方式。1リクエスト最大件数を取得し、満杯なら最終blockNumberを次回startblockに設定、hash+indexで重複排除。10,000件上限を回避
- レートリミッタ: トークンバケット 4 req/sec(v0.2どおり)。ブラウザ内で全Etherscan呼び出しが単一のリミッタを通る
- receipt取得: Swap候補tx(同一txでトークン/ネイティブのin・outが両方あるもの)についてpublic RPCの `eth_getTransactionReceipt` をバッチ実行(JSON-RPC batch、並列度制限付き)
- RPCエンドポイント(フォールバック付き):
  - Ethereum: `ethereum-rpc.publicnode.com`
  - Base: `mainnet.base.org` / `base-rpc.publicnode.com`
  - Arbitrum: `arb1.arbitrum.io/rpc` / `arbitrum-one-rpc.publicnode.com`
- DefiLlama過去価格: `POST https://coins.llama.fi/batchHistorical` で日次一括取得

## 4. スパム判定(v0.2 §5.4を改訂)

MVPの判定条件(いずれか2つ以上該当):
1. DefiLlamaで価格が取得できない
2. 対象アドレスが一度も能動的に操作していない(受動的な受け取りのみ)
3. ~~同一txで大量のアドレスに同時配布~~ → **Phase 2**(receiptログ数で近似判定)
4. トークン名にURL・絵文字・「claim」「visit」「reward」等の誘導文字列を含む
5. **(新規・条件3の代替)** 短期間に受動受領した未知トークンで、かつ受領後に一切の送金・Approve・Swapがない

## 5. 資産推移(v0.2 §8を補強)

- 逆算方式はv0.2どおり
- **既知の制約(UI注記)**:
  - BaseのL1データ手数料は巻き戻しに含まれない(Phase 2でreceipt `l1Fee` 補正)
  - ビーコンチェーン出金等、txlist/txlistinternalに現れないETH変動は未対応
  - いずれも§8.1の整合性チェック(負残高検出→参考値表示)でカバーされる

## 6. 分類(v0.2 §6を補強)

- Approve系セレクタ: `approve` 0x095ea7b3 / `increaseAllowance` 0x39509351 / `decreaseAllowance` 0xa457c2d7
- Wrap/Unwrap: 既知wrapped nativeコントラクト(WETH各チェーン)への `deposit()` 0xd0e30db0 / `withdraw(uint256)` 0x2e1a7d4d → Confidence: High
- Swap方法A(Event Log): receiptキャッシュのトピック0を既知シグネチャと照合 → High。receipt未取得・取得失敗時は方法B(Transfer差分)→ Medium
- ERC721/1155転送はタイムラインに表示するが資産評価から除外

## 7. 技術スタック(v0.2 §11を改訂)

- **Vite + React + TypeScript + Tailwind CSS**(Next.js・shadcn/uiは廃止。UIコンポーネントは軽量自作)
- Recharts / viem / Zod(v0.2どおり)
- **Dexie(IndexedDB)**(SQLite + Drizzleは廃止)
- **vite-plugin-pwa**(PWA化)
- モバイルファーストのレスポンシブUI(タイムラインはスマホではカード表示、PCではテーブル表示)

## 8. CSVエクスポート

- UTF-8 BOM付き(Excel対応)
- 対象: フィルタ適用後のタイムライン(decoded_actions)

## 9. MVP実装範囲(v0.2 §12の更新)

v0.2 §12に対して:
- 追加: PWA対応 / APIキー設定画面 / receipt取得によるEvent Log判定
- 変更なし: それ以外すべて
