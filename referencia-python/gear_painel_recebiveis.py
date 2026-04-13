"""
Extrai recebíveis do omie_caixa_recebimentos.json para JSON de painel (front-end).

Campos por item (chaves solicitadas):
  valor do documento, saldo, data inclusão, hora da inclusão, categoria

Inclui bloco de progresso: meta fixa (ex.: 500.000) vs soma dos valores no filtro.

Filtro por código: PAINEL_CATEGORIAS / --categorias (vírgula).
Filtro por descrição exata (ignora maiúsculas): PAINEL_CATEGORIAS_DESC / --descricoes (separador ;).
Se ambos forem informados, aplica os dois (E): código permitido e descrição permitida.
Meta da barra: env PAINEL_META_RECEBIMENTO ou --meta (default 500000).
Saída: env PAINEL_OUTPUT ou -o.

Entrada padrão: omie_caixa_recebimentos.json.
Regenere o caixa com fetch_caixa_recebimentos.py (campo recebidos_itens) para listar todos os lançamentos, não só a amostra.
Saída padrão: omie_painel_recebiveis.json

Uso:
  python gerar_painel_recebiveis.py
  python gerar_painel_recebiveis.py --meta 500000 --categorias 1.01.01,1.04.97
  python gerar_painel_recebiveis.py --descricoes "Concessão de Aposentadoria;Concessão RESOLVVI (transferência)"
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None  # type: ignore[misc, assignment]


def _env(name: str) -> str:
    v = os.environ.get(name)
    return str(v).strip() if v else ""


def _float(v: Any) -> float:
    if v is None:
        return 0.0
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _norm_code(c: Any) -> str:
    return str(c).strip() if c is not None else ""


def coletar_itens_extrato(data: dict[str, Any]) -> list[dict[str, Any]]:
    """Une todos os recebidos de todas as contas (recebidos_itens ou amostra_recebidos)."""
    rc = (
        data.get("recebidos_caixa") or {}
    ).get("via_extrato_conta_corrente") or {}
    por_conta = rc.get("por_conta") or []
    out: list[dict[str, Any]] = []
    for bloco in por_conta:
        if not isinstance(bloco, dict):
            continue
        conta = bloco.get("conta_resumo") or {}
        itens = bloco.get("recebidos_itens")
        if not isinstance(itens, list) or not itens:
            itens = bloco.get("amostra_recebidos") or []
        if not isinstance(itens, list):
            continue
        for raw in itens:
            if not isinstance(raw, dict):
                continue
            out.append({"_raw": raw, "_conta": conta})
    return out


def _parse_descricoes(s: str) -> tuple[set[str], list[str]]:
    literal = [p.strip() for p in s.split(";") if p.strip()]
    return {p.casefold() for p in literal}, literal


def aplica_filtros_recebiveis(
    wrapped: list[dict[str, Any]],
    codigos_permitidos: set[str] | None,
    descricoes_casefold: set[str] | None,
) -> list[dict[str, Any]]:
    """codigos_permitidos / descricoes: None = não filtra nesse eixo."""
    filtrados: list[dict[str, Any]] = []
    for w in wrapped:
        raw = w["_raw"]
        cod = _norm_code(raw.get("cCodCategoria"))
        des_cf = (raw.get("cDesCategoria") or "").strip().casefold()
        if codigos_permitidos is not None and cod not in codigos_permitidos:
            continue
        if descricoes_casefold is not None and des_cf not in descricoes_casefold:
            continue
        filtrados.append(w)
    return filtrados


def montar_item_panel(w: dict[str, Any]) -> dict[str, Any]:
    raw = w["_raw"]
    cod = _norm_code(raw.get("cCodCategoria"))
    des = (raw.get("cDesCategoria") or "").strip()
    return {
        "valor do documento": round(_float(raw.get("nValorDocumento")), 2),
        "saldo": round(_float(raw.get("nSaldo")), 2),
        "data inclusão": str(raw.get("cDataInclusao") or "").strip(),
        "hora da inclusão": str(raw.get("cHoraInclusao") or "").strip(),
        "categoria": {
            "codigo": cod,
            "descricao": des,
        },
    }


def calcular_progresso(acumulado: float, meta: float) -> dict[str, Any]:
    meta = float(meta)
    if meta <= 0:
        pct = 0.0
        frac = 0.0
    else:
        frac = min(1.0, max(0.0, acumulado / meta))
        pct = round(frac * 100, 2)
    return {
        "meta_recebimento": round(meta, 2),
        "valor_acumulado_recebido": round(acumulado, 2),
        "progresso_percentual": pct,
        "fracao_barra": round(frac, 6),
        "excedeu_meta": acumulado > meta if meta > 0 else False,
    }


def main() -> int:
    root = Path(__file__).resolve().parent
    if load_dotenv:
        load_dotenv(root / ".env")

    p = argparse.ArgumentParser(description="Gera JSON do painel a partir do export Omie.")
    p.add_argument(
        "entrada",
        nargs="?",
        default=str(root / "omie_caixa_recebimentos.json"),
        help="JSON gerado pelo fetch_caixa_recebimentos.py",
    )
    p.add_argument(
        "-o",
        "--output",
        default=None,
        help="Arquivo de saída (default: env PAINEL_OUTPUT ou omie_painel_recebiveis.json)",
    )
    p.add_argument(
        "--meta",
        type=float,
        default=None,
        help="Meta de recebimento (default: env PAINEL_META_RECEBIMENTO ou 500000)",
    )
    p.add_argument(
        "--categorias",
        default=None,
        help="Códigos separados por vírgula (default: env PAINEL_CATEGORIAS ou todas)",
    )
    p.add_argument(
        "--descricoes",
        default=None,
        help="Descrições exatas separadas por ; (default: env PAINEL_CATEGORIAS_DESC)",
    )
    args = p.parse_args()

    meta = args.meta
    if meta is None:
        em = _env("PAINEL_META_RECEBIMENTO")
        meta = float(em) if em else 500_000.0

    cat_arg = args.categorias
    if cat_arg is None:
        cat_arg = _env("PAINEL_CATEGORIAS")
    if cat_arg is None:
        cat_arg = ""

    desc_arg = args.descricoes
    if desc_arg is None:
        desc_arg = _env("PAINEL_CATEGORIAS_DESC")
    if desc_arg is None:
        desc_arg = ""

    out_path = args.output or _env("PAINEL_OUTPUT") or str(root / "omie_painel_recebiveis.json")

    path_in = Path(args.entrada)
    if not path_in.is_file():
        print(f"Arquivo não encontrado: {path_in}", file=sys.stderr)
        return 1

    try:
        data = json.loads(path_in.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"JSON inválido: {e}", file=sys.stderr)
        return 1

    if not isinstance(data, dict):
        print("Raiz do JSON deve ser objeto.", file=sys.stderr)
        return 1

    cat_arg = (cat_arg or "").strip()
    codigos_filtro: set[str] | None = None
    if cat_arg:
        codigos_filtro = {c.strip() for c in cat_arg.split(",") if c.strip()}

    desc_cf: set[str] | None = None
    desc_literal: list[str] = []
    desc_arg_st = (desc_arg or "").strip()
    if desc_arg_st:
        desc_cf, desc_literal = _parse_descricoes(desc_arg_st)

    todos = coletar_itens_extrato(data)
    filtrados = aplica_filtros_recebiveis(todos, codigos_filtro, desc_cf)
    itens_panel = [montar_item_panel(w) for w in filtrados]
    acumulado = sum(_float(w["_raw"].get("nValorDocumento")) for w in filtrados)

    usou_amostra = False
    for bloco in (data.get("recebidos_caixa") or {}).get("via_extrato_conta_corrente", {}).get("por_conta", []):
        if isinstance(bloco, dict) and not bloco.get("recebidos_itens") and bloco.get("amostra_recebidos"):
            usou_amostra = True
            break

    periodo = data.get("periodo_consulta") or {}

    saida = {
        "gerado_em": datetime.now(timezone.utc).isoformat(),
        "fonte": str(path_in.resolve()),
        "periodo_consulta": periodo,
        "aviso_dados": (
            "Export sem recebidos_itens: apenas amostra_recebidos foi usada — regenere o caixa com fetch atualizado."
            if usou_amostra
            else None
        ),
        "filtro_categorias_codigos": sorted(codigos_filtro) if codigos_filtro else None,
        "filtro_categorias_descricoes": desc_literal if desc_literal else None,
        "progresso_meta_recebimento": calcular_progresso(acumulado, meta),
        "quantidade_itens": len(itens_panel),
        "itens": itens_panel,
    }

    if saida["aviso_dados"] is None:
        del saida["aviso_dados"]

    path_out = Path(out_path)
    path_out.write_text(json.dumps(saida, ensure_ascii=False, indent=2), encoding="utf-8")
    print(str(path_out.resolve()), file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
