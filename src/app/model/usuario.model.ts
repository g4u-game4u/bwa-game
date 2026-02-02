export interface Usuario {
  _id?: string;           // Funifier uses email as _id
  user_id?: string;
  created_at?: string;
  email?: string;
  avatar_url?: string;
  full_name?: string;
  name?: string;          // Funifier field
  deactivated_at?: string | null;
  roles: string[];
  team_id?: number;
  extra?: Record<string, any>;  // Funifier extra data
  pointCategories?: Record<string, number>;  // Funifier points
  teams?: string[];       // Funifier teams array - contains team IDs as strings
}
