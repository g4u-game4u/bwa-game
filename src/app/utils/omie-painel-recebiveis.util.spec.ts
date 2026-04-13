import {
  calcularProgressoMetaRecebimento,
  processarExportCaixaParaPainel,
  aplicaFiltrosRecebiveis,
  coletarItensExtrato,
  parseCodigosPermitidos,
  parseDescricoesPermitidas
} from './omie-painel-recebiveis.util';

describe('omie-painel-recebiveis.util', () => {
  it('calcularProgressoMetaRecebimento capa fracao e percentual como no Python', () => {
    const p = calcularProgressoMetaRecebimento(12345.67, 500000);
    expect(p.valor_acumulado_recebido).toBe(12345.67);
    expect(p.meta_recebimento).toBe(500000);
    expect(p.fracao_barra).toBe(0.024691);
    expect(p.progresso_percentual).toBe(2.47);
    expect(p.excedeu_meta).toBe(false);
  });

  it('calcularProgressoMetaRecebimento acima da meta: barra em 1, excedeu true', () => {
    const p = calcularProgressoMetaRecebimento(600000, 500000);
    expect(p.fracao_barra).toBe(1);
    expect(p.progresso_percentual).toBe(100);
    expect(p.excedeu_meta).toBe(true);
  });

  it('filtro E: código e descrição', () => {
    const rawList = [
      { raw: { cCodCategoria: '1.01.01', cDesCategoria: 'Foo', nValorDocumento: 10 } },
      { raw: { cCodCategoria: '9.99.99', cDesCategoria: 'Foo', nValorDocumento: 20 } },
      { raw: { cCodCategoria: '1.01.01', cDesCategoria: 'Bar', nValorDocumento: 30 } }
    ];
    const cod = parseCodigosPermitidos('1.01.01');
    const desc = parseDescricoesPermitidas('Foo');
    const filtrados = aplicaFiltrosRecebiveis(rawList, cod, desc!.casefoldSet);
    expect(filtrados.length).toBe(1);
    expect(filtrados[0].nValorDocumento).toBe(10);
  });

  it('processarExportCaixaParaPainel agrega nValorDocumento após filtro', () => {
    const data = {
      recebidos_caixa: {
        via_extrato_conta_corrente: {
          por_conta: [
            {
              recebidos_itens: [
                { cCodCategoria: '1.01.01', cDesCategoria: 'A', nValorDocumento: 100.005, nSaldo: 0 },
                { cCodCategoria: '2.02.02', cDesCategoria: 'B', nValorDocumento: 50, nSaldo: 0 }
              ]
            }
          ]
        }
      }
    };
    const painel = processarExportCaixaParaPainel(data, {
      meta: 1000,
      categoriasCodigosCsv: '1.01.01'
    });
    expect(painel.quantidade_itens).toBe(1);
    expect(painel.progresso_meta_recebimento.valor_acumulado_recebido).toBe(100.01);
  });

  it('coletarItensExtrato usa amostra quando recebidos_itens vazio', () => {
    const data = {
      recebidos_caixa: {
        via_extrato_conta_corrente: {
          por_conta: [
            {
              recebidos_itens: [],
              amostra_recebidos: [{ cCodCategoria: '1', nValorDocumento: 1 }]
            }
          ]
        }
      }
    };
    expect(coletarItensExtrato(data).length).toBe(1);
  });
});
