"""
Pipeline: Omie (gear_painel_recebiveis.py) → POST no backend G4U de metas.

Contrato da API (ex.: G4U_API_BASE=http://localhost:3001):

  POST /goals/templates
    { "title": "Meta trimestral de vendas", "active": true }

  POST /goals/logs
    {
      "title": "string",
      "goal_template_id": "<uuid>",
      "status": "string",
      "complete": 0,
      "incomplete": 0,
      "current_goal_value": 0,
      "updated_value": 0,
      "updated_percentual_progress": 0,
      "cumulative_value": 0,
      "cumulative_percentual_progress": 0,
      "extra": { ... }
    }

  POST /goals/team-users (um POST por colaborador)
    {
      "title": "Meta individual — João",
      "goal_template_id": "<uuid>",
      "user_id": "<uuid>",
      "user_name": "string",
      "team_id": 1,
      "team_name": "string",
      "goal_value": 10000
    }

Mapeamento Omie → logs:
  current_goal_value / meta → meta_recebimento
  updated_value / cumulative_value → valor_acumulado_recebido
  updated_percentual_progress / cumulative_percentual_progress → progresso_percentual
  extra → reference_month, periodo_consulta, quantidade_itens, aviso_dados, fracao_barra, excedeu_meta

Saída stdout: circularProgress (id valor-concedido) + resultados HTTP.

Variáveis de ambiente (painel: PAINEL_META_RECEBIMENTO, PAINEL_CATEGORIAS, PAINEL_CATEGORIAS_DESC):

  G4U_API_BASE / backend_url_base, client_id, G4U_ADMIN_EMAIL + G4U_ADMIN_PASSWORD (ou GOALS_API_TOKEN)
  GOAL_TEMPLATE_ID — se definido, não chama POST /goals/templates (usa este UUID nos demais POSTs)
  GOALS_TEMPLATE_TITLE — default igual a GOAL_LABEL ou "Receita concedida"
  GOALS_TEMPLATE_ACTIVE — default true
  GOALS_LOG_TITLE — default = título do template
  GOALS_LOG_STATUS — default "updated"
  GOALS_LOG_COMPLETE / GOALS_LOG_INCOMPLETE — inteiros (default 0)
  GOALS_TEAM_ID — número do time (obrigatório para POST team-users)
  GOALS_TEAM_NAME — default "Financeiro"
  GOALS_TEAM_USERS_JSON — array JSON: [{"user_id":"uuid","user_name":"Nome","goal_value":500000}, ...]
    campos opcionais por item: title, team_id, team_name
  REFERENCE_MONTH — YYYY-MM para extra; senão deriva do período Omie

Uso:
  python post_goals_receita_concedida_omie.py
  python post_goals_receita_concedida_omie.py path/omie_painel_recebiveis.json --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None  # type: ignore[misc, assignment]

# Mesmo diretório deste arquivo
_SCRIPT_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _SCRIPT_DIR.parent

if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

import gear_painel_recebiveis as gp  # noqa: E402


def _env(name: str, default: str = "") -> str:
    v = os.environ.get(name)
    return str(v).strip() if v else default


def _api_base() -> str:
    b = _env("G4U_API_BASE") or _env("backend_url_base")
    return b.rstrip("/")


def _env_int(name: str, default: int | None = None) -> int | None:
    s = _env(name)
    if not s:
        return default
    try:
        return int(s, 10)
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    s = _env(name)
    if not s:
        return default
    try:
        return float(s)
    except ValueError:
        return default


def _parse_team_users_json() -> list[dict[str, Any]]:
    raw = _env("GOALS_TEAM_USERS_JSON")
    if not raw:
        return []
    data = json.loads(raw)
    if not isinstance(data, list):
        raise ValueError("GOALS_TEAM_USERS_JSON deve ser um array JSON.")
    out: list[dict[str, Any]] = []
    for i, item in enumerate(data):
        if not isinstance(item, dict):
            raise ValueError(f"GOALS_TEAM_USERS_JSON[{i}] deve ser objeto.")
        out.append(item)
    return out


def _extract_goal_template_id(resp: Any) -> str | None:
    if not isinstance(resp, dict):
        return None
    for key in ("id", "goal_template_id", "goalTemplateId"):
        v = resp.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()
    nested = resp.get("data")
    if isinstance(nested, dict):
        for key in ("id", "goal_template_id", "goalTemplateId"):
            v = nested.get(key)
            if isinstance(v, str) and v.strip():
                return v.strip()
    return None


def _parse_br_date(s: str) -> datetime | None:
    s = (s or "").strip()
    m = re.match(r"^(\d{2})/(\d{2})/(\d{4})$", s)
    if not m:
        return None
    d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    try:
        return datetime(y, mo, d, tzinfo=timezone.utc)
    except ValueError:
        return None


def _reference_month_from_period(periodo: dict[str, Any] | None) -> str | None:
    if not periodo:
        return None
    fim = periodo.get("fim")
    if isinstance(fim, str):
        dt = _parse_br_date(fim)
        if dt:
            return dt.strftime("%Y-%m")
    return None


def _http_json(
    method: str,
    url: str,
    payload: dict[str, Any] | None,
    headers: dict[str, str],
    timeout: float = 60.0,
) -> tuple[int, Any]:
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            code = resp.getcode()
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        code = e.code
        try:
            return code, json.loads(body) if body.strip() else {"raw": body}
        except json.JSONDecodeError:
            return code, {"raw": body, "error": str(e)}

    if not body.strip():
        return code, None
    try:
        return code, json.loads(body)
    except json.JSONDecodeError:
        return code, {"raw": body}


def _g4u_login_access_token(api_base: str) -> str:
    """
    Mesmo contrato do Angular AuthProvider.login: POST {base}/auth/login
    com { email, password } e header client_id. Retorna access_token (JWT).
    """
    email = _env("G4U_ADMIN_EMAIL")
    password = _env("G4U_ADMIN_PASSWORD")
    url = f"{api_base.rstrip('/')}/auth/login"
    h = {"Content-Type": "application/json", "Accept": "application/json"}
    cid = _env("client_id") or _env("CLIENT_ID")
    if cid:
        h["client_id"] = cid
    code, resp = _http_json(
        "POST",
        url,
        {"email": email.strip(), "password": password},
        h,
    )
    if code >= 400:
        raise RuntimeError(f"POST /auth/login falhou HTTP {code}: {resp}")
    if not isinstance(resp, dict) or not resp.get("access_token"):
        raise RuntimeError(f"Resposta de login sem access_token: {resp}")
    return str(resp["access_token"])


def _auth_headers(access_token: str | None = None) -> dict[str, str]:
    h = {"Content-Type": "application/json", "Accept": "application/json"}
    cid = _env("client_id") or _env("CLIENT_ID")
    if cid:
        h["client_id"] = cid
    token = (access_token or "").strip() or _env("GOALS_API_TOKEN")
    if token:
        name = _env("GOALS_AUTH_HEADER") or "Authorization"
        if name.lower() == "authorization" and not token.lower().startswith("bearer "):
            h[name] = f"Bearer {token}"
        else:
            h[name] = token
    return h


def _is_painel_processado(data: dict[str, Any]) -> bool:
    p = data.get("progresso_meta_recebimento")
    return isinstance(p, dict) and "valor_acumulado_recebido" in p and "meta_recebimento" in p


def _build_panel_payload(
    path_in: Path,
    meta: float,
    cat_arg: str,
    desc_arg: str,
) -> dict[str, Any]:
    data = json.loads(path_in.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("Raiz do JSON Omie deve ser objeto.")

    # Permite alimentar com omie_painel_recebiveis.json já gerado pelo gear_painel_recebiveis.py
    if _is_painel_processado(data):
        return {
            "gerado_em": data.get("gerado_em") or datetime.now(timezone.utc).isoformat(),
            "fonte": data.get("fonte") or str(path_in.resolve()),
            "periodo_consulta": data.get("periodo_consulta") or {},
            "filtro_categorias_codigos": data.get("filtro_categorias_codigos"),
            "filtro_categorias_descricoes": data.get("filtro_categorias_descricoes"),
            "progresso_meta_recebimento": data["progresso_meta_recebimento"],
            "quantidade_itens": data.get("quantidade_itens", 0),
            **({"aviso_dados": data["aviso_dados"]} if data.get("aviso_dados") else {}),
        }

    cat_arg = (cat_arg or "").strip()
    codigos_filtro: set[str] | None = None
    if cat_arg:
        codigos_filtro = {c.strip() for c in cat_arg.split(",") if c.strip()}

    desc_cf: set[str] | None = None
    desc_literal: list[str] = []
    desc_arg_st = (desc_arg or "").strip()
    if desc_arg_st:
        desc_cf, desc_literal = gp._parse_descricoes(desc_arg_st)

    todos = gp.coletar_itens_extrato(data)
    filtrados = gp.aplica_filtros_recebiveis(todos, codigos_filtro, desc_cf)
    acumulado = sum(gp._float(w["_raw"].get("nValorDocumento")) for w in filtrados)

    usou_amostra = False
    for bloco in (data.get("recebidos_caixa") or {}).get("via_extrato_conta_corrente", {}).get("por_conta", []):
        if isinstance(bloco, dict) and not bloco.get("recebidos_itens") and bloco.get("amostra_recebidos"):
            usou_amostra = True
            break

    periodo = data.get("periodo_consulta") or {}
    prog = gp.calcular_progresso(acumulado, meta)

    saida: dict[str, Any] = {
        "gerado_em": datetime.now(timezone.utc).isoformat(),
        "fonte": str(path_in.resolve()),
        "periodo_consulta": periodo,
        "filtro_categorias_codigos": sorted(codigos_filtro) if codigos_filtro else None,
        "filtro_categorias_descricoes": desc_literal if desc_literal else None,
        "progresso_meta_recebimento": prog,
        "quantidade_itens": len(filtrados),
    }
    if usou_amostra:
        saida["aviso_dados"] = (
            "Export sem recebidos_itens: apenas amostra_recebidos foi usada — regenere o caixa com fetch atualizado."
        )
    return saida


def _circular_progress_metric(prog: dict[str, Any], label: str) -> dict[str, Any]:
    return {
        "id": "valor-concedido",
        "label": label,
        "current": prog["valor_acumulado_recebido"],
        "target": prog["meta_recebimento"],
        "unit": "R$",
    }


def _build_template_body() -> dict[str, Any]:
    title = _env("GOALS_TEMPLATE_TITLE") or _env("GOAL_LABEL") or "Receita concedida"
    active_raw = _env("GOALS_TEMPLATE_ACTIVE")
    if not active_raw:
        active = True
    else:
        active = active_raw.lower() not in ("false", "0", "no", "off")
    return {"title": title, "active": active}


def _build_log_body(
    goal_template_id: str,
    template_title: str,
    painel: dict[str, Any],
    prog: dict[str, Any],
    ref_month: str,
) -> dict[str, Any]:
    log_title = _env("GOALS_LOG_TITLE") or template_title
    status = _env("GOALS_LOG_STATUS") or "updated"
    complete = _env_int("GOALS_LOG_COMPLETE", 0)
    incomplete = _env_int("GOALS_LOG_INCOMPLETE", 0)
    if complete is None:
        complete = 0
    if incomplete is None:
        incomplete = 0
    current_goal = float(prog["meta_recebimento"])
    updated_val = float(prog["valor_acumulado_recebido"])
    pct = float(prog["progresso_percentual"])
    extra: dict[str, Any] = {
        "reference_month": ref_month,
        "omie": {
            "periodo_consulta": painel.get("periodo_consulta"),
            "quantidade_itens": painel.get("quantidade_itens"),
            "aviso_dados": painel.get("aviso_dados"),
            "fracao_barra": prog.get("fracao_barra"),
            "excedeu_meta": prog.get("excedeu_meta"),
            "source": "omie_painel",
        },
    }
    return {
        "title": log_title,
        "goal_template_id": goal_template_id,
        "status": status,
        "complete": int(complete),
        "incomplete": int(incomplete),
        "current_goal_value": current_goal,
        "updated_value": updated_val,
        "updated_percentual_progress": pct,
        "cumulative_value": updated_val,
        "cumulative_percentual_progress": pct,
        "extra": extra,
    }


def _build_team_user_body(
    entry: dict[str, Any],
    goal_template_id: str,
    default_goal_value: float,
    default_team_id: int | None,
    default_team_name: str,
) -> dict[str, Any]:
    user_id = entry.get("user_id")
    user_name = entry.get("user_name")
    if not isinstance(user_id, str) or not user_id.strip():
        raise ValueError("Cada item de GOALS_TEAM_USERS_JSON precisa de user_id (string UUID).")
    if not isinstance(user_name, str) or not user_name.strip():
        raise ValueError("Cada item de GOALS_TEAM_USERS_JSON precisa de user_name (string).")
    team_id = entry.get("team_id")
    if team_id is None:
        team_id = default_team_id
    if team_id is None:
        raise ValueError("team_id: defina GOALS_TEAM_ID ou team_id em cada item do JSON.")
    tn = entry.get("team_name")
    team_name = tn.strip() if isinstance(tn, str) and tn.strip() else default_team_name
    gv = entry.get("goal_value", default_goal_value)
    try:
        goal_value = float(gv)
    except (TypeError, ValueError) as e:
        raise ValueError(f"goal_value inválido para {user_name!r}") from e
    raw_title = entry.get("title")
    if isinstance(raw_title, str) and raw_title.strip():
        title = raw_title.strip()
    else:
        title = f"Meta individual — {user_name.strip()}"
    return {
        "title": title,
        "goal_template_id": goal_template_id,
        "user_id": user_id.strip(),
        "user_name": user_name.strip(),
        "team_id": int(team_id),
        "team_name": team_name,
        "goal_value": goal_value,
    }


def main() -> int:
    if load_dotenv:
        load_dotenv(_REPO_ROOT / ".env")
        load_dotenv(_SCRIPT_DIR / ".env")

    p = argparse.ArgumentParser(description="Omie → POST /goals/* → métrica circular progress.")
    p.add_argument(
        "entrada",
        nargs="?",
        default=str(_SCRIPT_DIR / "omie_caixa_recebimentos.json"),
        help="JSON caixa Omie (recebidos_caixa...)",
    )
    p.add_argument("--dry-run", action="store_true", help="Só imprime payloads, sem HTTP.")
    p.add_argument("--skip-post", action="store_true", help="Não envia POSTs (equivale a dry para API).")
    args = p.parse_args()

    path_in = Path(args.entrada)
    if not path_in.is_file():
        print(f"Arquivo não encontrado: {path_in}", file=sys.stderr)
        return 1

    meta = float(_env("PAINEL_META_RECEBIMENTO") or "500000")
    cat_arg = _env("PAINEL_CATEGORIAS")
    desc_arg = _env("PAINEL_CATEGORIAS_DESC")

    try:
        painel = _build_panel_payload(path_in, meta, cat_arg, desc_arg)
        team_user_entries = _parse_team_users_json()
    except (json.JSONDecodeError, ValueError) as e:
        print(str(e), file=sys.stderr)
        return 1

    prog = painel["progresso_meta_recebimento"]
    label = _env("GOAL_LABEL") or "Receita concedida"
    ref_month = _env("REFERENCE_MONTH") or _reference_month_from_period(
        painel.get("periodo_consulta") if isinstance(painel.get("periodo_consulta"), dict) else None
    )
    if not ref_month:
        ref_month = datetime.now(timezone.utc).strftime("%Y-%m")

    template_body = _build_template_body()
    template_title = str(template_body["title"])

    goal_template_id_env = _env("GOAL_TEMPLATE_ID") or _env("GOALS_GOAL_TEMPLATE_ID")
    dry_tid = goal_template_id_env or "3fa85f64-5717-4562-b3fc-2c963f66afa6"

    log_body = _build_log_body(dry_tid, template_title, painel, prog, ref_month)

    default_goal_value = float(prog["meta_recebimento"])
    default_team_id = _env_int("GOALS_TEAM_ID")
    default_team_name = _env("GOALS_TEAM_NAME") or "Financeiro"

    team_users_bodies: list[dict[str, Any]] = []
    for entry in team_user_entries:
        try:
            team_users_bodies.append(
                _build_team_user_body(
                    entry,
                    dry_tid,
                    default_goal_value,
                    default_team_id,
                    default_team_name,
                )
            )
        except ValueError as e:
            print(str(e), file=sys.stderr)
            return 1

    base = _api_base()
    dry = args.dry_run or args.skip_post

    if not base and not dry:
        print(
            "Defina G4U_API_BASE ou backend_url_base no .env (ou use --dry-run).",
            file=sys.stderr,
        )
        return 1

    access_token: str | None = None
    if not dry:
        admin_email = _env("G4U_ADMIN_EMAIL")
        admin_pass = _env("G4U_ADMIN_PASSWORD")
        if admin_email and admin_pass:
            try:
                access_token = _g4u_login_access_token(base)
            except RuntimeError as e:
                print(str(e), file=sys.stderr)
                return 1
        elif admin_email or admin_pass:
            print(
                "Defina ambos G4U_ADMIN_EMAIL e G4U_ADMIN_PASSWORD para login admin, ou use GOALS_API_TOKEN.",
                file=sys.stderr,
            )
            return 1
        elif not _env("GOALS_API_TOKEN"):
            print(
                "Autenticação: defina G4U_ADMIN_EMAIL e G4U_ADMIN_PASSWORD "
                "(login em POST /auth/login) ou GOALS_API_TOKEN no .env.",
                file=sys.stderr,
            )
            return 1

    headers = _auth_headers(access_token)
    results: list[dict[str, Any]] = []

    goal_template_id: str | None = goal_template_id_env or None

    if dry:
        pass
    else:
        if not goal_template_id:
            t_url = f"{base}/goals/templates"
            t_code, t_resp = _http_json("POST", t_url, template_body, headers)
            results.append({"path": "/goals/templates", "status": t_code, "response": t_resp})
            if t_code >= 400:
                print(f"Erro HTTP {t_code} em /goals/templates: {t_resp}", file=sys.stderr)
            else:
                goal_template_id = _extract_goal_template_id(t_resp)
                if not goal_template_id:
                    print(
                        "POST /goals/templates OK mas não foi possível ler goal_template_id na resposta; "
                        "defina GOAL_TEMPLATE_ID no .env.",
                        file=sys.stderr,
                    )
        else:
            results.append(
                {
                    "path": "/goals/templates",
                    "status": "skipped",
                    "note": "GOAL_TEMPLATE_ID definido",
                    "goal_template_id": goal_template_id,
                }
            )

        if goal_template_id:
            log_body_live = _build_log_body(
                goal_template_id, template_title, painel, prog, ref_month
            )
            l_url = f"{base}/goals/logs"
            l_code, l_resp = _http_json("POST", l_url, log_body_live, headers)
            results.append({"path": "/goals/logs", "status": l_code, "response": l_resp})
            if l_code >= 400:
                print(f"Erro HTTP {l_code} em /goals/logs: {l_resp}", file=sys.stderr)

            for idx, entry in enumerate(team_user_entries):
                tu_body = _build_team_user_body(
                    entry,
                    goal_template_id,
                    default_goal_value,
                    default_team_id,
                    default_team_name,
                )
                u_url = f"{base}/goals/team-users"
                u_code, u_resp = _http_json("POST", u_url, tu_body, headers)
                results.append(
                    {
                        "path": "/goals/team-users",
                        "index": idx,
                        "user_name": tu_body.get("user_name"),
                        "status": u_code,
                        "response": u_resp,
                    }
                )
                if u_code >= 400:
                    print(
                        f"Erro HTTP {u_code} em /goals/team-users ({tu_body.get('user_name')}): {u_resp}",
                        file=sys.stderr,
                    )
        elif team_user_entries:
            print("Sem goal_template_id: ignorados POST /goals/team-users.", file=sys.stderr)

    metric = _circular_progress_metric(prog, label)

    if dry:
        out_dry: dict[str, Any] = {
            "referenceMonth": ref_month,
            "goalTemplateIdUsedInExamples": dry_tid,
            "endpoints": {
                "templates": {"method": "POST", "path": "/goals/templates", "body": template_body},
                "logs": {"method": "POST", "path": "/goals/logs", "body": log_body},
                "teamUsers": [
                    {"method": "POST", "path": "/goals/team-users", "body": b} for b in team_users_bodies
                ],
            },
            "circularProgress": metric,
        }
        print(json.dumps(out_dry, ensure_ascii=False, indent=2))
    else:
        get_url = (
            f"{base}/goals/logs?goal_template_id={urllib.parse.quote(goal_template_id or dry_tid)}"
        )
        gcode, gresp = _http_json(
            "GET",
            get_url,
            None,
            {k: v for k, v in headers.items() if k != "Content-Type"},
        )
        out: dict[str, Any] = {
            "goalTemplateId": goal_template_id,
            "circularProgress": metric,
            "postResults": results,
            "getGoalsLogs": {"url": get_url, "status": gcode, "body": gresp},
        }
        print(json.dumps(out, ensure_ascii=False, indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
