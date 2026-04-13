import type { CompanyDisplay } from '@services/company-kpi.service';

/**
 * Filtra linhas da carteira (entrega / cliente) por texto no nome exibido, CNPJ, id de entrega, etc.
 */
export function filterCompanyDisplaysByClienteSearch(
  items: CompanyDisplay[],
  query: string,
  resolveDisplayName: (cnpj: string) => string
): CompanyDisplay[] {
  const s = (query || '').trim().toLowerCase();
  if (!s) {
    return items;
  }
  return items.filter(c => {
    const title = (c.deliveryTitle && c.deliveryTitle.trim()) || resolveDisplayName(c.cnpj);
    const parts = [title, c.cnpj, c.cnpjId, c.deliveryId, c.deliveryTitle, resolveDisplayName(c.cnpj)];
    return parts.some(p => p != null && String(p).toLowerCase().includes(s));
  });
}
