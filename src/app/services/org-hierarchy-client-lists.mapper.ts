import type {
  OrgHierarchyClientListItem,
  OrgHierarchyClientListKey,
  OrgHierarchyClientLists,
  OrgHierarchyKpiDetailKey,
  OrganizationHierarchyKpiDetailHistoryItem,
  OrganizationHierarchyKpiDetailResponse
} from '@model/game4u-api.model';
import { slugifyExportFilenamePart } from '@utils/spreadsheet-export';

export const ORG_HIERARCHY_CLIENT_LIST_KPIS = new Set<OrgHierarchyKpiDetailKey>([
  'clients_served',
  'clients_acessorias_g4',
  'clients_acessorias_onboarding',
  'clients_acessorias_risco_de_churn'
]);

/** Listas tag Acessórias — únicas carregadas sob demanda no drill-down. */
export const ORG_HIERARCHY_TAG_CLIENT_LIST_KEYS = new Set<OrgHierarchyClientListKey>([
  'clients_acessorias_g4',
  'clients_acessorias_onboarding',
  'clients_acessorias_risco_de_churn'
]);

const CLIENT_LIST_LABELS: Record<OrgHierarchyClientListKey, string> = {
  clients_served: 'Atendidos (total)',
  clients_acessorias_g4: 'G4',
  clients_acessorias_onboarding: 'Onboarding',
  clients_acessorias_risco_de_churn: 'Risco churn'
};

const CLIENT_LIST_EXPORT_SLUGS: Record<OrgHierarchyClientListKey, string> = {
  clients_served: 'clientes-atendidos',
  clients_acessorias_g4: 'clientes-g4',
  clients_acessorias_onboarding: 'clientes-onboarding',
  clients_acessorias_risco_de_churn: 'clientes-risco-churn'
};

export interface OrgHierarchyClientListTab {
  key: OrgHierarchyClientListKey;
  label: string;
  count: number;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const raw = obj[key];
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim();
    }
  }
  return '';
}

function pickNullableString(obj: Record<string, unknown>, keys: string[]): string | null {
  const value = pickString(obj, keys);
  return value || null;
}

function pickBoolean(obj: Record<string, unknown>, keys: string[]): boolean {
  for (const key of keys) {
    const raw = obj[key];
    if (typeof raw === 'boolean') {
      return raw;
    }
    if (typeof raw === 'string') {
      const normalized = raw.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') {
        return true;
      }
      if (normalized === 'false' || normalized === '0') {
        return false;
      }
    }
  }
  return false;
}

export function normalizeOrgHierarchyClientListItem(raw: unknown): OrgHierarchyClientListItem | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const company_serve_key = pickString(o, ['company_serve_key', 'companyServeKey']);
  const company_name = pickString(o, ['company_name', 'companyName', 'company_label', 'companyLabel']);
  if (!company_serve_key && !company_name) {
    return null;
  }
  return {
    company_serve_key: company_serve_key || company_name,
    company_name: company_name || company_serve_key,
    is_acessorias_g4: pickBoolean(o, ['is_acessorias_g4', 'isAcessoriasG4']),
    is_acessorias_onboarding: pickBoolean(o, ['is_acessorias_onboarding', 'isAcessoriasOnboarding']),
    is_acessorias_risco_de_churn: pickBoolean(o, [
      'is_acessorias_risco_de_churn',
      'isAcessoriasRiscoDeChurn'
    ]),
    player_email: pickNullableString(o, ['player_email', 'playerEmail']),
    player_name: pickNullableString(o, ['player_name', 'playerName']),
    diretor_name: pickNullableString(o, ['diretor_name', 'diretorName']),
    gerente_name: pickNullableString(o, ['gerente_name', 'gerenteName']),
    supervisor_name: pickNullableString(o, ['supervisor_name', 'supervisorName'])
  };
}

function normalizeClientListArray(raw: unknown): OrgHierarchyClientListItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map(item => normalizeOrgHierarchyClientListItem(item))
    .filter((item): item is OrgHierarchyClientListItem => item != null);
}

export function normalizeOrgHierarchyClientLists(raw: unknown): OrgHierarchyClientLists | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const o = raw as Record<string, unknown>;
  return {
    clients_served: normalizeClientListArray(o['clients_served'] ?? o['clientsServed']),
    clients_acessorias_g4: normalizeClientListArray(
      o['clients_acessorias_g4'] ?? o['clientsAcessoriasG4']
    ),
    clients_acessorias_onboarding: normalizeClientListArray(
      o['clients_acessorias_onboarding'] ?? o['clientsAcessoriasOnboarding']
    ),
    clients_acessorias_risco_de_churn: normalizeClientListArray(
      o['clients_acessorias_risco_de_churn'] ?? o['clientsAcessoriasRiscoDeChurn']
    )
  };
}

function normalizeKpiDetailHistoryItem(
  raw: unknown
): OrganizationHierarchyKpiDetailHistoryItem | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const month_label = pickString(o, ['month_label', 'monthLabel']);
  const cache_month = pickString(o, ['cache_month', 'cacheMonth']) || month_label;
  if (!month_label && !cache_month) {
    return null;
  }
  const valueRaw = o['value'];
  const value =
    valueRaw == null || valueRaw === ''
      ? null
      : Number.isFinite(Number(valueRaw))
        ? Number(valueRaw)
        : null;
  const fullValueRaw = o['full_value'] ?? o['fullValue'];
  const full_value =
    fullValueRaw == null || fullValueRaw === ''
      ? null
      : Number.isFinite(Number(fullValueRaw))
        ? Number(fullValueRaw)
        : null;

  return {
    cache_month,
    month_label: month_label || cache_month.slice(0, 7),
    mtd_start: pickString(o, ['mtd_start', 'mtdStart']),
    mtd_end: pickString(o, ['mtd_end', 'mtdEnd']),
    value,
    full_value
  };
}

export function normalizeOrganizationHierarchyKpiDetailResponse(
  raw: unknown
): OrganizationHierarchyKpiDetailResponse | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const kpi = pickString(o, ['kpi']) as OrgHierarchyKpiDetailKey;
  if (!kpi) {
    return null;
  }
  const history = Array.isArray(o['history'])
    ? o['history']
        .map(item => normalizeKpiDetailHistoryItem(item))
        .filter((item): item is OrganizationHierarchyKpiDetailHistoryItem => item != null)
    : [];

  return {
    kpi,
    kpi_label: pickString(o, ['kpi_label', 'kpiLabel']) || kpi,
    node_type: pickString(o, ['node_type', 'nodeType']),
    node_id: pickString(o, ['node_id', 'nodeId']),
    node_label: pickString(o, ['node_label', 'nodeLabel']),
    history,
    client_lists: normalizeOrgHierarchyClientLists(o['client_lists'] ?? o['clientLists'])
  };
}

export function supportsOrgHierarchyClientListKpi(kpi: OrgHierarchyKpiDetailKey): boolean {
  return ORG_HIERARCHY_CLIENT_LIST_KPIS.has(kpi);
}

/** Só dispara `/kpi-detail` com `client_lists` para tags (G4 / onboarding / churn). */
export function shouldFetchOrgHierarchyClientLists(
  kpi: OrgHierarchyKpiDetailKey | undefined | null,
  initialClientListKey?: OrgHierarchyClientListKey | null
): boolean {
  if (!kpi) {
    return false;
  }
  if (initialClientListKey && ORG_HIERARCHY_TAG_CLIENT_LIST_KEYS.has(initialClientListKey)) {
    return true;
  }
  return (
    kpi === 'clients_acessorias_g4' ||
    kpi === 'clients_acessorias_onboarding' ||
    kpi === 'clients_acessorias_risco_de_churn'
  );
}

export function isOrgHierarchyTagClientListKey(
  key: OrgHierarchyClientListKey | null | undefined
): key is Exclude<OrgHierarchyClientListKey, 'clients_served'> {
  return !!key && ORG_HIERARCHY_TAG_CLIENT_LIST_KEYS.has(key);
}

export function getDefaultClientListKeyForKpi(kpi: OrgHierarchyKpiDetailKey): OrgHierarchyClientListKey {
  if (
    kpi === 'clients_acessorias_g4' ||
    kpi === 'clients_acessorias_onboarding' ||
    kpi === 'clients_acessorias_risco_de_churn'
  ) {
    return kpi;
  }
  return 'clients_served';
}

export function getOrgHierarchyClientListLabel(key: OrgHierarchyClientListKey): string {
  return CLIENT_LIST_LABELS[key];
}

export function getClientListItems(
  clientLists: OrgHierarchyClientLists | undefined | null,
  key: OrgHierarchyClientListKey
): OrgHierarchyClientListItem[] {
  return clientLists?.[key] ?? [];
}

export function hasOrgHierarchyClientLists(
  clientLists: OrgHierarchyClientLists | undefined | null
): boolean {
  if (!clientLists) {
    return false;
  }
  return (
    clientLists.clients_served.length > 0 ||
    clientLists.clients_acessorias_g4.length > 0 ||
    clientLists.clients_acessorias_onboarding.length > 0 ||
    clientLists.clients_acessorias_risco_de_churn.length > 0
  );
}

export function buildOrgHierarchyClientListTabs(
  clientLists: OrgHierarchyClientLists | undefined | null,
  options?: { includeAllServed?: boolean }
): OrgHierarchyClientListTab[] {
  if (!clientLists) {
    return [];
  }
  const keys = (
    options?.includeAllServed
      ? (Object.keys(CLIENT_LIST_LABELS) as OrgHierarchyClientListKey[])
      : Array.from(ORG_HIERARCHY_TAG_CLIENT_LIST_KEYS)
  ) as OrgHierarchyClientListKey[];

  return keys
    .map(key => ({
      key,
      label: CLIENT_LIST_LABELS[key],
      count: getClientListItems(clientLists, key).length
    }))
    .filter(tab => tab.count > 0);
}

export function formatOrgHierarchyClientListTags(item: OrgHierarchyClientListItem): string {
  const tags: string[] = [];
  if (item.is_acessorias_g4) {
    tags.push('G4');
  }
  if (item.is_acessorias_onboarding) {
    tags.push('Onboarding');
  }
  if (item.is_acessorias_risco_de_churn) {
    tags.push('Risco churn');
  }
  return tags.join(', ');
}

function normalizeSearchTerm(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function filterOrgHierarchyClientListItems(
  items: OrgHierarchyClientListItem[],
  searchTerm: string
): OrgHierarchyClientListItem[] {
  const term = normalizeSearchTerm(searchTerm);
  if (!term) {
    return items;
  }
  return items.filter(item => {
    const haystack = normalizeSearchTerm(
      [
        item.company_name,
        item.company_serve_key,
        item.player_name,
        item.player_email,
        item.diretor_name,
        item.gerente_name,
        item.supervisor_name,
        formatOrgHierarchyClientListTags(item)
      ]
        .filter((value): value is string => !!value && value.trim().length > 0)
        .join(' ')
    );
    return haystack.includes(term);
  });
}

export function mapOrgHierarchyClientListForExport(
  items: OrgHierarchyClientListItem[],
  options: { includeTags: boolean }
): Record<string, string>[] {
  return items.map(item => {
    const row: Record<string, string> = {
      Cliente: item.company_name,
      'CNPJ / ID': item.company_serve_key,
      Diretoria: item.diretor_name ?? '',
      Gerência: item.gerente_name ?? '',
      Supervisão: item.supervisor_name ?? '',
      Colaborador: item.player_name ?? item.player_email ?? '',
      'E-mail colaborador': item.player_email ?? ''
    };
    if (options.includeTags) {
      row['Tags'] = formatOrgHierarchyClientListTags(item);
    }
    return row;
  });
}

export function buildOrgHierarchyClientListExportFilename(options: {
  listKey: OrgHierarchyClientListKey;
  month: Date;
  scopeLabel?: string | null;
  format: 'csv' | 'xlsx';
  filtered?: boolean;
}): string {
  const monthLabel = `${options.month.getFullYear()}-${String(options.month.getMonth() + 1).padStart(2, '0')}`;
  const scopeSlug = slugifyExportFilenamePart(options.scopeLabel);
  const filterSuffix = options.filtered ? '-filtrado' : '';
  const extension = options.format === 'csv' ? '.csv' : '.xlsx';
  const subjectSlug = CLIENT_LIST_EXPORT_SLUGS[options.listKey];
  return `relatorio-organizacional-${subjectSlug}-${monthLabel}-${scopeSlug}${filterSuffix}${extension}`;
}
