import { SystemFeatures } from '@services/features.service';
import { UserProfile } from '@utils/user-profile';

export type HelpCenterAudience = 'jogador' | 'supervisor';

export type HelpCenterTheme =
  | 'violet'
  | 'gold'
  | 'emerald'
  | 'cyan'
  | 'amber'
  | 'rose'
  | 'sky'
  | 'lime'
  | 'fuchsia';

export interface HelpCenterResourceLink {
  label: string;
  description: string;
  url: string;
  icon: string;
  theme: HelpCenterTheme;
}

export interface HelpCenterArticle {
  id: string;
  title: string;
  body: string;
  icon?: string;
  theme?: HelpCenterTheme;
}

export interface HelpCenterModule {
  slug: string;
  title: string;
  description: string;
  icon: string;
  theme: HelpCenterTheme;
  order: number;
  route?: string;
  audience?: HelpCenterAudience;
  roles?: UserProfile[];
  featureFlag?: keyof SystemFeatures;
  requiresOrgHierarchyAccess?: boolean;
  intro: string;
  articles: HelpCenterArticle[];
  resources?: HelpCenterResourceLink[];
  relatedSlugs?: string[];
}

export interface HelpCenterContent {
  modules: HelpCenterModule[];
}

export interface HelpCenterSearchResult {
  module: HelpCenterModule;
  matchedArticles: HelpCenterArticle[];
  matchType: 'module' | 'article';
}
