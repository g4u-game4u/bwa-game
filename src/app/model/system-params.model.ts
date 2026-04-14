export interface SystemParamValue {
  value: any;
  inherited: boolean;
}

export interface RewardTier {
  id: SystemParamValue;
  goal: {
    max: SystemParamValue;
    min: SystemParamValue;
  };
  label: SystemParamValue;
  percent: SystemParamValue;
}

export interface FreeChallengeAllowedTeam {
  allowed: SystemParamValue;
  team_id: SystemParamValue;
  team_name: SystemParamValue;
}

export interface FreeChallengeAllowedRole {
  role: SystemParamValue;
  allowed: SystemParamValue;
}

export interface SystemParams {
  max_level: SystemParamValue;
  client_name: SystemParamValue;
  coins_alias: SystemParamValue;
  action_alias: SystemParamValue;
  points_alias: SystemParamValue;
  reward_rules: {
    tiers: RewardTier[];
  };
  default_theme: SystemParamValue;
  enable_mascot: SystemParamValue;
  primary_color: SystemParamValue;
  delivery_alias: SystemParamValue;
  mascot_img_url: SystemParamValue;
  season_end_date: SystemParamValue;
  secondary_color: SystemParamValue;
  default_language: SystemParamValue;
  points_per_level: SystemParamValue;
  enable_challenges: SystemParamValue;
  season_start_date: SystemParamValue;
  team_monthly_goal: SystemParamValue;
  /**
   * Meta mensal (R$) para o time do financeiro (team id Game4U: 6).
   * Opcional para manter compatibilidade com ambientes que ainda não têm esse parâmetro.
   */
  financeiro_monthly_billing_goal?: SystemParamValue;
  /**
   * ID do goal template Game4U usado no KPI circular «Valor concedido» (GET /goals/logs?goal_template_id=).
   * Opcional; quando ausente, o cliente tenta identificar o template pela lista GET /goals/templates.
   */
  receita_concedida_goal_template_id?: SystemParamValue;
  /** URL GET do JSON omie_painel_recebiveis (modo A). Opcional. */
  financeiro_omie_painel_json_url?: SystemParamValue;
  /** URL GET do export omie_caixa_recebimentos (modo B — recalcular no cliente). Opcional. */
  financeiro_omie_caixa_json_url?: SystemParamValue;
  /** Filtro Omie: códigos de categoria separados por vírgula (ex.: 1.01.01,1.04.97). */
  financeiro_omie_categorias_codigos?: SystemParamValue;
  /** Filtro Omie: descrições exatas separadas por ; (case-insensitive no match). */
  financeiro_omie_categorias_desc?: SystemParamValue;
  allow_theme_switch: SystemParamValue;
  enable_achievements: SystemParamValue;
  enable_leaderboards: SystemParamValue;
  enable_update_notes: SystemParamValue;
  client_dark_logo_url: SystemParamValue;
  enable_virtual_store: SystemParamValue;
  points_exchange_rate: SystemParamValue;
  client_light_logo_url: SystemParamValue;
  delivery_redirect_url: SystemParamValue;
  language_multilingual: SystemParamValue;
  enable_social_features: SystemParamValue;
  individual_monthly_goal: SystemParamValue;
  user_action_redirect_url: SystemParamValue;
  client_login_background_url: SystemParamValue;
  team_redirect_urls: Record<string, {
    userActionRedirectUrl?: SystemParamValue;
    deliveryRedirectUrl?: SystemParamValue;
  }>;
  free_challenges_allowed_teams?: FreeChallengeAllowedTeam[];
  free_challenges_allowed_roles?: FreeChallengeAllowedRole[];
  restrict_free_challenges_by_role?: SystemParamValue;
} 