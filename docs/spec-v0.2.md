# EVMアドレス行動解析ツール 仕様書 v0.2

v0.1からの主な変更点:
1. データソースをMVPで3本(Etherscan V2 / DefiLlama / 4byte.directory)に集約。Alchemy・Moralis・DuneはPhase 2以降のオプションに降格
2. 資産推移の計算を「現在残高からの逆算方式(backward reconstruction)」として正式仕様化
3. internal transactionのvalueをETH残高計算に含めることを明記
4. スパムトークンフィルタをMVP必須機能に昇格
5. 1トランザクション複数アクション対応(decoded_actionsスキーマ変更)
6. Swap判定の主軸をEvent Log判定に変更、Dune照合は事後検証用に降格
7. Wrap/Unwrap分類を追加
8. amount系カラムのTEXT保存とBigInt処理を明記
9. Bridge/CEXラベルの静的シードリスト方式を定義
10. 「BOT的挙動の可能性」をMVP概要表示から削除(Phase 4へ)
11. 失敗トランザクションのガス代を集計に含めることを明記
12. Permit2 / EIP-2612署名Approveの制約を明記
13. レート制御・キャッシュ設計を追加

---

## 1. 開発目的

Etherscan、Basescan、Arbiscanなどのブロックチェーンエクスプローラは、取引データを確認するには有用だが、初心者や非エンジニアにとっては以下の問題がある。

- 取引履歴が細かすぎて、実際に何をしたのか分かりにくい
- Swap、Approve、Bridge、LP、Mint、Claimなどの行動分類が難しい
- 複数トークンの入出金があると、資産が増えたのか減ったのか直感的に分からない
- 資産推移を時系列グラフで把握しにくい
- 特定の行動だけを抽出しにくい

本ツールは、EVMアドレスを入力すると、対象アドレスのオンチェーン行動を人間が読める形に変換し、履歴・分類・資産推移・フィルター・グラフで確認できる**ローカルWebアプリ**とする。

Etherscan API V2は1つのAPIキーとchainidパラメータで複数EVMチェーンを扱えるため、初期からマルチチェーン前提で設計する。

## 2. 対象範囲

MVP対応チェーン: **Ethereum / Base / Arbitrum**
拡張候補(chainid追加のみで対応可能な設計にする): Optimism、Polygon、BNB Chain

## 3. 基本コンセプト

4段階パイプライン(v0.1から変更なし):
1. **Raw Transaction** — ブロックチェーン上の生データを取得
2. **Normalize** — チェーン・トークン・金額・相手先・ログを共通形式に整える
3. **Classify** — Swap、Transfer、Approve、Bridge、LP、Claimなどに分類
4. **Explain** — 人間向けに文章・表・グラフで表示

## 4. データ取得方針(v0.1 §7を全面改訂)

### 4.1 MVPデータソース(3本に集約)

| ソース | 用途 | コスト |
|---|---|---|
| **Etherscan API V2** | 通常tx、internal tx、ERC20/721/1155 Transfer、ABI、コントラクト作成情報。chainid切替でETH/Base/Arbitrum対応 | 無料枠 5 req/sec、100k/day。APIキー1個 |
| **DefiLlama coins API** (coins.llama.fi) | 現在価格・過去価格。`{chain}:{token_address}`形式で照会。小型トークンのカバレッジがCoinGeckoより広い | 無料、APIキー不要 |
| **4byte.directory** | ABI取得失敗時のメソッドセレクタ→関数名推定 | 無料 |

**必須APIキーはEtherscan 1個のみ。** これによりセットアップ障壁とレート制御の複雑さが大幅に下がる。

### 4.2 現在残高の取得

MoralisやAlchemyの残高APIは使わず、以下で代替する。

- ERC20残高: 期間中のTransfer履歴に登場したトークンについて、public RPC(viem)経由で`balanceOf`を現在ブロックに対して一括呼び出し(multicall推奨)
- Native残高: `eth_getBalance`

登場トークン数は通常数十件程度であり、multicall 1〜2回で完了する。これで残高系外部APIへの依存がゼロになる。

### 4.3 Phase 2以降のオプションソース

- **Alchemy Transfers API**: Etherscanのレート制限がボトルネックになった場合の代替
- **Moralis Wallet Net Worth**: DeFiポジション込み資産評価
- **Dune dex.trades**: 分類結果の**事後検証・精度測定用**。リクエストパスには置かない(クエリ実行レイテンシが数十秒〜であり、インタラクティブ用途に不適)

### 4.4 レート制御とキャッシュ

- Provider層でトークンバケット方式のレートリミッタを実装(Etherscan: 4 req/sec に抑える)
- 取得済みraw dataはすべてSQLiteに保存し、同一アドレス・同一期間の再解析ではAPIを呼ばない
- 価格データは `(chain, token_address, date)` 単位でキャッシュ。DefiLlamaへの照会は日次粒度で行い、同一日の重複照会を排除する
- ABIは `(chain, contract_address)` 単位で永続キャッシュ

## 5. 主な機能

### 5.1 アドレス入力

- 対象アドレス / 対象チェーン(複数可) / 分析期間 / 行動種別フィルタ / トークンフィルタ / 最小USD金額 / 成功のみ・失敗含む

### 5.2 アドレス概要表示

表示項目:
- 対象アドレス、初回検出日、最終活動日
- 期間内トランザクション数
- 主に使っているチェーン / プロトコル / トークン
- 現在の推定資産額、期間内の推定資産増減
- ガス代合計(**失敗txのガスも含む**)
- Swap回数 / Approve回数 / Bridge推定回数
- コントラクト作成有無
- CEX入出金らしき動きの有無(既知ラベル一致時のみ表示)

**削除項目(v0.1から変更):** 「BOT的挙動の可能性」はPhase 4の機能であり、MVPの概要表示から削除する。仕様内の矛盾解消。Phase 4実装まではUIに一切出さない。

### 5.3 タイムライン表示

表示項目(v0.1 §4.3と同じ): 日時 / チェーン / tx hash / 行動分類 / プロトコル名 / 相手先 / メソッド / 入った資産 / 出た資産 / USD換算 / ガス代 / 成功・失敗 / 説明文 / Confidence

**追加仕様:** 1つのtxに複数アクションが含まれる場合(§7.2参照)、タイムライン上はprimary actionを1行で表示し、展開すると sub-actions を表示する。

### 5.4 スパムトークンフィルタ(MVP必須に昇格)

Base/ArbitrumのアクティブアドレスはスパムairdropのERC20 Transferを大量に受けており、フィルタなしではタイムラインが埋まる。以下をデフォルト非表示とする。

スパム判定条件(いずれか2つ以上該当):
1. DefiLlamaで価格が取得できない
2. 対象アドレスが一度も能動的に操作していない(受動的な受け取りのみ)
3. 同一txで大量のアドレスに同時配布されている(Transferログのto件数が閾値超)
4. トークン名にURL・絵文字・「claim」等の誘導文字列を含む

判定結果は`tokens.is_spam`に保存し、UIで「スパムを表示」トグルで解除可能とする。**スパムトークンは資産評価額の計算から常に除外する。**

## 6. 行動分類

### 6.1 分類カテゴリ

v0.1のA〜Iに加え、以下を追加:

**J. Wrap / Unwrap(新規)**
WETH等のdeposit/withdrawは、Transfer差分だけを見るとSwapと誤分類される。既知のwrapped nativeコントラクト(WETH、WMATIC等)への`deposit()`/`withdraw()`呼び出しはWrap/Unwrapとして独立分類する。資産計算上は等価交換として扱う。

### 6.2 分類優先順位(改訂)

1. Contract Deployment
2. Wrap / Unwrap
3. Approve
4. Swap
5. Bridge(推定)
6. LP Add / Remove
7. Lending / Borrowing
8. Claim / Reward
9. Transfer
10. Unknown Contract Call

**v0.1からの変更点:**
- 「失敗トランザクション」を優先順位から削除。失敗はstatusフラグであり分類カテゴリではない。失敗txも可能な範囲で意図(どのメソッドを呼ぼうとしたか)を分類し、`status=failed`を付与する。**失敗txのガス代は必ずガス集計に含める**(失敗でもガスは消費されるため。ここを漏らすと高頻度アドレスのガス集計が大きくズレる)
- Wrap/UnwrapをSwapより先に判定(誤分類防止)

### 6.3 Swap判定ロジック(主軸を変更)

**方法A(主軸): Event Log判定**
既知DEXのSwapイベントシグネチャと照合する。対応イベント:
- Uniswap V2系 `Swap(address,uint256,uint256,uint256,uint256,address)`
- Uniswap V3系 `Swap(address,address,int256,int256,uint160,uint128,int24)`
- Uniswap V4 `Swap` (PoolManager経由)
- Curve `TokenExchange`
- Balancer V2 `Swap`
- Aerodrome / Velodrome(V2系フォーク)

イベントシグネチャはトピック0のkeccakハッシュ定数としてコードに保持する。ABI不要で判定でき、レイテンシゼロ。→ **Confidence: High**

**方法B(補完): Token Transfer差分推定**
同一tx内で対象アドレスからToken Aが減りToken Bが増え、相手先が既知router/poolまたはコントラクト → Swapと推定。→ **Confidence: Medium**

**方法C(事後検証・Phase 3): Dune dex.trades照合**
バッチで分類結果とdex.tradesを突合し、方法A/Bの精度を測定する。リアルタイム判定には使わない。

### 6.4 Bridge / CEXラベル(入手方法を定義)

v0.1ではラベルの入手方法が未定義だった。現実解として**静的シードリスト方式**を採用する。

- リポジトリ内に `labels/seed.json` を保持し、主要Bridge(Across、Stargate、Hop、各チェーンのnative bridge、LayerZero endpoint)と主要CEX hot wallet(Binance、Coinbase、OKX、Bybit等の公知アドレス)を手動メンテナンスする
- 初期は各カテゴリ20〜50件で十分。一致しないものは分類しない(誤ラベルより未ラベルの方が害が小さい)
- Etherscanのラベルページはスクレイピング禁止のため使用しない

### 6.5 Approve判定の制約(新規)

- `approve(address,uint256)` 呼び出しはメソッドセレクタ `0x095ea7b3` で確実に判定できる
- **Permit2およびEIP-2612のpermit署名はトランザクションとして現れない**(署名はSwap実行txに内包される)。したがって「Approve回数」は on-chain approve のみのカウントであることをUI上に注記する
- 無制限Approve(uint256 max)は説明文で明示する: 「無制限の利用許可を出しました」

## 7. データベース設計(改訂)

SQLiteで開発、PostgreSQL/Supabase移行可能な構造。ORM は **Drizzle** を採用(SQLite相性、軽量、マイグレーションがSQLベースで追いやすい)。

### 7.1 重要な変更: 数値カラムの型

**uint256はJavaScriptのnumberおよびSQLiteのINTEGERの範囲を超える。** 以下を厳守する。

- `amount_raw`、`value_native`等のオンチェーン生値は **TEXT** で保存
- アプリケーション層では **BigInt** で処理し、表示直前にのみdecimals調整してstring/numberに変換
- USD換算値のみREALで保存可

### 7.2 decoded_actions(スキーマ変更)

1txに複数アクション(aggregator swapの複数hop、zapのSwap+LP add等)を許容する。

```
id
chain_id
tx_hash
action_index        -- tx内の順序(0始まり)
is_primary          -- タイムラインに代表表示するアクション
address
action_type
protocol_name
protocol_address
summary_text
token_in_address / token_in_symbol / token_in_amount_raw (TEXT)
token_out_address / token_out_symbol / token_out_amount_raw (TEXT)
amount_usd
gas_fee_usd         -- primary actionにのみ計上(重複集計防止)
confidence
classification_reason
created_at
```

### 7.3 tokens(新規テーブル)

```
id
chain_id
token_address
symbol
name
decimals
is_spam             -- §5.4の判定結果
spam_reason
price_available     -- DefiLlamaで価格取得可能か
created_at
updated_at
```

### 7.4 その他のテーブル

addresses / chains / transactions / token_transfers / token_prices / portfolio_snapshots / labels はv0.1 §13の構造を踏襲。ただし:
- `transactions.value_native` → TEXT
- `token_transfers.amount_raw` → TEXT
- `transactions` に `has_internal_value` (bool) を追加(internal txでETHが動いたか)
- `labels` はseed.jsonから初期投入

### 7.5 internal_transactions(新規テーブル)

```
id
chain_id
tx_hash
trace_index
from_address
to_address
value_native (TEXT)
created_at
```

**このテーブルはETH残高計算に必須。** SwapでETHを受け取る場合、大半はrouterからのinternal transferで届くため、通常txとERC20 Transferだけを見るとETH残高推移が実際と乖離する。

## 8. 資産推移の計算仕様(全面改訂)

### 8.1 逆算方式(backward reconstruction)を正式採用

v0.1は「期間開始時点の残高」を前提としていたが、過去ブロックの残高照会はアーカイブアクセスがトークン数×時点数必要で非現実的。以下の逆算方式を採用する。

**手順:**
1. **現在残高を取得**(§4.2: multicall balanceOf + eth_getBalance)
2. 期間中の全資産移動をトークン別・時系列で集計する。含めるもの:
   - ERC20 Transfer(in/out)
   - Native transfer(通常txのvalue)
   - **internal transactionのvalue(必須)**
   - ガス代(native残高から控除。**失敗tx含む**)
3. 現在残高から新しい順に移動を巻き戻し、各日付末時点の残高を復元する
4. 各時点の残高 × その日のUSD価格(DefiLlama日次)で評価額を算出

**整合性チェック:** 巻き戻し中に残高が負になった場合、期間外の取得やデータ欠損を意味する。該当トークンに `data_quality: incomplete` を付け、UIで「このトークンの推移は参考値」と明示する。

### 8.2 価格欠損の扱い(明文化)

価格取得はこのツール最大の実務的ボトルネックであり、以下を仕様として定める。

- DefiLlamaで価格が取れないトークンは資産評価額に**含めない**(0円扱いではなく「評価対象外」として区別表示)
- 評価対象外トークンの一覧と、評価済みトークンのカバレッジ率(例: 「保有23トークン中19トークンを評価。評価額は下限推定です」)を必ず表示する
- 過去価格は日次粒度で取得・キャッシュし、tx単位の分単位価格は使わない(MVPでは日次で十分)

### 8.3 推定資産増減の式

```
推定資産増減 = 期間終了時評価額 − 期間開始時評価額
             − 外部からの入金評価額 + 外部への出金評価額
```

ガス代は残高巻き戻しに内包されるため別途控除しない(二重控除防止)。「利益」とは表現せず「推定資産増減(参考値)」とする。損益断定機能はPhase 2以降(v0.1 §19の方針を維持)。

## 9. Confidence(分類確信度)

- **High**: 既知イベントシグネチャ一致 / ABIで関数名確定 / seed.jsonラベル一致
- **Medium**: Transfer差分からの推定 / 既知routerへのcall / Bridgeコントラクトへの送金
- **Low**: ABIなし、4byte推定のみ / Transferだけで意味未確定

(v0.1の「Dune一致=High」はPhase 3の事後検証に移動)

## 10. API設計

v0.1 §14を踏襲。補足:
- **本ツールはローカル常駐Nodeプロセスとして動かす前提**とする。Next.js API Routesをサーバーレスにデプロイする場合、解析ジョブが実行時間制限に抵触するため、ジョブ実行は分離ワーカー(ローカルではインプロセスで可)とする
- POST /api/analyze → jobId返却、GET /api/analyze/:jobId/status でポーリング(v0.1と同じ)
- ジョブは冪等: 同一(address, chains, period)の再実行はキャッシュ済みraw dataをスキップ

## 11. 技術スタック(確定)

- Next.js + TypeScript + React + Tailwind CSS + shadcn/ui
- TanStack Table / **Recharts**(EChartsは不要。グラフ要件は全てRechartsで足りる)
- **viem**(ethers.jsではなくviemに確定。multicall・型安全性・BigIntネイティブ対応)
- SQLite + **Drizzle ORM**
- Zod(APIレスポンス・外部APIレスポンスのバリデーション)

## 12. MVP実装範囲(改訂)

**必須:**
- アドレス入力 / チェーン選択(ETH・Base・Arbitrum) / 期間指定
- Etherscan V2からの tx / internal tx / ERC20 Transfer 取得
- 現在残高取得(multicall)
- 分類: Approve / Swap(Event Log判定) / Wrap-Unwrap / Transfer / Contract Deployment / Unknown
- **スパムトークンフィルタ**(v0.1から昇格)
- タイムライン表示(行動種別フィルタ付き)
- 逆算方式の資産推移グラフ(総資産・トークン別)
- ガス代集計(失敗tx含む)
- CSVエクスポート

**MVPで後回し(v0.1から変更なし + 追加):**
- Bridge/LP/Lending/Claimの本格分類(MVPではUnknown寄りの粗い推定でよい)
- DeFiポジション評価 / 損益断定 / NFT分析 / CEX内部追跡 / ウォレットクラスタリング / BOT判定 / MEV分析 / リアルタイム監視 / Dune事後検証

## 13. 実装フェーズ(改訂)

**Phase 1: MVP** — 上記§12。「いつ、どこで、何をしたか」を高精度に表示
**Phase 2: Portfolio強化** — 日次スナップショット永続化、入出金推移、価格カバレッジ改善(CoinGeckoフォールバック)、Moralis検討
**Phase 3: Protocol Intelligence** — labels DB拡充、Bridge/LP/Lending/Claim本格分類、Counterparty分析、**Dune dex.tradesによる分類精度の事後検証**
**Phase 4: Advanced Analysis** — 高頻度取引検出、BOT的挙動推定、早期購入/売却分析、推定損益、複数ウォレット比較

## 14. エラーハンドリング・UI注記

v0.1 §23を踏襲。追加:
- 価格カバレッジ率を常時表示(§8.2)
- 残高巻き戻しの整合性エラー時は該当トークンに参考値表示
- Approve回数のon-chain限定注記(§6.5)
- Etherscanレート制限到達時は自動待機し、進捗表示に反映

## 15. セキュリティ・倫理

v0.1 §24を踏襲(変更なし)。公開オンチェーンデータの整理・理解が目的であり、秘匿化支援・不正アクセス・規制回避目的の利用は対象外。

## 16. 開発上の優先順位

v0.1 §28の方針を維持:
1. 正確なデータ取得(internal tx含む)
2. 共通形式への正規化(BigInt/TEXT厳守)
3. 行動分類(Event Log主軸)
4. 初心者向け説明文
5. フィルター(スパム除外含む)
6. グラフ(逆算方式)
7. 高度な収益分析

最初に作る画面は v0.1 §26 と同じ3つ(入力 / タイムライン / 資産推移)。
