# =====================================================
# Arquivo: scripts/reset-db.ps1
# Descricao: Apaga o banco por completo (DROP DATABASE), recria
#            do zero (create.sql) e popula com insert_tupa.sql.
# Uso:       npm run db:reset
#            (ou)  pwsh ./scripts/reset-db.ps1
# =====================================================

$ErrorActionPreference = "Stop"

# Raiz do projeto (pasta pai de /scripts)
$root = Split-Path -Parent $PSScriptRoot
$infos = Join-Path $root "infosdatabase"
$envFile = Join-Path $root ".env"

# ---- Le variaveis do .env ----
if (-not (Test-Path $envFile)) {
    throw "Arquivo .env nao encontrado em: $envFile"
}

$cfg = @{}
foreach ($line in Get-Content $envFile) {
    $t = $line.Trim()
    if ($t -eq "" -or $t.StartsWith("#")) { continue }
    $idx = $t.IndexOf("=")
    if ($idx -lt 1) { continue }
    $key = $t.Substring(0, $idx).Trim()
    $val = $t.Substring($idx + 1).Trim().Trim('"')
    $cfg[$key] = $val
}

$dbHost = if ($cfg.DB_HOST) { $cfg.DB_HOST } else { "localhost" }
$dbPort = if ($cfg.DB_PORT) { $cfg.DB_PORT } else { "3306" }
$dbUser = if ($cfg.DB_USER) { $cfg.DB_USER } else { "root" }
$dbPass = $cfg.DB_PASSWORD
$dbName = $cfg.DB_NAME
if (-not $dbName) { throw "DB_NAME nao definido no .env" }

# ---- Localiza o mysql.exe ----
$mysql = (Get-Command mysql -ErrorAction SilentlyContinue).Source
if (-not $mysql) {
    $candidatos = @(
        "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe",
        "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe",
        "C:\xampp\mysql\bin\mysql.exe"
    )
    $mysql = $candidatos | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $mysql) { throw "mysql.exe nao encontrado. Adicione-o ao PATH." }

# ---- Argumentos comuns de conexao ----
$connArgs = @("-h", $dbHost, "-P", $dbPort, "-u", $dbUser)
if ($dbPass) { $connArgs += "-p$dbPass" }

function Invoke-MySql([string[]]$extraArgs) {
    & $mysql @connArgs @extraArgs
    if ($LASTEXITCODE -ne 0) { throw "mysql falhou (exit code $LASTEXITCODE)" }
}

Write-Host "==> Banco alvo: $dbName em $dbHost`:$dbPort (usuario: $dbUser)" -ForegroundColor Cyan

# 1) DROP + CREATE DATABASE
Write-Host "==> [1/3] Apagando e recriando o banco..." -ForegroundColor Yellow
$ddl = "DROP DATABASE IF EXISTS ``$dbName``; CREATE DATABASE ``$dbName`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
Invoke-MySql @("-e", $ddl)

# 2) Estrutura (create.sql)
$createSql = Join-Path $infos "create.sql"
if (-not (Test-Path $createSql)) { throw "Nao encontrado: $createSql" }
Write-Host "==> [2/3] Criando tabelas (create.sql)..." -ForegroundColor Yellow
Invoke-MySql @($dbName, "-e", "source $createSql")

# 3) Dados (insert_tupa.sql)
$insertSql = Join-Path $infos "insert_tupa.sql"
if (-not (Test-Path $insertSql)) { throw "Nao encontrado: $insertSql" }
Write-Host "==> [3/3] Populando dados (insert_tupa.sql)..." -ForegroundColor Yellow
Invoke-MySql @($dbName, "-e", "source $insertSql")

Write-Host "==> Banco '$dbName' recriado e populado com sucesso." -ForegroundColor Green
