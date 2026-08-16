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
