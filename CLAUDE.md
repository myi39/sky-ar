# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 概要

カードをトリガーに、対応する 3D モデルを OS 標準の AR ビューアで空間に配置する静的サイト。ビルド不要・パッケージマネージャなし・テストスイートなし・外部ライブラリや CDN 読み込みも一切なし。ロジックはすべてプレーンな HTML / JS に記述されており、そのままブラウザで動く。

## 動作確認

一覧・個別ページの描画やプラットフォーム判定、リンクの組み立てはローカルの静的サーバーで確認できる。一覧・個別ページは `getUserMedia` を呼ばず、カメラは OS の AR ビューアが扱うため、HTTPS は必須ではない。

**`scan.html` だけは HTTPS が必須。** カメラ映像を `getUserMedia` で読むため、安全なコンテキスト（HTTPS または `localhost`）でないと動かない。`/serve` で配信した `http://<Tailscale の IP>:8000/` を iPhone で開いても、カメラは使えない。PC の `localhost` であれば、ヘッドレスブラウザに偽のカメラ映像を流して判定を確かめられる。

一方、AR Quick Look（iPhone）・Scene Viewer（Android）が実際に起動して設置まで動くかは実機でしか確認できない。一覧・個別ページは、ローカルサーバーを同じネットワーク上の端末から開けばよく、GitHub Pages である必要はない。公開先は GitHub Pages（https://myi39.github.io/sky-ar/）。

## 主要ファイル

| ファイル | 役割 |
|---|---|
| `index.html` | エントリポイント。`?c=<id>` なしで一覧、あり（かつ既知の id）で個別ページを描画する |
| `app.js` | 一覧・個別ページの描画と、AR 起動リンク（`<a>`）の組み立てを行う |
| `ar.js` | `platform()`（端末判定）と `arUrl()`（AR ビューアを開く URL）。`index.html` と `scan.html` の両方が読み込む |
| `scan.html` / `scan.js` | カメラでカードを識別し、そのまま AR を開くスキャンページ |
| `cards.js` | `tools/make_cards.ps1` が `3d/glb/*.glb` から生成する `<id>` の配列。手で編集しない |
| `images/<id>_front.jpg` | カードの表面画像（個別ページの hero 画像） |
| `images/thumb/<id>.jpg` | 一覧用サムネイル（`tools/make_thumbs.ps1` が生成） |
| `3d/glb/<id>.glb` | Android（Scene Viewer）に渡す 3D モデル |
| `3d/usdz/<id>.usdz` | iPhone（AR Quick Look）に渡す 3D モデル（`tools/build_usdz.ps1` が生成） |
| `tools/` | アセット生成・検証スクリプト一式 |

## アーキテクチャ

### エントリポイントと描画（`index.html` / `app.js`）

1. `index.html` は `<main id="app">` だけを持ち、`cards.js` → `ar.js` → `app.js` の順に読み込む。`app.js` が末尾で `main()` を呼ぶ。
2. `app.js` の `main()` は URL の `?c=` を見る。値が `CARDS`（`cards.js` の配列）に含まれていれば `renderDetail()`、それ以外は `renderList()` を呼ぶ。
3. `renderList()` は `CARDS` の各 `<id>` について `images/thumb/<id>.jpg` を使ったカードを描画し、`?c=<id>` へのリンクにする。
4. `renderDetail()` は `images/<id>_front.jpg` を hero 画像として表示し、`arLink()` が返す起動ボタンを配置する。

### AR 起動の分岐（`ar.js` / `arLink()` in `app.js`）

- `platform()` が UA を見て `ios` / `android` / `other` を判定する。iPadOS 13+ は UA 上 Mac を名乗るため、`navigator.platform === 'MacIntel'` かつマルチタッチであれば iOS 扱いにする。
- `arUrl(id)` は iOS なら usdz の絶対 URL、Android なら Scene Viewer の intent URL、それ以外なら `null` を返す。個別ページの `arLink()` もスキャンページもこれを使う。
- iOS の個別ページ: `<a rel="ar" href="<usdz>">` に子要素として `<img>` を 1 つだけ入れる。`rel="ar"` リンクで起動させる場合は、この形（`rel="ar"` ＋ 単一の `<img>` 子要素）でないと AR Quick Look は起動しない。
- Android: `intent://arvr.google.com/scene-viewer/1.0?file=<絶対URLのglb>&mode=ar_only#Intent;...;end;` という Scene Viewer 用 intent URL を組み立てる。`file` パラメータは絶対 URL でなければならない。
- iOS では `rel="ar"` リンクのタップに限らず、`.usdz` の URL へ遷移すれば AR Quick Look が起動する。JS の `location.href` や `setTimeout` 経由の遷移でも、NFC タグに usdz の URL を直接書いた場合でも起動する（2026-10-17 実機確認）。ただし、ページを開いた直後にユーザー操作なしで遷移させるケースと、Android の Scene Viewer で同じことができるかは未検証。
- `other`（PC など）では起動リンクを出さず、AR は iPhone / Android でのみ利用できる旨のメッセージを表示する。

### スキャンページ（`scan.html` / `scan.js`）

カードは AR の**アンカーではなくトリガー**として使う。識別するだけで、追跡はしない。

1. 起動時に `images/thumb/<id>.jpg` から各カードの指紋を計算する。指紋は 12×16 マスのカラー画像で、色チャンネルごとに標準化してから単位ベクトルにしたもの。生成スクリプトや生成ファイルは持たない（カード追加時はサムネイルを作れば自動で対象になる）。
2. 「スキャン開始」のタップで背面カメラを開き、150ms ごとに画面中央のガイド枠の映像を切り出す。手持ちのずれを吸収するため、枠より少し広く切り出し、上下左右にずらした 63 通りの位置のうち最も近いものを採用する。
3. 距離（1 − コサイン類似度）が `MAX_DIST` 未満、かつ 2 位との差が `MIN_MARGIN` を超えたフレームが、同じカードで `STREAK` 回続いたら確定する。
4. 確定したらカメラを止め、「AR モデルを読み込み中…」を出して `location.href = arUrl(id)` で遷移する。iOS ではこれだけで AR Quick Look が開く。
5. AR から戻ったら待機の画面（「カードを読み取る」ボタンのみ）に戻す。検知は、遷移後にページが一度隠れてから再び表示されたこと（`visibilitychange`）、またはキャッシュからの復元（`pageshow` の `persisted`）で行う。iPhone の AR Quick Look では、閉じたときに待機の画面へ戻ることを実機で確認済み（2026-10-18）。判定後の画面にはボタンを置かない。AR が開かなかったときは、ページの再読み込みで最初からやり直す。

画面は「知る人ぞ知る」サイトとして、説明や見出しを置かず、どの状態も 1 行の文言と最大 1 つのボタンだけにしている（`scan.js` の `show()`）。

しきい値は、カード画像に手持ち撮影を模した劣化（ずれ・傾き・明るさ・ボケ・反射など）を加えたオフライン計測で決めた。誤ったカードやカード以外の映像では開かないことを優先している。`?debug` を付けて開くと、最有力候補・距離・差がガイドの下に出る。実機で調整するときに使う。

- `00_andI` は `00_andYou1` と絵柄が同一（上部の文字だけが違う）で、モデルも同じなので、スキャン対象から外している（`scan.js` の `SKIP`）。どちらのカードを映しても `00_andYou1` が開く。

### `<id>` の扱い

- `<id>` は GLB ファイル名から拡張子を除いた完全なステム（例: `01_Mob`, `00_andYou1`）。
- 先頭の数字は表示用の連番に過ぎず一意性を持たない（`00_andI` と `00_andYou1` が両方 `00` で始まる）。**id として数字部分だけを使ってはいけない**。`app.js` の `cardTitle()` は `id.replace(/^\d+_/, '')` で先頭の数字を表示から取り除くだけで、識別には常にフルステムを使う。
- ファイル名は ASCII のみ、大文字小文字を含めて `images/<id>_front.jpg` と `3d/glb/<id>.glb` の間で完全一致させる。GitHub Pages は大文字小文字を区別するため、ここがずれると 404 になる。

## アセットパイプライン（`tools/`）

GitHub Pages はビルドを一切実行しないため、生成物（`cards.js`、`images/thumb/*.jpg`、`3d/usdz/*.usdz`）はすべてリポジトリにコミットする。

| スクリプト | 入力 → 出力 |
|---|---|
| `tools/build_usdz.ps1`（+ `tools/glb2usdz.py`） | `3d/glb/*.glb` → `3d/usdz/*.usdz`（Blender 5.1 が必要） |
| `tools/make_thumbs.ps1` | `images/*_front.jpg` → `images/thumb/*.jpg` |
| `tools/make_cards.ps1` | `3d/glb/*.glb` の一覧 → `cards.js` |
| `tools/verify.ps1` | 上記の不変条件（glb/front 画像/usdz/thumb の id が一致するか、ASCII のみか等）を検査し `ALL OK` を出す |

カードを追加するときは `3d/glb/<id>.glb` と `images/<id>_front.jpg` を同じ `<id>` で置き、上記 4 つを順に実行する。詳細な手順は `README.md` を参照。

## 文字エンコーディング

- `tools/*.ps1` は UTF-8 **BOM 付き**で保存する。
- `index.html` / `scan.html` / `*.js` / `README.md` / `CLAUDE.md` などの Web・ドキュメントファイルは UTF-8 **BOM なし**で保存する。

## 設計ドキュメント

設計の背景・意思決定の理由は以下を参照。

- 設計仕様: `docs/superpowers/specs/2026-08-16-card-triggered-ar-placement-design.md`
- 実装計画: `docs/superpowers/plans/2026-08-16-card-triggered-ar-placement.md`
