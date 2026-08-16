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
