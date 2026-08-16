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
