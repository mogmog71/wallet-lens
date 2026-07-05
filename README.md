# Wallet Lens — EVMアドレス行動解析ツール

EVMアドレスを入力すると、オンチェーン行動(Swap / Approve / Bridge / 送金 など)を人間が読める形に分類し、タイムライン・資産推移グラフ・概要で表示するWebアプリ。

- **完全クライアントサイド** — サーバー不要。解析はすべてブラウザ内で実行され、データはブラウザのIndexedDBにキャッシュされる
- **維持費ゼロ** — 静的ホスティング(GitHub Pages)で動く。必要なAPIキーは[Moralis](https://admin.moralis.com/)の無料キー1つ(全チェーン対応・利用者が自分で入力)。[Etherscan](https://etherscan.io/myapikey)キーは任意(Ethereumの取得品質向上用)
- **スマホ対応(PWA)** — ホーム画面に追加してアプリのように使える
- 対応チェーン: Ethereum / Base / Arbitrum / Optimism / Polygon / BNB Chain / Avalanche / Linea(追加手順: [docs/adding-a-chain.md](docs/adding-a-chain.md))

仕様書: [docs/spec-v0.2.md](docs/spec-v0.2.md)(ベース) / [docs/spec-v0.3.md](docs/spec-v0.3.md)(差分・現行) / [docs/review-v0.2.md](docs/review-v0.2.md)(レビュー)

## 開発

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 型チェック + 本番ビルド (dist/)
```

初回起動時にEtherscanの無料APIキー(https://etherscan.io/myapikey で発行)を設定する。キーはlocalStorageにのみ保存される。

## デプロイ(GitHub Pages・無料)

1. GitHubにリポジトリを作成してpush
2. リポジトリの Settings → Pages → Source を **GitHub Actions** に設定
3. `.github/workflows/deploy.yml` が push のたびに自動ビルド・デプロイする

公開URL(`https://<ユーザー名>.github.io/<リポジトリ名>/`)をスマホで開き、「ホーム画面に追加」すればアプリとして使える。

## アーキテクチャ

```
src/
  config/     チェーン定義・イベントシグネチャ・メソッドセレクタ
  data/       Bridge/CEXの静的シードラベル
  db/         IndexedDB (Dexie) スキーマ
  lib/        外部API: Etherscan V2 / DefiLlama / public RPC (viem) / レート制御
  core/       パイプライン: 取得 → 正規化 → スパム判定 → 分類 → 資産逆算 → 集計
  ui/         画面: 入力 / 概要 / タイムライン / 資産推移
```

設計上の要点:

- **uint256はTEXT(string)で保存し、計算はBigInt** — number化は表示・USD換算の直前のみ
- **資産推移は逆算方式** — 現在残高(multicall)から日次の資産移動を巻き戻す。internal txのvalue・失敗txのガス代を含む
- **Swap判定はEvent Log主軸** — Swap候補txのreceiptをpublic RPCから取得し、既知DEXのtopic0と照合(High)。receipt不在時はTransfer差分推定(Medium)
- **Etherscanの10,000件上限はstartblockカーソルで回避**、レートは4req/秒に制御
- スパムトークンは複数条件の合致で判定し、タイムライン非表示(トグルあり)+資産評価から常時除外

## 既知の制約(MVP)

- BaseのL1データ手数料は残高巻き戻しに含まれない(僅少なズレ。Phase 2でreceipt l1Fee補正)
- ビーコンチェーン出金などtxlistに現れないETH変動は未対応(整合性チェックが検出し参考値表示)
- Approve回数はオンチェーンApproveのみ(Permit2 / EIP-2612署名は対象外)
- Bridge/LP/Lending/Claimの本格分類はPhase 3
