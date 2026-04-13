#!/usr/bin/env bash
# Atualiza a meta de recebimento (POST /goals/logs) 1x/dia com dados Omie.
# Agendar com cron (meia-noite): ver scripts/cron/crontab.example
#
# Pré-requisitos no .env na raiz do repositório:
#   G4U_API_BASE, client_id, G4U_ADMIN_EMAIL, G4U_ADMIN_PASSWORD
#   GOAL_TEMPLATE_ID=<uuid> no .env (recomendado: evita criar template novo a cada execução)
#   PAINEL_*, OMIE_* conforme gear_painel_recebiveis / post_goals
#
# Opcional:
#   OMIE_GOALS_INPUT — caminho absoluto ou relativo à raiz do repo para JSON Omie (painel ou caixa)
#   OMIE_GOALS_REGENERATE_PANEL=1 — se existir omie_caixa_recebimentos.json, roda gear_painel_recebiveis antes
#   OMIE_GOALS_LOG_DIR — diretório para log (default: scripts/cron/logs)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

PY="${PYTHON:-python3}"
if ! command -v "$PY" &>/dev/null; then
  PY="python"
fi

INPUT="${OMIE_GOALS_INPUT:-referencia-python/omie_painel_recebiveis.json}"
if [[ "${INPUT}" != /* ]]; then
  INPUT="$REPO_ROOT/$INPUT"
fi

LOG_DIR="${OMIE_GOALS_LOG_DIR:-$SCRIPT_DIR/logs}"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/omie-goals-$(date -u +%Y-%m-%d).log"

if [[ "${OMIE_GOALS_REGENERATE_PANEL:-}" == "1" || "${OMIE_GOALS_REGENERATE_PANEL:-}" == "true" ]]; then
  CAIXA="$REPO_ROOT/referencia-python/omie_caixa_recebimentos.json"
  PAINEL_OUT="$REPO_ROOT/referencia-python/omie_painel_recebiveis.json"
  if [[ -f "$CAIXA" ]]; then
    echo "[$(date -u -Iseconds)] Regenerando painel a partir do caixa Omie" | tee -a "$LOG_FILE"
    "$PY" "$REPO_ROOT/referencia-python/gear_painel_recebiveis.py" "$CAIXA" -o "$PAINEL_OUT" 2>&1 | tee -a "$LOG_FILE"
    INPUT="$PAINEL_OUT"
  else
    echo "[$(date -u -Iseconds)] AVISO: OMIE_GOALS_REGENERATE_PANEL ativo mas não existe $CAIXA" | tee -a "$LOG_FILE"
  fi
fi

if [[ ! -f "$INPUT" ]]; then
  echo "[$(date -u -Iseconds)] ERRO: arquivo de entrada não encontrado: $INPUT" | tee -a "$LOG_FILE"
  exit 1
fi

echo "[$(date -u -Iseconds)] Executando post_goals_receita_concedida_omie.py ($INPUT)" | tee -a "$LOG_FILE"
"$PY" "$REPO_ROOT/referencia-python/post_goals_receita_concedida_omie.py" "$INPUT" 2>&1 | tee -a "$LOG_FILE"
exit "${PIPESTATUS[0]}"
