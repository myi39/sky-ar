# カードをトリガーにした空間配置型 AR 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** sky-ar を MindAR 画像トラッキング型から、カードをトリガーに OS の AR ビューアへ委譲して 3D を空間配置できる静的サイトへ作り替える。

**Architecture:** URL の `?c=<id>` の有無で一覧と個別画面を分岐させ、個別画面が端末を判定して iOS なら AR Quick Look（`.usdz`）、Android なら Scene Viewer（`.glb`）へリンクする。GLB から USDZ への変換は Blender のバックグラウンドモードで事前に行い、生成物をリポジトリにコミットする。

**Tech Stack:** 素の HTML / CSS / JavaScript（外部ライブラリ・CDN ゼロ）、Blender 5.1 の Python API、PowerShell 5.1、GitHub Pages。

**Spec:** `docs/superpowers/specs/2026-08-16-card-triggered-ar-placement-design.md`

## Global Constraints

- **ビルドステップなし。** GitHub Pages は静的ファイルをそのまま配信するだけなので、生成物（USDZ・サムネイル・`cards.js`）はすべてリポジトリにコミットする。
- **外部ライブラリ・CDN 読み込みは禁止。** MindAR・A-Frame・Three.js への依存を完全に除去する。
- **テストフレームワークは存在しない。** 検証は (a) PowerShell によるファイル不変条件の確認、(b) ブラウザでの表示確認、(c) iPhone / Android 実機での AR 確認、の 3 種類で行う。「失敗するテストを先に書く」は「検証コマンドを先に実行して失敗を確認する」と読み替える。
- **`<id>` は語幹全体**（例 `01_Mob`）。番号は一意ではない（`00_andI` と `00_andYou1` が両方 `00`）ため、番号を ID に使ってはならない。
- **ファイル名は ASCII のみ**、画像とモデルで大文字小文字まで完全一致。GitHub Pages は大小を区別する。
- **`.ps1` は UTF-8 BOM 付きで保存する。** Windows PowerShell 5.1 は BOM なし UTF-8 を CP932 として読むため、日本語を含むと壊れる。日本語を標準出力する `.ps1` は `param` ブロック直後に `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8` を入れる。
- **Python は `encoding="utf-8"` を明示する。** 日本語 Windows の既定は CP932。
- **Blender の実行パス:** `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe`
- **公開 URL:** `https://myi39.github.io/sky-ar/`（main ブランチのルート）
- **モデルの実寸:** 最長辺 0.15m に正規化（カードは概ね 10.3 × 1.0 × 15.0 cm）。
- **USDZ 書き出し設定:** Y-up・メートル・`generate_preview_surface=True`・`export_textures_mode='NEW'`・テクスチャは原寸維持（`usdz_downscale_size='KEEP'`）。

---

## File Structure

| ファイル | 責務 |
|---|---|
| `index.html` | ページの骨格と CSS のみ。ロジックを持たない |
| `app.js` | URL の分岐、一覧の描画、個別画面の描画、端末判定、AR リンク生成 |
| `cards.js` | カード ID の配列だけを持つ生成物。ロジックなし |
| `tools/glb2usdz.py` | GLB 1 体を USDZ 1 体へ変換する。Blender 内で動く |
| `tools/build_usdz.ps1` | `3d/glb/*.glb` を全件ループして `tools/glb2usdz.py` を呼ぶ |
| `tools/make_thumbs.ps1` | `images/*_front.jpg` から `images/thumb/*.jpg` を生成 |
| `tools/make_cards.ps1` | `3d/glb/*.glb` の一覧から `cards.js` を生成 |
| `tools/verify.ps1` | ファイル数・命名・対応関係の不変条件を検査する |
| `README.md` | NFC タグに書く URL の書式と、アセット再生成の手順 |

`app.js` を `index.html` から分けるのは、HTML を「骨格と見た目」、JS を「振る舞い」に閉じ込めるため。`cards.js` を分けるのはデータが生成物であり、カードが増減したときに再生成するだけで済ませるため。

---

## Task 1: ディレクトリ再編と不変条件の検査スクリプト

`3d/*.glb` を `3d/glb/` へ移し、検証スクリプトを用意する。以降のタスクはすべてこの検証スクリプトで足元を確認する。

**Files:**
- Create: `tools/verify.ps1`
- Move: `3d/*.glb` (38 件) → `3d/glb/`
- Delete: `3d/01_Mob.usdz`（検証用の使い捨て）

**Interfaces:**
- Consumes: なし
- Produces: `tools/verify.ps1` — 引数なしで実行し、違反があれば `FAIL` 行を出して終了コード 1、問題なければ `ALL OK` を出して終了コード 0。以降のすべてのタスクがこれを回帰確認に使う。

- [ ] **Step 1: 検証スクリプトを書く**

`tools/verify.ps1` を作成する（UTF-8 BOM 付きで保存すること）:

```powershell
param()
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$root = Split-Path $PSScriptRoot -Parent
$fail = 0

function Check($label, $ok, $detail) {
    if ($ok) { "  OK   $label" }
    else { "  FAIL $label -- $detail"; $script:fail++ }
}

"=== sky-ar verify ==="

$glb   = @(Get-ChildItem "$root\3d\glb"   -Filter *.glb  -ErrorAction SilentlyContinue)
$usdz  = @(Get-ChildItem "$root\3d\usdz"  -Filter *.usdz -ErrorAction SilentlyContinue)
$front = @(Get-ChildItem "$root\images"   -Filter *_front.jpg -ErrorAction SilentlyContinue)
$thumb = @(Get-ChildItem "$root\images\thumb" -Filter *.jpg -ErrorAction SilentlyContinue)

Check "3d/glb has 38 models" ($glb.Count -eq 38) "found $($glb.Count)"
Check "images has 38 card fronts" ($front.Count -eq 38) "found $($front.Count)"

$ids      = @($glb  | ForEach-Object { $_.BaseName })
$frontIds = @($front | ForEach-Object { $_.BaseName -replace '_front$','' })

$onlyGlb   = @($ids      | Where-Object { $_ -cnotin $frontIds })
$onlyFront = @($frontIds | Where-Object { $_ -cnotin $ids })
Check "glb <-> front image ids match (case sensitive)" (($onlyGlb.Count + $onlyFront.Count) -eq 0) "glb-only: $($onlyGlb -join ','); img-only: $($onlyFront -join ',')"

$bad = @($ids | Where-Object { $_ -match '[^A-Za-z0-9_]' })
Check "ids are ASCII word characters only" ($bad.Count -eq 0) "$($bad -join ',')"

if ($usdz.Count -gt 0) {
    $usdzIds = @($usdz | ForEach-Object { $_.BaseName })
    $missing = @($ids | Where-Object { $_ -cnotin $usdzIds })
    Check "every glb has a usdz" ($missing.Count -eq 0) "missing: $($missing -join ',')"
} else { "  SKIP usdz checks (3d/usdz is empty)" }

if ($thumb.Count -gt 0) {
    $thumbIds = @($thumb | ForEach-Object { $_.BaseName })
    $missing = @($ids | Where-Object { $_ -cnotin $thumbIds })
    Check "every glb has a thumbnail" ($missing.Count -eq 0) "missing: $($missing -join ',')"
} else { "  SKIP thumbnail checks (images/thumb is empty)" }

"" 
if ($fail -eq 0) { "ALL OK"; exit 0 } else { "$fail CHECK(S) FAILED"; exit 1 }
```

- [ ] **Step 2: 検証を実行して失敗を確認する**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File tools\verify.ps1`
Expected: `FAIL 3d/glb has 38 models -- found 0` を含み、終了コード 1。ディレクトリがまだ存在しないため。

- [ ] **Step 3: GLB を `3d/glb/` へ移動し、検証用 USDZ を削除する**

```powershell
$repo = "C:\Users\moriz\プロダクト\sky-ar"
New-Item -ItemType Directory -Force -Path "$repo\3d\glb" | Out-Null
Get-ChildItem "$repo\3d" -Filter *.glb | ForEach-Object { Move-Item $_.FullName -Destination "$repo\3d\glb\" }
Remove-Item -LiteralPath "$repo\3d\01_Mob.usdz" -Force
```

- [ ] **Step 4: 検証を実行して通ることを確認する**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File tools\verify.ps1`
Expected: `ALL OK`、終了コード 0。USDZ とサムネイルは `SKIP` になる。

- [ ] **Step 5: コミット**

GLB 38 件（約 80MB）と画像 37 件を新規に追跡するため、このコミットは大きい。push は Task 6 まで行わないので、ここではコミットのみ。

```bash
git add -A tools 3d images
git commit -m "chore: move models into 3d/glb and add asset invariant checks"
```

`git add -A` を使うのは、`3d/01_Mob.usdz` と旧 `3d/3d_andi.glb` の削除を同時に索引へ反映させるため。

---

## Task 2: GLB→USDZ 変換スクリプトを tools/ に定着させる

検証で使ったスクリプトを、構造チェック付きの正式版として `tools/` に置く。

**Files:**
- Create: `tools/glb2usdz.py`

**Interfaces:**
- Consumes: `tools/verify.ps1`（回帰確認用）
- Produces: `tools/glb2usdz.py` — Blender から次の形で呼ぶ。
  `blender -b --factory-startup --python-exit-code 1 --python tools/glb2usdz.py -- <src.glb> <dst.usdz> [target_m]`
  構造が想定外なら終了コード 1 で異常終了し、USDZ を書かない。`target_m` の既定は `0.15`。

- [ ] **Step 1: 変換スクリプトを書く**

`tools/glb2usdz.py` を作成する:

```python
"""Convert one GLB card model to USDZ for iOS AR Quick Look.

Usage:
  blender -b --factory-startup --python-exit-code 1 \
      --python tools/glb2usdz.py -- <src.glb> <dst.usdz> [target_size_m]

Every card in this project is one mesh carrying five materials, stacked
along the thinnest bounding-box axis. Front to back they are:
    star > body > background > side > back
The two frontmost planes are almost entirely transparent, so their
specular lobe shows up as a white haze over the whole card in AR Quick
Look. They get flattened; the three solid layers keep their sheen.

All console output is ASCII so it survives the CP932 console on
Japanese Windows.
"""
import os
import sys
import tempfile

import bpy
import numpy as np
from mathutils import Vector

EXPECTED_MESHES = 1
EXPECTED_MATERIALS = 5
MATTE_LAYER_COUNT = 2


def parse_args():
    argv = sys.argv
    if "--" not in argv:
        raise SystemExit("expected arguments after --")
    argv = argv[argv.index("--") + 1:]
    if len(argv) < 2:
        raise SystemExit("usage: <src.glb> <dst.usdz> [target_size_m]")
    target = float(argv[2]) if len(argv) > 2 else 0.15
    return argv[0], argv[1], target


def sniff_ext(data):
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if data[:3] == b"\xff\xd8\xff":
        return ".jpg"
    return ".png"


def externalize_textures(texdir):
    """Write packed textures to disk under ASCII names.

    In background mode glTF textures stay lazy - has_data is False and
    img.save() writes nothing - and their original names are Japanese.
    Either problem alone makes the USDZ packager drop the texture, which
    renders the model white in AR Quick Look. Pull the packed bytes out
    directly instead.
    """
    os.makedirs(texdir, exist_ok=True)
    for idx, img in enumerate(bpy.data.images):
        packed = img.packed_file
        if packed is None:
            continue
        data = packed.data
        path = os.path.join(texdir, "tex_%02d%s" % (idx, sniff_ext(data)))
        with open(path, "wb") as handle:
            handle.write(data)
        img.unpack(method="REMOVE")
        img.filepath = path
        img.source = "FILE"
        img.reload()


def world_bbox(objects):
    lo = Vector((1e18, 1e18, 1e18))
    hi = Vector((-1e18, -1e18, -1e18))
    for ob in objects:
        for corner in ob.bound_box:
            world = ob.matrix_world @ Vector(corner)
            for i in range(3):
                lo[i] = min(lo[i], world[i])
                hi[i] = max(hi[i], world[i])
    return lo, hi


def check_structure(meshes):
    if len(meshes) != EXPECTED_MESHES:
        raise SystemExit("STRUCTURE: expected %d mesh, found %d"
                         % (EXPECTED_MESHES, len(meshes)))
    slots = [s for s in meshes[0].material_slots if s.material is not None]
    if len(slots) != EXPECTED_MATERIALS:
        raise SystemExit("STRUCTURE: expected %d materials, found %d"
                         % (EXPECTED_MATERIALS, len(slots)))
    return slots


def layers_front_to_back(ob, slots, axis):
    """Order material slots along the stacking axis, front first."""
    ordered = []
    for slot_i, slot in enumerate(slots):
        polys = [p for p in ob.data.polygons if p.material_index == slot_i]
        if not polys:
            raise SystemExit("STRUCTURE: material %s has no faces" % slot.material.name)
        centers = [(ob.matrix_world @ p.center)[axis] for p in polys]
        ordered.append((sum(centers) / len(centers), slot.material))
    ordered.sort(key=lambda item: item[0])
    return [mat for _, mat in ordered]


def set_input(bsdf, name, value):
    sock = bsdf.inputs.get(name)
    if sock is None or sock.is_linked:
        return
    sock.default_value = value


def principled(mat):
    if not mat.node_tree:
        return None
    for node in mat.node_tree.nodes:
        if node.type == "BSDF_PRINCIPLED":
            return node
    return None


def tune_materials(front_to_back):
    """Drop emission everywhere; flatten the transparent front planes.

    UsdPreviewSurface attenuates only the diffuse lobe by opacity - the
    emissive and specular components stay at full weight - so a plane
    whose alpha is zero is still visible. Note that the `specular` input
    Blender writes is not part of UsdPreviewSurface and is ignored; the
    dielectric specular is derived from `ior`.
    """
    print("--- materials (front to back) ---")
    for index, mat in enumerate(front_to_back):
        bsdf = principled(mat)
        if bsdf is None:
            raise SystemExit("STRUCTURE: %s has no principled bsdf" % mat.name)
        set_input(bsdf, "Emission Strength", 0.0)
        set_input(bsdf, "Emission Color", (0.0, 0.0, 0.0, 1.0))
        set_input(bsdf, "Metallic", 0.0)
        matte = index < MATTE_LAYER_COUNT
        if matte:
            set_input(bsdf, "IOR", 1.0)
            set_input(bsdf, "Roughness", 1.0)
        print("  %d %-12s %s" % (index, mat.name[:12], "MATTE" if matte else "glossy"))


def export_kwargs(dst):
    names = set(bpy.ops.wm.usd_export.get_rna_type().properties.keys())
    kwargs = {"filepath": dst}
    wanted = {
        "selected_objects_only": False,
        "export_animation": False,
        "export_materials": True,
        "generate_preview_surface": True,
        "relative_paths": False,
        "convert_world_material": False,
    }
    for key, value in wanted.items():
        if key in names:
            kwargs[key] = value
    if "export_textures_mode" in names:
        kwargs["export_textures_mode"] = "NEW"
    if "usdz_downscale_size" in names:
        kwargs["usdz_downscale_size"] = "KEEP"
    # AR Quick Look expects Y-up in meters; Blender authors Z-up.
    if "convert_orientation" in names:
        kwargs["convert_orientation"] = True
        kwargs["export_global_up_selection"] = "Y"
        kwargs["export_global_forward_selection"] = "NEGATIVE_Z"
    if "convert_scene_units" in names:
        kwargs["convert_scene_units"] = "METERS"
    return kwargs


def main():
    src, dst, target = parse_args()
    print("SRC %s" % src)
    print("DST %s" % dst)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)

    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    slots = check_structure(meshes)
    ob = meshes[0]

    lo, hi = world_bbox(meshes)
    dims = hi - lo
    axis = int(np.argmin([dims.x, dims.y, dims.z]))

    longest = max(dims.x, dims.y, dims.z)
    scale = (target / longest) if longest > 0 else 1.0
    for obj in bpy.context.scene.objects:
        if obj.parent is None:
            obj.scale = obj.scale * scale
            obj.location = obj.location * scale
    bpy.context.view_layer.update()

    lo, hi = world_bbox(meshes)
    dims = hi - lo
    print("size %.4f x %.4f x %.4f m (stacking axis %s)"
          % (dims.x, dims.y, dims.z, "XYZ"[axis]))

    externalize_textures(os.path.join(tempfile.gettempdir(), "sky_ar_tex"))
    tune_materials(layers_front_to_back(ob, slots, axis))

    os.makedirs(os.path.dirname(dst), exist_ok=True)
    result = bpy.ops.wm.usd_export(**export_kwargs(dst))
    print("export %s" % (result,))


main()
```

- [ ] **Step 2: 想定外の構造を弾くことを確認する**

構造チェックが実際に働くかを、マテリアルが 5 枚ない適当な GLB がない環境でも確かめられるよう、`EXPECTED_MATERIALS` を一時的に `4` に書き換えて実行する。

Run:
```powershell
& "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b --factory-startup --python-exit-code 1 --python tools\glb2usdz.py -- 3d\glb\01_Mob.glb "$env:TEMP\guard_test.usdz" 0.15
```
Expected: `STRUCTURE: expected 4 materials, found 5` を出力し、終了コード 1。`$env:TEMP\guard_test.usdz` は作られない。

確認したら `EXPECTED_MATERIALS` を `5` に戻す。

- [ ] **Step 3: 1 体を変換して成功することを確認する**

Run:
```powershell
& "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b --factory-startup --python-exit-code 1 --python tools\glb2usdz.py -- 3d\glb\01_Mob.glb "$env:TEMP\01_Mob.usdz" 0.15
```
Expected: 出力に以下が含まれ、終了コード 0。
```
size 0.1029 x 0.0100 x 0.1500 m (stacking axis Y)
--- materials (front to back) ---
  0 星            MATTE
  1 本体           MATTE
  2 マテリアル        glossy
  3 側面           glossy
  4 裏            glossy
```

- [ ] **Step 4: 生成された USDZ にテクスチャが同梱されていることを確認する**

Run:
```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead("$env:TEMP\01_Mob.usdz")
$zip.Entries | ForEach-Object { $_.FullName }
$zip.Dispose()
```
Expected: `01_Mob.usdc` に加えて `0/tex_00.png` 〜 `0/tex_03.png` の 4 枚が並ぶ。合計 5 エントリ。テクスチャが 0 枚なら AR Quick Look で真っ白になるため、ここで止めて原因を調べること。

- [ ] **Step 5: コミット**

```bash
git add tools/glb2usdz.py
git commit -m "feat: add Blender GLB to USDZ converter with structure guard"
```

---

## Task 3: 38 体の一括変換

**Files:**
- Create: `tools/build_usdz.ps1`
- Generate: `3d/usdz/*.usdz`（38 件）

**Interfaces:**
- Consumes: `tools/glb2usdz.py`
- Produces: `3d/usdz/<id>.usdz` — `<id>` は `3d/glb/<id>.glb` と完全一致する。

- [ ] **Step 1: 一括変換スクリプトを書く**

`tools/build_usdz.ps1` を作成する（UTF-8 BOM 付きで保存すること）:

```powershell
param(
    [string]$Blender = "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe",
    [double]$TargetSize = 0.15
)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$root   = Split-Path $PSScriptRoot -Parent
$srcDir = Join-Path $root "3d\glb"
$outDir = Join-Path $root "3d\usdz"
$script = Join-Path $PSScriptRoot "glb2usdz.py"

if (-not (Test-Path $Blender)) { throw "Blender not found: $Blender" }
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$models = @(Get-ChildItem $srcDir -Filter *.glb | Sort-Object Name)
"converting $($models.Count) models"

$failed = @()
$i = 0
foreach ($model in $models) {
    $i++
    $dst = Join-Path $outDir ($model.BaseName + ".usdz")
    & $Blender -b --factory-startup --python-exit-code 1 --python $script -- $model.FullName $dst $TargetSize > $null 2>&1
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $dst)) {
        $failed += $model.BaseName
        "[{0,2}/{1}] FAIL {2}" -f $i, $models.Count, $model.BaseName
    } else {
        "[{0,2}/{1}] ok   {2}  ({3:N0} KB)" -f $i, $models.Count, $model.BaseName, ((Get-Item $dst).Length / 1KB)
    }
}

""
if ($failed.Count -gt 0) { "FAILED: $($failed -join ', ')"; exit 1 }
"converted $($models.Count) models"
exit 0
```

- [ ] **Step 2: 検証を実行して USDZ が足りないことを確認する**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File tools\verify.ps1`
Expected: `SKIP usdz checks (3d/usdz is empty)` が出る。

- [ ] **Step 3: 一括変換を実行する**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File tools\build_usdz.ps1`
Expected: 38 行すべてが `ok` で、最後に `converted 38 models`、終了コード 0。所要 1 分未満。`FAIL` が出た場合は該当モデルを Task 2 Step 3 の手順で個別に実行してエラーを読むこと。

- [ ] **Step 4: 検証を実行して通ることを確認する**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File tools\verify.ps1`
Expected: `OK every glb has a usdz` を含み `ALL OK`。

- [ ] **Step 5: コミット**

USDZ 38 件で約 80MB になるため、この 1 コミットは大きい。push に数分かかることがある。

```bash
git add tools/build_usdz.ps1 3d/usdz
git commit -m "feat: convert all 38 card models to USDZ"
```

---

## Task 4: サムネイルとカードデータの生成

**Files:**
- Create: `tools/make_thumbs.ps1`
- Create: `tools/make_cards.ps1`
- Generate: `images/thumb/*.jpg`（38 件）, `cards.js`

**Interfaces:**
- Consumes: `3d/glb/*.glb` のファイル名
- Produces: `cards.js` — グローバルに `const CARDS = ["00_andI", ...]` を定義する。ID の昇順。`app.js` がこれを読む。

- [ ] **Step 1: サムネイル生成スクリプトを書く**

`tools/make_thumbs.ps1` を作成する（UTF-8 BOM 付きで保存すること）:

```powershell
param([int]$Width = 320, [int]$Quality = 80)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Drawing

$root   = Split-Path $PSScriptRoot -Parent
$srcDir = Join-Path $root "images"
$outDir = Join-Path $srcDir "thumb"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
         Where-Object { $_.MimeType -eq "image/jpeg" }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
    [System.Drawing.Imaging.Encoder]::Quality, [long]$Quality)

$files = @(Get-ChildItem $srcDir -Filter *_front.jpg | Sort-Object Name)
foreach ($file in $files) {
    $id  = $file.BaseName -replace '_front$', ''
    $dst = Join-Path $outDir ($id + ".jpg")
    $src = [System.Drawing.Image]::FromFile($file.FullName)
    try {
        $h = [int][Math]::Round($src.Height * ($Width / $src.Width))
        $bmp = New-Object System.Drawing.Bitmap $Width, $h
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.DrawImage($src, 0, 0, $Width, $h)
        $g.Dispose()
        $bmp.Save($dst, $codec, $params)
        $bmp.Dispose()
    } finally { $src.Dispose() }
}

$made = @(Get-ChildItem $outDir -Filter *.jpg)
$size = ($made | Measure-Object Length -Sum).Sum / 1KB
"{0} thumbnails, {1:N0} KB total" -f $made.Count, $size
```

- [ ] **Step 2: カードデータ生成スクリプトを書く**

`tools/make_cards.ps1` を作成する（UTF-8 BOM 付きで保存すること）:

```powershell
param()
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$root = Split-Path $PSScriptRoot -Parent
$ids  = @(Get-ChildItem (Join-Path $root "3d\glb") -Filter *.glb |
          Sort-Object Name | ForEach-Object { $_.BaseName })

$lines = @()
$lines += "// Generated by tools/make_cards.ps1 - do not edit by hand."
$lines += "const CARDS = ["
foreach ($id in $ids) { $lines += ('  "' + $id + '",') }
$lines += "];"

$out = Join-Path $root "cards.js"
[System.IO.File]::WriteAllLines($out, $lines, (New-Object System.Text.UTF8Encoding $false))
"wrote $out with $($ids.Count) ids"
```

- [ ] **Step 3: 検証を実行してサムネイルが無いことを確認する**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File tools\verify.ps1`
Expected: `SKIP thumbnail checks (images/thumb is empty)` が出る。

- [ ] **Step 4: 両方を実行する**

Run:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\make_thumbs.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools\make_cards.ps1
```
Expected: `38 thumbnails, ... KB total`（合計 1500KB 未満）と `wrote ...\cards.js with 38 ids`。

- [ ] **Step 5: 生成物を目視で確認する**

Run: `Get-Content cards.js -TotalCount 4`
Expected:
```
// Generated by tools/make_cards.ps1 - do not edit by hand.
const CARDS = [
  "00_andI",
  "00_andYou1",
```

- [ ] **Step 6: 検証を実行して通ることを確認する**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File tools\verify.ps1`
Expected: `OK every glb has a thumbnail` を含み `ALL OK`。

- [ ] **Step 7: コミット**

```bash
git add tools/make_thumbs.ps1 tools/make_cards.ps1 images/thumb cards.js
git commit -m "feat: generate list thumbnails and card id data"
```

---

## Task 5: 一覧画面

`index.html` と `app.js` を新規に作り、一覧を表示できるところまで作る。個別画面は Task 6 で足す。

**Files:**
- Create: `index.html`（現行の MindAR 版を全面置き換え）
- Create: `app.js`

**Interfaces:**
- Consumes: `cards.js` の `CARDS`、`images/thumb/<id>.jpg`
- Produces: `app.js` に `renderList()` と `cardTitle(id)` を定義する。`cardTitle(id)` は `"01_Mob"` から表示名 `"Mob"` を返す（先頭の数字とアンダースコアを除去）。Task 6 の個別画面もこの関数を使う。

- [ ] **Step 1: `index.html` を書く**

現行の `index.html` を次の内容で完全に置き換える:

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>sky-ar</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #14161a;
      --panel: #1e2126;
      --line: #2c3038;
      --text: #e8eaed;
      --muted: #8b939e;
      --accent: #4a9eff;
    }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", sans-serif;
      line-height: 1.6;
      padding: 1.5rem 1rem calc(3rem + env(safe-area-inset-bottom));
    }
    main { max-width: 44rem; margin: 0 auto; }
    header { margin-bottom: 1.5rem; }
    h1 { font-size: 1.125rem; letter-spacing: .04em; }
    .lead { color: var(--muted); font-size: .8125rem; margin-top: .125rem; }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr));
      gap: .75rem;
    }
    .card {
      display: block;
      text-decoration: none;
      color: inherit;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 10px;
      overflow: hidden;
    }
    .card img { display: block; width: 100%; height: auto; }
    .card span {
      display: block;
      padding: .4rem .5rem .5rem;
      font-size: .6875rem;
      color: var(--muted);
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .detail { text-align: center; }
    .detail img.hero {
      display: block;
      width: 100%;
      max-width: 20rem;
      margin: 0 auto 1.25rem;
      border-radius: 12px;
      border: 1px solid var(--line);
    }
    .launch {
      display: inline-block;
      padding: .875rem 2rem;
      background: var(--accent);
      color: #fff;
      font-weight: 600;
      text-decoration: none;
      border-radius: 999px;
    }
    .launch img { display: none; }
    .note {
      margin-top: 1.25rem;
      color: var(--muted);
      font-size: .8125rem;
    }
    .back {
      display: inline-block;
      margin-top: 2rem;
      color: var(--muted);
      font-size: .8125rem;
    }
  </style>
</head>
<body>
  <main id="app"></main>
  <script src="./cards.js"></script>
  <script src="./app.js"></script>
</body>
</html>
```

- [ ] **Step 2: `app.js` を一覧まで書く**

```javascript
'use strict';

// "01_Mob" -> "Mob". The numeric prefix is not unique (00_andI and
// 00_andYou1 both start with 00), so it is display-only; the full stem
// stays the identifier everywhere else.
function cardTitle(id) {
  return id.replace(/^\d+_/, '');
}

function el(tag, props, children) {
  const node = document.createElement(tag);
  Object.assign(node, props || {});
  (children || []).forEach(function (child) { node.appendChild(child); });
  return node;
}

function renderList(root) {
  const header = el('header', {}, [
    el('h1', { textContent: 'sky-ar' }),
    el('p', { className: 'lead', textContent: 'カードを選ぶと AR で表示できます' })
  ]);

  const grid = el('div', { className: 'grid' }, CARDS.map(function (id) {
    return el('a', { className: 'card', href: '?c=' + encodeURIComponent(id) }, [
      el('img', { src: './images/thumb/' + id + '.jpg', alt: cardTitle(id), loading: 'lazy' }),
      el('span', { textContent: cardTitle(id) })
    ]);
  }));

  root.appendChild(header);
  root.appendChild(grid);
}

function main() {
  const root = document.getElementById('app');
  renderList(root);
}

main();
```

- [ ] **Step 3: ブラウザで一覧を確認する**

Run: `Start-Process "C:\Users\moriz\プロダクト\sky-ar\index.html"`
Expected: 38 枚のサムネイルがグリッドに並び、各カードの下に `andI` `andYou1` `Mob` … と表示される。画像が壊れている（アイコン表示）場合は `images/thumb/` の生成に失敗している。

- [ ] **Step 4: リンク先が正しいことを確認する**

一覧のいずれかのカードをクリックする。
Expected: URL が `...?c=01_Mob` のように変わる。個別画面はまだ無いので、表示内容は一覧のままでよい（Task 6 で分岐を足す）。

- [ ] **Step 5: コミット**

```bash
git add index.html app.js
git commit -m "feat: replace MindAR page with a static card list"
```

---

## Task 6: 個別画面と AR 起動

**Files:**
- Modify: `app.js`（`main()` に分岐を足し、`renderDetail()` と `platform()` を追加）

**Interfaces:**
- Consumes: `cardTitle(id)`, `el(...)`（Task 5 で定義済み）
- Produces: なし（最終タスク）

- [ ] **Step 1: 端末判定と個別画面を書く**

`app.js` の `main()` を次の内容に置き換え、その手前に関数を追加する:

```javascript
function platform() {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as a Mac, so check for touch as well.
  if (/iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/Android/.test(ua)) return 'android';
  return 'other';
}

function arLink(id) {
  const os = platform();

  if (os === 'ios') {
    // AR Quick Look requires the anchor to carry rel="ar" and to contain
    // exactly one child element, which must be an <img>.
    return el('a', { className: 'launch', rel: 'ar', href: './3d/usdz/' + id + '.usdz' }, [
      el('img', { src: './images/thumb/' + id + '.jpg', alt: '' }),
      document.createTextNode('AR で表示')
    ]);
  }

  if (os === 'android') {
    // Scene Viewer needs an absolute URL for the model.
    const model = new URL('./3d/glb/' + id + '.glb', location.href).href;
    const fallback = encodeURIComponent(location.href);
    const intent =
      'intent://arvr.google.com/scene-viewer/1.0' +
      '?file=' + encodeURIComponent(model) +
      '&mode=ar_only' +
      '#Intent;scheme=https;package=com.google.ar.core;' +
      'action=android.intent.action.VIEW;' +
      'S.browser_fallback_url=' + fallback + ';end;';
    return el('a', { className: 'launch', href: intent, textContent: 'AR で表示' });
  }

  return null;
}

function renderDetail(root, id) {
  const parts = [
    el('img', { className: 'hero', src: './images/' + id + '_front.jpg', alt: cardTitle(id) })
  ];

  const link = arLink(id);
  if (link) {
    parts.push(link);
    parts.push(el('p', {
      className: 'note',
      textContent: 'ボタンを押すと AR ビューアが開きます。床や机に向けると設置できます。'
    }));
  } else {
    parts.push(el('p', {
      className: 'note',
      textContent: 'AR 表示は iPhone / Android でのみ利用できます。'
    }));
  }

  parts.push(el('a', { className: 'back', href: './', textContent: '← 一覧にもどる' }));

  root.appendChild(el('header', {}, [
    el('h1', { textContent: cardTitle(id) }),
    el('p', { className: 'lead', textContent: 'sky-ar' })
  ]));
  root.appendChild(el('div', { className: 'detail' }, parts));
}

function main() {
  const root = document.getElementById('app');
  const id = new URLSearchParams(location.search).get('c');

  if (id && CARDS.indexOf(id) !== -1) {
    renderDetail(root, id);
  } else {
    renderList(root);
  }
}

main();
```

- [ ] **Step 2: PC のブラウザで分岐を確認する**

Run: `Start-Process "C:\Users\moriz\プロダクト\sky-ar\index.html?c=01_Mob"`
Expected: 一覧ではなくカード画像 1 枚と「AR 表示は iPhone / Android でのみ利用できます。」が表示される（PC は `other` 判定のため）。「← 一覧にもどる」で一覧に戻れる。

- [ ] **Step 3: 存在しない ID を弾くことを確認する**

ブラウザのアドレスバーで `index.html?c=nonexistent` を開く。
Expected: 個別画面ではなく一覧が表示される（`CARDS.indexOf` で弾かれるため）。

- [ ] **Step 4: コミット**

```bash
git add app.js
git commit -m "feat: add per-card view that launches the OS AR viewer"
```

- [ ] **Step 5: push して実機で確認する**

```bash
git push origin main
```

GitHub Pages の反映を 1 分ほど待ってから、**iPhone の Safari** で以下を開く:

1. `https://myi39.github.io/sky-ar/` — 38 枚の一覧が出ること
2. いずれかをタップ — 個別画面に「AR で表示」ボタンが出ること
3. ボタンをタップ — AR Quick Look が開くこと。テクスチャが出ていること、レイヤーの前後関係が正しいこと
4. 「AR」に切り替えて床に置く — カードが約 15cm の高さで立つこと。**カードを画面から外してもモデルが消えないこと**（これが今回の再設計の目的そのもの）

Android 端末があれば `https://myi39.github.io/sky-ar/?c=01_Mob` を Chrome で開き、Scene Viewer が起動することを確認する。

**うまくいかないときの切り分け:**

| 症状 | 原因と対処 |
|---|---|
| iOS でボタンを押しても何も起きない | `.launch img { display: none; }` が原因の可能性がある。AR Quick Look は `rel="ar"` のアンカーに `<img>` が 1 つあることを要求する。CSS の `display: none` を外して画像を見せる形に変え、再確認する |
| iOS でモデルが真っ白 | USDZ にテクスチャが入っていない。Task 2 Step 4 の ZIP 検査を該当 ID で実行する |
| iOS でモデルが寝ている | Y-up 変換が効いていない。`tools/glb2usdz.py` の `export_kwargs` で `convert_orientation` が渡っているか確認する |
| Android で何も起きない | `file=` に絶対 URL が渡っているか確認する。相対 URL では Scene Viewer が起動しない |
| 一覧は出るが画像が壊れる | `images/thumb/` が未生成か、大文字小文字が一致していない。`tools\verify.ps1` を実行する |

---

## Task 7: 旧ファイルの撤去と README

**Files:**
- Delete: `measure.html`, `spike.html`
- Delete（git 追跡のみ残っているもの）: `3d/3d_andi.glb`, `images/image_andi.jpg`, `images/image_andi.mind`, `images/01_Mob_front.jpg` の重複追跡なし確認
- Create: `README.md`
- Add: `CLAUDE.md`（未追跡のまま残っているため）

**Interfaces:**
- Consumes: なし
- Produces: なし

- [ ] **Step 1: 旧ファイルを消す**

```powershell
$repo = "C:\Users\moriz\プロダクト\sky-ar"
Remove-Item -LiteralPath "$repo\measure.html" -Force
Remove-Item -LiteralPath "$repo\spike.html" -Force
```

`3d/3d_andi.glb`・`images/image_andi.jpg`・`images/image_andi.mind` は作業ツリーには既に存在せず git の索引にだけ残っているため、次のコミットで削除が反映される。

- [ ] **Step 2: `README.md` を書く**

```markdown
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
```

- [ ] **Step 3: 検証を実行して通ることを確認する**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File tools\verify.ps1`
Expected: `ALL OK`。

- [ ] **Step 4: 外部依存が残っていないことを確認する**

Run: `Select-String -Path index.html,app.js -Pattern "cdn|aframe|mindar|three" -SimpleMatch`
Expected: 出力なし。MindAR・A-Frame・Three.js への参照が完全に消えていること。

- [ ] **Step 5: コミットして push**

```bash
git add -A
git commit -m "chore: remove MindAR era files and document the new setup"
git push origin main
```

- [ ] **Step 6: 公開サイトで最終確認する**

`https://myi39.github.io/sky-ar/` を iPhone で開き、一覧 → 個別 → AR 起動 → 床に設置、まで通しで動くことを確認する。
