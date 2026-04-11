import zohoCrmActionMapJson from './zoho-crm-action-map.json';

export type ZohoStageResponsibleTeam = 'cs' | 'financeiro';

export type ZohoCrmActionMapFile = {
  _meta?: {
    description?: string;
    sourceFiles?: string[];
    stageResponsibleTeamNotes?: string;
  };
  stageTitleToActionTemplateId: Record<string, string>;
  /** Stage (valor novo no Zoho) → time; omissos tratam-se como cs (Owner). */
  stageResponsibleTeamOverrides?: Partial<Record<string, ZohoStageResponsibleTeam>>;
  tagFlowTitleToActionTemplateId: Record<string, string>;
};

const data = zohoCrmActionMapJson as ZohoCrmActionMapFile;

/** Valor atual do picklist Stage no Zoho (após a transição) → id do action template no Game4U. */
export const ZOHO_STAGE_TITLE_TO_ACTION_TEMPLATE_ID: Readonly<Record<string, string>> =
  data.stageTitleToActionTemplateId;

/** Títulos/descrições do fluxo por tag (Jurídico) → id do action template; uso futuro em zoho-tasks. */
export const ZOHO_TAG_FLOW_TITLE_TO_ACTION_TEMPLATE_ID: Readonly<Record<string, string>> =
  data.tagFlowTitleToActionTemplateId;

/** Resolve template a partir do **novo** nome do Stage retornado pelo Zoho em `field_history._value.new`. */
export function resolveActionTemplateIdFromZohoNewStageName(
  stageName: string | null | undefined
): string | null {
  const k = String(stageName ?? '').trim();
  if (!k) return null;
  return ZOHO_STAGE_TITLE_TO_ACTION_TEMPLATE_ID[k] ?? null;
}

/** Fluxo/tag (texto exatamente como no CRM) → action template. */
export function resolveActionTemplateIdFromZohoTagFlowTitle(
  title: string | null | undefined
): string | null {
  const k = String(title ?? '').trim();
  if (!k) return null;
  return ZOHO_TAG_FLOW_TITLE_TO_ACTION_TEMPLATE_ID[k] ?? null;
}
