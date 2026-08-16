# sky-ar

カードをトリガーに、対応する 3D モデルを AR で空間に配置する静的サイト。

公開先: https://myi39.github.io/sky-ar/

## 使い方

一覧からカードを選ぶか、`?c=<id>` を直接開く。

```
https://myi39.github.io/sky-ar/?c=01_Mob
```

iPhone は AR Quick Look、Android は Scene Viewer が開く。AR の起動には
ユーザーのタップが必要で、ページを開いた瞬間に自動起動することはできない。

## NFC タグ

タグに上記の URL を 1 本書くだけでよい。iPhone・Android とも OS がタグを
読んで URL を開くため、こちら側に NFC 用のコードは不要。書き込みは NFC Tools
などの市販アプリで行う。

## アセットの再生成

Blender 5.1 が必要（`C:\Program Files\Blender Foundation\Blender 5.1\blender.exe`）。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\build_usdz.ps1   # 3d/glb -> 3d/usdz
powershell -NoProfile -ExecutionPolicy Bypass -File tools\make_thumbs.ps1  # images -> images/thumb
powershell -NoProfile -ExecutionPolicy Bypass -File tools\make_cards.ps1   # -> cards.js
powershell -NoProfile -ExecutionPolicy Bypass -File tools\verify.ps1       # 不変条件の検査
```

カードを追加するときは `3d/glb/<id>.glb` と `images/<id>_front.jpg` を同じ
`<id>` で置き、上の 4 つを順に実行する。`<id>` は ASCII のみ、大文字小文字を
含めて完全一致させること（GitHub Pages は大小を区別する）。

## 設計

- 設計仕様: `docs/superpowers/specs/2026-08-16-card-triggered-ar-placement-design.md`
- 実装計画: `docs/superpowers/plans/2026-08-16-card-triggered-ar-placement.md`
