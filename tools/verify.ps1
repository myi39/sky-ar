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

Check "3d/glb has $($glb.Count) models (non-empty)" ($glb.Count -gt 0) "found 0 models"
Check "images has $($front.Count) card fronts (matches glb count $($glb.Count))" ($front.Count -eq $glb.Count) "front=$($front.Count) glb=$($glb.Count)"

$ids      = @($glb  | ForEach-Object { $_.BaseName })
$frontIds = @($front | ForEach-Object { $_.BaseName -replace '_front$','' })

$onlyGlb   = @($ids      | Where-Object { $_ -cnotin $frontIds })
$onlyFront = @($frontIds | Where-Object { $_ -cnotin $ids })
Check "glb <-> front image ids match (case sensitive)" (($onlyGlb.Count + $onlyFront.Count) -eq 0) "glb-only: $($onlyGlb -join ','); img-only: $($onlyFront -join ',')"

$bad = @($ids | Where-Object { $_ -match '[^A-Za-z0-9_]' })
Check "ids are ASCII word characters only" ($bad.Count -eq 0) "$($bad -join ',')"

$cardsPath = Join-Path $root "cards.js"
if (Test-Path $cardsPath) {
    $cardsContent = Get-Content -LiteralPath $cardsPath
    $cardIds = @($cardsContent | ForEach-Object {
        if ($_ -match '^\s*"([^"]*)",?\s*$') { $matches[1] }
    })
    $onlyGlbCards = @($ids     | Where-Object { $_ -cnotin $cardIds })
    $onlyCardsGlb = @($cardIds | Where-Object { $_ -cnotin $ids })
    Check "cards.js ids match glb set (case sensitive)" (($onlyGlbCards.Count + $onlyCardsGlb.Count) -eq 0) "glb-only: $($onlyGlbCards -join ','); cards.js-only: $($onlyCardsGlb -join ',')"
} else {
    Check "cards.js exists" $false "cards.js not found at $cardsPath"
}

if (Test-Path "$root\3d\usdz") {
    if ($usdz.Count -gt 0) {
        $usdzIds = @($usdz | ForEach-Object { $_.BaseName })
        $missing = @($ids | Where-Object { $_ -cnotin $usdzIds })
        Check "every glb has a usdz" ($missing.Count -eq 0) "missing: $($missing -join ',')"
    } else {
        Check "3d/usdz is not empty" $false "3d/usdz exists but contains no .usdz files"
    }
} else { "  SKIP usdz checks (3d/usdz does not exist)" }

if (Test-Path "$root\images\thumb") {
    if ($thumb.Count -gt 0) {
        $thumbIds = @($thumb | ForEach-Object { $_.BaseName })
        $missing = @($ids | Where-Object { $_ -cnotin $thumbIds })
        Check "every glb has a thumbnail" ($missing.Count -eq 0) "missing: $($missing -join ',')"
    } else {
        Check "images/thumb is not empty" $false "images/thumb exists but contains no .jpg files"
    }
} else { "  SKIP thumbnail checks (images/thumb does not exist)" }

""
if ($fail -eq 0) { "ALL OK"; exit 0 } else { "$fail CHECK(S) FAILED"; exit 1 }
