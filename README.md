# hc — Cloudflare-only uptime monitor

Cloudflareだけで完結する死活監視システム。Workers(Cron Triggers)で定期的にHTTP/HTTPSエンドポイントを監視し、障害・復旧をDiscord/Slack/汎用WebhookへNotifyし、公開ステータスページで可視化する。外部のSaaSやサーバーは不要。

## 構成

- **Workers `scheduled()`**: Cron(1分毎)で監視を実行
- **Workers `fetch()` + Hono**: 公開ステータスページとJSON API
- **D1(SQLite)**: 監視設定・チェック履歴・障害履歴・日次集計
- 監視対象は `monitors.config.ts` で宣言(Configuration as Code)

詳細な設計は `.tmp/design.md` を参照。

## セットアップ

```bash
npm install

# 0. 設定テンプレートをコピー(どちらもgitignore。環境固有値・監視先を持つため)
cp wrangler.jsonc.example wrangler.jsonc
cp monitors.config.ts.example monitors.config.ts

# 1. D1データベースを作成し、出力されたIDを wrangler.jsonc の database_id に貼り付ける
npm run db:create

# 2. スキーマを適用(ローカル / 本番)
npm run db:migrate:local
npm run db:migrate:remote

# 3. 監視対象を編集
#    monitors.config.ts を編集

# 4. 通知先を設定(使うものだけ)
wrangler secret put DISCORD_WEBHOOK_URL
wrangler secret put SLACK_WEBHOOK_URL
wrangler secret put GENERIC_WEBHOOK_URL

# 5. デプロイ
npm run deploy
```

## ローカル開発

```bash
cp .dev.vars.example .dev.vars   # 通知先を入れる(任意)
npm run dev                      # http://localhost:8787 でステータスページ
```

Cron(scheduled)をローカルで手動発火する:

```bash
# 別ターミナルで
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
```

## 監視ロジック

- 各monitorの `intervalSeconds` ごとにHTTPチェック(status / body_match / timeout)
- 連続`FAIL_THRESHOLD`(既定3)回失敗でDOWN確定 → 通知 + インシデント起票
- 連続`OK_THRESHOLD`(既定2)回成功で復旧 → 通知 + インシデント解決
- 確定遷移時のみ通知し、フラッピングによる誤報を抑制

## 設定(環境変数)

`wrangler.jsonc`の`vars`で設定する。

| 変数 | 既定 | 内容 |
| --- | --- | --- |
| `FAIL_THRESHOLD` | `3` | DOWN確定に必要な連続失敗回数 |
| `OK_THRESHOLD` | `2` | 復旧確定に必要な連続成功回数 |
| `TIMEZONE` | `UTC` | ステータスページの時刻表示に使うIANAタイムゾーン(例: `Asia/Tokyo`)。不正な値はUTCにフォールバック |

通知(Discord等)の時刻は各クライアント側のタイムゾーンで表示されるため、`TIMEZONE`はステータスページの表示にのみ影響する。

## 制約(SSL証明書の有効期限)

「残りN日で失効」の事前警告はCloudflareの制約上ベストエフォート(フェーズ3で検証)。
証明書の失効そのものはHTTPチェックで確実に検知される(`.tmp/design.md` 6.2参照)。

## スクリプト

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | ローカル起動 |
| `npm run deploy` | デプロイ |
| `npm run typecheck` | 型チェック |
| `npm run lint` | Biomeでlint+整形 |
| `npm run db:migrate:remote` | 本番D1へマイグレーション適用 |
