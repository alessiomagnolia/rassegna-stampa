# Controllo desktop - server locale.
#   -Label prima : serve la versione dell'ultimo commit (quella online), estratta da git
#   -Label dopo  : serve i file attuali della cartella public/
# Aprire http://localhost:<Porta>/__check/start nel browser a larghezza desktop (1366x900):
# le pagine si susseguono da sole e i rilievi vengono salvati in %TEMP%\rassegna-desktop-check\<Label>\.
# Le API sono finte e sempre uguali, così le differenze dipendono solo da HTML/CSS/JS.
param(
    [ValidateSet('prima', 'dopo')][string]$Label = 'dopo',
    [int]$Port = 0,
    [int]$Minutes = 60
)

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
# Cartella di lavoro temporanea, fuori dal progetto (e quindi fuori da OneDrive/git)
$work = Join-Path ([IO.Path]::GetTempPath()) 'rassegna-desktop-check'
$outDir = Join-Path $work $Label
if ($Port -eq 0) { $Port = if ($Label -eq 'prima') { 8781 } else { 8782 } }

if ($Label -eq 'prima') {
    $root = Join-Path $work 'prima-public'
    $git = (Get-Command git -ErrorAction SilentlyContinue).Source
    if (-not $git) { $git = Get-ChildItem "$env:LOCALAPPDATA\GitHubDesktop" -Recurse -Filter git.exe -ErrorAction SilentlyContinue | Where-Object { $_.FullName -like '*\cmd\git.exe' } | Select-Object -Last 1 -ExpandProperty FullName }
    if (Test-Path $root) { Remove-Item $root -Recurse -Force }
    New-Item -ItemType Directory -Force $root | Out-Null
    $zip = Join-Path $work 'prima.zip'
    & $git -C $repo archive --format=zip -o $zip HEAD public
    Expand-Archive $zip -DestinationPath $root -Force
    Remove-Item $zip -ErrorAction SilentlyContinue
    $root = Join-Path $root 'public'
} else {
    $root = Join-Path $repo 'public'
}

if (Test-Path $outDir) { Remove-Item $outDir -Recurse -Force }
New-Item -ItemType Directory -Force $outDir | Out-Null

$utf8 = New-Object System.Text.UTF8Encoding($false)
$types = @{ '.html'='text/html; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.js'='application/javascript; charset=utf-8';
            '.json'='application/json'; '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.svg'='image/svg+xml';
            '.ico'='image/x-icon'; '.webp'='image/webp'; '.woff2'='font/woff2'; '.ttf'='font/ttf' }
$routes = @{ '/'='index.html'; '/login'='index.html'; '/locandine'='locandine.html'; '/linkedin'='linkedin.html'; '/save-the-date'='save-the-date.html' }

# Stato iniziale identico per entrambe le versioni: utente finto, tema chiaro, consenso cookie dato
$headInject = '<script>try{localStorage.clear();sessionStorage.clear();if(!/(^\/$|index\.html$)/.test(location.pathname))localStorage.setItem("rs_token","check");localStorage.setItem("rs_theme","light");localStorage.setItem("rs_cookie_consent","essential");localStorage.setItem("rs_cookie_consent_date","2026-01-01T00:00:00Z");localStorage.setItem("rs_editor_state",JSON.stringify({articles:[],options:{}}));}catch(e){}</script><style>*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}</style>'
$profile = '{"user":{"id":1,"email":"check@example.com","company_name":"Controllo Desktop","logo_path":"","logo_data":""}}'

$l = New-Object System.Net.HttpListener; $l.Prefixes.Add("http://localhost:$Port/"); $l.Start()
Write-Output "Versione '$Label' su http://localhost:$Port/__check/start  (rilievi in $outDir)"
$end = (Get-Date).AddMinutes($Minutes)
while ((Get-Date) -lt $end) {
    $ctx = $l.GetContext(); $req = $ctx.Request; $res = $ctx.Response
    try {
        $p = [Uri]::UnescapeDataString($req.Url.AbsolutePath)
        $bytes = $null; $type = 'application/json'
        if ($p -eq '/__check/start') {
            $res.Redirect('/index.html?__check=0'); $res.Close(); continue
        } elseif ($p -eq '/__check/snapshot.js' -or $p -eq '/__check/mobile-audit.js') {
            $bytes = [IO.File]::ReadAllBytes((Join-Path $PSScriptRoot ($p -replace '^/__check/', ''))); $type = $types['.js']
        } elseif ($p -eq '/__check/save' -and $req.HttpMethod -eq 'POST') {
            $name = ($req.QueryString['page'] -replace '[^a-z0-9\-]', '')
            $reader = New-Object IO.StreamReader($req.InputStream, $utf8); $body = $reader.ReadToEnd()
            [IO.File]::WriteAllText((Join-Path $outDir "$name.json"), $body, $utf8)
            $bytes = $utf8.GetBytes('{"ok":true}')
        } elseif ($p.StartsWith('/api/')) {
            if ($p -eq '/api/auth/profile') { $body = $profile }
            elseif ($p -eq '/api/teams/mine') { $body = '{"team":null}' }
            elseif ($req.HttpMethod -eq 'GET') { $body = '[]' }
            else { $body = '{}' }
            $bytes = $utf8.GetBytes($body)
        } else {
            if ($routes.ContainsKey($p)) { $p = '/' + $routes[$p] }
            $f = [IO.Path]::GetFullPath((Join-Path $root $p.TrimStart('/')))
            if ($f.StartsWith($root) -and (Test-Path $f -PathType Leaf)) {
                $ext = [IO.Path]::GetExtension($f).ToLower(); $type = $types[$ext]; if (-not $type) { $type = 'application/octet-stream' }
                if ($ext -eq '.html') {
                    $html = [IO.File]::ReadAllText($f, $utf8)
                    $html = $html -replace '(?i)<head>', ('<head>' + $headInject)
                    $html = $html -replace '(?i)</body>', '<script src="/__check/snapshot.js"></script></body>'
                    $bytes = $utf8.GetBytes($html)
                } else { $bytes = [IO.File]::ReadAllBytes($f) }
            }
        }
        if ($bytes -eq $null) { $res.StatusCode = 404; $bytes = $utf8.GetBytes('Not found'); $type = 'text/plain' }
        $res.ContentType = $type; $res.Headers.Add('Cache-Control', 'no-store')
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch { $res.StatusCode = 500 } finally { try { $res.Close() } catch {} }
}
