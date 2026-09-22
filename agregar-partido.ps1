# agregar-partido.ps1
# Ubica el .json y el timeline de un partido, regenera data/manifest.json y hace commit + push.
# Uso: arrastrá el partido_NN_AAAA-MM-DD.json y/o el AAAAMMDD_timeline.html sobre "Agregar-partido.bat".
# Sin archivos: solo regenera el manifest y publica lo que haya en data/ y timelines/.
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Files)

$ErrorActionPreference = 'Stop'
$repo = $PSScriptRoot
$data = Join-Path $repo 'data'
$tls  = Join-Path $repo 'timelines'
New-Item -ItemType Directory -Force -Path $data, $tls | Out-Null

# 1) ubicar los archivos que se arrastraron
foreach ($f in $Files) {
  if (-not (Test-Path -LiteralPath $f)) { continue }
  $name = Split-Path -LiteralPath $f -Leaf
  if ($name -match '^partido_\d+_\d{4}-\d{2}-\d{2}\.json$') {
    Copy-Item -LiteralPath $f -Destination (Join-Path $data $name) -Force
    Write-Host "  -> data/$name"
  } elseif ($name -match '_timeline\.html$') {
    Copy-Item -LiteralPath $f -Destination (Join-Path $tls $name) -Force
    Write-Host "  -> timelines/$name"
  } elseif ($name -match '\.json$') {
    Copy-Item -LiteralPath $f -Destination (Join-Path $data $name) -Force
    Write-Host "  -> data/$name  (nombre no estandar, lo copie igual)"
  } else {
    Write-Host "  . ignorado (no es partido .json ni _timeline.html): $name"
  }
}

# 2) regenerar manifest.json (escanea data/ y timelines/)
$parts = @(Get-ChildItem -LiteralPath $data -Filter 'partido_*.json' |
  Where-Object { $_.Name -match '^partido_\d+_\d{4}-\d{2}-\d{2}\.json$' } |
  Sort-Object Name | ForEach-Object { $_.Name })

$tlByDate = @{}
Get-ChildItem -LiteralPath $tls -Filter '*_timeline.html' -ErrorAction SilentlyContinue | ForEach-Object {
  if ($_.Name -match '^(\d{4})(\d{2})(\d{2})_timeline\.html$') {
    $tlByDate["$($matches[1])-$($matches[2])-$($matches[3])"] = $_.Name
  }
}

$timelines = [ordered]@{}
foreach ($p in $parts) {
  if ($p -match '^partido_(\d+)_(\d{4}-\d{2}-\d{2})\.json$') {
    $id = [string][int]$matches[1]
    $fecha = $matches[2]
    if ($tlByDate.ContainsKey($fecha)) { $timelines[$id] = $tlByDate[$fecha] }
  }
}

$manifest = [ordered]@{
  jugadores = 'jugadores.json'
  partidos  = $parts
  timelines = $timelines
}
$json = $manifest | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText((Join-Path $data 'manifest.json'), $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "manifest.json: $($parts.Count) partidos, $($timelines.Count) timelines"

# 3) git commit + push
Push-Location $repo
try {
  git add -A | Out-Null
  $changed = git status --porcelain
  if ([string]::IsNullOrWhiteSpace($changed)) {
    Write-Host "No hay cambios para publicar."
  } else {
    git commit -m "Actualizar partidos/timelines/manifest (script)" | Out-Null
    git push
    Write-Host "OK - commit y push hechos. GitHub Pages se actualiza en ~1-2 min."
  }
} finally {
  Pop-Location
}
