# Atualiza a meta de recebimento (POST /goals/logs) 1x/dia.
# Agendador: Task Scheduler > Create Basic Task > Daily > 12:00 AM >
#   Program: powershell.exe
#   Arguments: -NoProfile -ExecutionPolicy Bypass -File "C:\...\bwa-game\scripts\cron\run-daily-omie-goals.ps1"
#
# Mesmas variáveis que run-daily-omie-goals.sh (via .env na raiz do repo).

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..\..")

Set-Location $RepoRoot

$py = if ($env:PYTHON) { $env:PYTHON } else { "python" }

$inputRel = if ($env:OMIE_GOALS_INPUT) { $env:OMIE_GOALS_INPUT } else { "referencia-python\omie_painel_recebiveis.json" }
$inputPath = if ([System.IO.Path]::IsPathRooted($inputRel)) { $inputRel } else { Join-Path $RepoRoot $inputRel }

$logDir = if ($env:OMIE_GOALS_LOG_DIR) { $env:OMIE_GOALS_LOG_DIR } else { Join-Path $ScriptDir "logs" }
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir ("omie-goals-{0:yyyy-MM-dd}.log" -f (Get-Date).ToUniversalTime())

function Write-Log($msg) {
    $line = "[{0}] {1}" -f (Get-Date).ToUniversalTime().ToString("o"), $msg
    Add-Content -Path $logFile -Value $line
    Write-Host $line
}

if ($env:OMIE_GOALS_REGENERATE_PANEL -eq "1" -or $env:OMIE_GOALS_REGENERATE_PANEL -eq "true") {
    $caixa = Join-Path $RepoRoot "referencia-python\omie_caixa_recebimentos.json"
    $painelOut = Join-Path $RepoRoot "referencia-python\omie_painel_recebiveis.json"
    if (Test-Path $caixa) {
        Write-Log "Regenerando painel a partir do caixa Omie"
        $gearOut = & $py (Join-Path $RepoRoot "referencia-python\gear_painel_recebiveis.py") $caixa "-o" $painelOut 2>&1
        Add-Content -Path $logFile -Value $gearOut
        Write-Host $gearOut
        $inputPath = $painelOut
    } else {
        Write-Log "AVISO: OMIE_GOALS_REGENERATE_PANEL ativo mas nao existe $caixa"
    }
}

if (-not (Test-Path $inputPath)) {
    Write-Log "ERRO: arquivo de entrada nao encontrado: $inputPath"
    exit 1
}

Write-Log "Executando post_goals_receita_concedida_omie.py ($inputPath)"
$postScript = Join-Path $RepoRoot "referencia-python\post_goals_receita_concedida_omie.py"
$output = & $py $postScript $inputPath 2>&1
$code = $LASTEXITCODE
Add-Content -Path $logFile -Value $output
Write-Host $output
exit $code
