# Regras de negócio — meta de recebimento e painel (espelho do `gerar_painel_recebiveis.py`)

Este documento descreve a lógica que o script Python aplica para que um projeto **JavaScript/TypeScript** possa reproduzir o mesmo comportamento ao calcular progresso da meta, filtros e itens exibidos.

---

## 1. Duas formas de integração

| Abordagem | Quando usar |
|-----------|-------------|
| **A — Consumir JSON já processado** | O backend (ou pipeline) gera `omie_painel_recebiveis.json`. O front lê `progresso_meta_recebimento` e `itens` sem recalcular. |
| **B — Recalcular no cliente** | O front recebe `omie_caixa_recebimentos.json` (export Omie) e aplica as regras abaixo em JS. Útil se meta/filtros forem dinâmicos na UI. |

As regras nas seções 3–7 correspondem ao que o Python faz no modo **B**. No modo **A**, use apenas a seção 2.

---

## 2. Contrato do JSON do painel (`omie_painel_recebiveis.json`)

Objeto raiz relevante:

```json
{
  "periodo_consulta": { "inicio": "DD/MM/AAAA", "fim": "DD/MM/AAAA" },
  "filtro_categorias_codigos": ["1.01.01"] | null,
  "filtro_categorias_descricoes": ["texto exato", "..."] | null,
  "progresso_meta_recebimento": {
    "meta_recebimento": 500000.0,
    "valor_acumulado_recebido": 12345.67,
    "progresso_percentual": 2.47,
    "fracao_barra": 0.024469,
    "excedeu_meta": false
  },
  "quantidade_itens": 42,
  "itens": [ /* ver seção 6 */ ]
}
```

- **`progresso_percentual`**: número de **0 a 100**, já limitado (não passa de 100 quando ultrapassa a meta).
- **`fracao_barra`**: **0 a 1**, para `width: ${fracao * 100}%` ou bibliotecas de progresso.
- **`excedeu_meta`**: `valor_acumulado_recebido > meta_recebimento` quando `meta_recebimento > 0`.

Chaves dos itens usam **espaços** (ex.: `"valor do documento"`). Em JS: `item["valor do documento"]`.

---

## 3. Origem dos lançamentos (export `omie_caixa_recebimentos.json`)

### 3.1 Caminho no JSON

```
recebidos_caixa.via_extrato_conta_corrente.por_conta[]
```

Para **cada** elemento de `por_conta`:

1. Preferir a lista **`recebidos_itens`** (todos os recebidos da conta no período).
2. Se estiver ausente ou vazia, usar **`amostra_recebidos`** (apenas amostra — **não** representa o total real).

Cada elemento de `recebidos_itens` / `amostra_recebidos` é um **movimento bruto** do extrato Omie (objeto com `nValorDocumento`, `cCodCategoria`, etc.).

### 3.2 Aviso de dados incompletos

Se **alguma** conta tiver `amostra_recebidos` preenchida **e** **não** tiver `recebidos_itens`, o conjunto está **subamostrado**. O Python expõe um aviso equivalente; no JS você pode setar um flag `dadosIncompletos: true` com a mesma regra.

### 3.3 O que já vem filtrado no export

O pipeline de fetch marca como “recebido em caixa” apenas movimentos com critério Omie (natureza R / valor positivo não-P, excluindo linhas de saldo). **O painel não reaplica esse critério** — ele parte dos arrays `recebidos_itens` / `amostra_recebidos`.

---

## 4. Agregação: lista única

1. Inicializar `todos = []`.
2. Para cada `bloco` em `por_conta`:
   - `itens = bloco.recebidos_itens` se for array não vazio; senão `bloco.amostra_recebidos` ou `[]`.
   - Para cada `raw` em `itens`, fazer `todos.push(raw)` (ou equivalente com metadados de conta, se precisar).

---

## 5. Filtro por categoria (regra **E** entre eixos)

Parâmetros de configuração (equivalente a `PAINEL_CATEGORIAS` e `PAINEL_CATEGORIAS_DESC`):

| Eixo | Formato | Ausente ou vazio |
|------|---------|------------------|
| **Códigos** | string com códigos separados por **vírgula** (ex.: `1.01.01,1.04.97`) | **Não filtra** por código |
| **Descrições** | string com textos separados por **`;`** (ex.: `A;B`) | **Não filtra** por descrição |

Para cada item `raw`:

- `codigo = String(raw.cCodCategoria ?? "").trim()`
- `descricaoCf = String(raw.cDesCategoria ?? "").trim().toLowerCase()`  
  (no Python é `casefold()`; em JS, `toLowerCase()` é aceitável para português neste contexto, ou use `localeCompare` / biblioteca se precisar de casefold completo.)

**Regras:**

1. Se a lista de **códigos permitidos** foi definida (não vazia): descartar se `codigo` **não** estiver nesse conjunto.
2. Se o conjunto de **descrições permitidas** foi definido: montar um `Set` com cada trecho do split por `;`, **trim**, e comparar `descricaoCf` com `trecho.trim().toLowerCase()` (mesma normalização dos permitidos). Descartar se não bater **nenhuma**.
3. Se **ambos** os eixos estão ativos, o item precisa passar nos **dois** (lógica **E**).
4. Se **nenhum** eixo está ativo, nenhum item é descartado por categoria.

---

## 6. Mapeamento bruto → item do painel

Para cada `raw` que passou no filtro:

| Campo no painel | Origem (Omie) | Observação |
|-----------------|---------------|------------|
| `valor do documento` | `nValorDocumento` | Converter para número; arredondar **2 casas** (ex.: `Math.round(n * 100) / 100`). Inválido/ausente → `0`. |
| `saldo` | `nSaldo` | Mesmo tratamento numérico. É o saldo **cumulativo do extrato** após o lançamento, não o total do período. |
| `data inclusão` | `cDataInclusao` | String; trim; vazio se ausente. |
| `hora da inclusão` | `cHoraInclusao` | Idem. |
| `categoria` | objeto | `{ codigo: String(cCodCategoria).trim(), descricao: String(cDesCategoria).trim() }` |

---

## 7. Meta de recebimento e barra de progresso

### 7.1 Valor acumulado

```text
valor_acumulado_recebido = soma dos nValorDocumento (já como número) de todos os itens **após** o filtro de categoria
```

Mesma regra de conversão numérica da seção 6 (ausente/inválido = 0).

### 7.2 Parâmetro `meta`

- Número **positivo** (ex.: `500_000`).
- Default do script: **500000** se não houver configuração (equivalente a `PAINEL_META_RECEBIMENTO` no `.env`).

### 7.3 Cálculo (alinhado ao Python)

Se `meta <= 0`:

- `progresso_percentual = 0`
- `fracao_barra = 0`
- `excedeu_meta = false` (definição do script para meta inválida)

Se `meta > 0`:

- `fracao_bruta = valor_acumulado_recebido / meta`
- `fracao_barra = min(1, max(0, fracao_bruta))` — limitada entre **0** e **1**
- `progresso_percentual = round(fracao_barra * 100, 2)` — **2 casas decimais**
- `excedeu_meta = valor_acumulado_recebido > meta`

**Importante:** a barra **não** passa de 100% visualmente (`fracao_barra` cap em 1), mas `valor_acumulado_recebido` e `excedeu_meta` refletem valores acima da meta.

### 7.4 Exemplo em TypeScript

```typescript
type ProgressoMeta = {
  meta_recebimento: number;
  valor_acumulado_recebido: number;
  progresso_percentual: number;
  fracao_barra: number;
  excedeu_meta: boolean;
};

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function calcularProgressoMeta(acumulado: number, meta: number): ProgressoMeta {
  meta = Number(meta);
  const arred = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
  if (!(meta > 0)) {
    return {
      meta_recebimento: arred(meta, 2),
      valor_acumulado_recebido: arred(acumulado, 2),
      progresso_percentual: 0,
      fracao_barra: 0,
      excedeu_meta: false,
    };
  }
  const fracaoBruta = acumulado / meta;
  const fracao_barra = arred(Math.min(1, Math.max(0, fracaoBruta)), 6);
  const progresso_percentual = arred(fracao_barra * 100, 2);
  return {
    meta_recebimento: arred(meta, 2),
    valor_acumulado_recebido: arred(acumulado, 2),
    progresso_percentual,
    fracao_barra,
    excedeu_meta: acumulado > meta,
  };
}
```

---

## 8. Paridade com o Python

- **Arredondamentos:** item `valor do documento` / `saldo` com 2 casas; `fracao_barra` com 6 casas; `progresso_percentual` com 2 casas.
- **Filtro:** conjunto de códigos + conjunto de descrições em **E** quando ambos existem.
- **Descrições:** comparação insensível a maiúsculas; strings exatas após trim (e normalização de caso no lado do filtro).

Referência de implementação: `gerar_painel_recebiveis.py` na mesma pasta deste repositório.

---

## 9. Variáveis de ambiente (pipeline Python — referência)

| Variável | Função |
|----------|--------|
| `PAINEL_META_RECEBIMENTO` | Meta numérica (default 500000) |
| `PAINEL_CATEGORIAS` | Códigos separados por vírgula |
| `PAINEL_CATEGORIAS_DESC` | Descrições separadas por `;` |
| `PAINEL_OUTPUT` | Caminho do JSON de saída |

No front puro, substitua por constantes, `import.meta.env` (Vite), ou resposta de API.
