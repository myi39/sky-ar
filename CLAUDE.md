# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 概要

カードをトリガーに、対応する 3D モデルを OS 標準の AR ビューアで空間に配置する静的サイト。ビルド不要・パッケージマネージャなし・テストスイートなし・外部ライブラリや CDN 読み込みも一切なし。ロジックはすべてプレーンな `index.html` / `app.js` に記述されており、そのままブラウザで動く。

## 動作確認

一覧・個別ページの描画やプラットフォーム判定、リンクの組み立てはローカルの静的サーバーで確認できる。ページ自体は `getUserMedia` を呼ばず、カメラは OS の AR ビューアが扱うため、HTTPS 必須という制約はない。

一方、AR Quick Look（iPhone）・Scene Viewer（Android）が実際に起動して設置まで動くかは実機でしか確認できない。ローカルサーバーを同じネットワーク上の端末から開ければよく、GitHub Pages である必要はない。公開先は GitHub Pages（https://myi39.github.io/sky-ar/）。

## 主要ファイル

| ファイル | 役割 |
|---|---|
| `index.html` | エントリポイント。`?c=<id>` なしで一覧、あり（かつ既知の id）で個別ページを描画する |
| `app.js` | 一覧・個別ページの描画、プラットフォーム判定、AR 起動リンクの組み立てを行う |
| `cards.js` | `tools/make_cards.ps1` が `3d/glb/*.glb` から生成する `<id>` の配列。手で編集しない |
| `images/<id>_front.jpg` | カードの表面画像（個別ページの hero 画像） |
| `images/thumb/<id>.jpg` | 一覧用サムネイル（`tools/make_thumbs.ps1` が生成） |
| `3d/glb/<id>.glb` | Android（Scene Viewer）に渡す 3D モデル |
| `3d/usdz/<id>.usdz` | iPhone（AR Quick Look）に渡す 3D モデル（`tools/build_usdz.ps1` が生成） |
| `tools/` | アセット生成・検証スクリプト一式 |

## アーキテクチャ

### エントリポイントと描画（`index.html` / `app.js`）

1. `index.html` は `<main id="app">` だけを持ち、`cards.js` → `app.js` の順に読み込んで `main()` を呼ぶ。
2. `app.js` の `main()` は URL の `?c=` を見る。値が `CARDS`（`cards.js` の配列）に含まれていれば `renderDetail()`、それ以外は `renderList()` を呼ぶ。
3. `renderList()` は `CARDS` の各 `<id>` について `images/thumb/<id>.jpg` を使ったカードを描画し、`?c=<id>` へのリンクにする。
4. `renderDetail()` は `images/<id>_front.jpg` を hero 画像として表示し、`arLink()` が返す起動ボタンを配置する。

### AR 起動の分岐（`arLink()` in `app.js`）

- `platform()` が UA を見て `ios` / `android` / `other` を判定する。iPadOS 13+ は UA 上 Mac を名乗るため、`navigator.platform === 'MacIntel'` かつマルチタッチであれば iOS 扱いにする。
- iOS: `<a rel="ar" href="./3d/usdz/<id>.usdz">` に子要素として `<img>` を 1 つだけ入れる。AR Quick Look はこの形（`rel="ar"` ＋ 単一の `<img>` 子要素）でないと起動しない。
- Android: `intent://arvr.google.com/scene-viewer/1.0?file=<絶対URLのglb>&mode=ar_only#Intent;...;end;` という Scene Viewer 用 intent URL を組み立てる。`file` パラメータは絶対 URL でなければならない。
- どちらの経路も **ユーザーのタップが必須**。ページを開いた瞬間に自動で AR を起動することはできない。
- `other`（PC など）では起動リンクを出さず、AR は iPhone / Android でのみ利用できる旨のメッセージを表示する。

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
- `index.html` / `app.js` / `cards.js` / `README.md` / `CLAUDE.md` などの Web・ドキュメントファイルは UTF-8 **BOM なし**で保存する。

## 設計ドキュメント

設計の背景・意思決定の理由は以下を参照。

- 設計仕様: `docs/superpowers/specs/2026-08-16-card-triggered-ar-placement-design.md`
- 実装計画: `docs/superpowers/plans/2026-08-16-card-triggered-ar-placement.md`
