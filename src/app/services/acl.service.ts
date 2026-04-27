import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, catchError, tap, shareReplay } from 'rxjs/operators';
import { FunifierApiService } from './funifier-api.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
/**
 * Catalog item entry from the Player Status API response.
 * Each entry represents a Virtual Good the player may possess.
 */
export interface CatalogItem {
  quantity: number;
  item: string;
}

/**
 * Shape of catalog_items from GET /v3/player/:id/status.
 * Values can be either nested objects { quantity, item } or plain numbers.
 */
export type CatalogItems = Record<string, CatalogItem | number>;

/**
 * Entry from the acl__c custom collection.
 * Correlates team names/IDs with virtual good names/IDs.
 */
export interface AclMetadata {
  team_name: string;
  team_id: string;
  virtual_good_name: string;
  virtual_good_id: string;
}

/**
 * Cached ACL result with timestamp for TTL-based invalidation.
 */
interface ACLCacheEntry {
  catalogItems: CatalogItems;
  timestamp: number;
}

/**
 * ACL Service — Virtual Good-based access control.
 *
 * Determines which Operational Teams a player can access by inspecting
 * the `catalog_items` object returned from the Player Status API.
 *
 * Key rules:
 * - quantity > 0  → access granted
 * - quantity <= 0 or entry absent → access denied
 * - IDs are case-sensitive (no normalisation)
 * - Zero-Mapping: team_id === virtual_good_id (no conversion)
 * - Results cached for 5 minutes
 * - On API failure → empty access (deny management features)
 */
@Injectable({ providedIn: 'root' })
export class ACLService {
  /** Cache TTL: 5 minutes */
  private readonly CACHE_DURATION = 5 * 60 * 1000;

  /** Per-player cache keyed by playerId */
  private cache = new Map<string, ACLCacheEntry>();

  /** Session-level cache for ACL metadata (rarely changes, cleared on logout) */
  private metadataCache$: Observable<AclMetadata[]> | null = null;

  constructor(
    private funifierApi: FunifierApiService,
    private sessao: SessaoProvider
  ) {}

  /**
   * Fetch catalog_items from the Player Status API.
   *
   * Returns the raw catalog_items record. Uses an in-memory cache
   * with a 5-minute TTL to reduce API calls.
   *
   * On API failure or missing/malformed catalog_items, returns an
   * empty record (deny all access).
   */
  getPlayerCatalogItems(playerId: string): Observable<CatalogItems> {
    const cached = this.cache.get(playerId);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < this.CACHE_DURATION) {
      return of(cached.catalogItems);
    }

    return this.funifierApi.get<any>(`/v3/player/${playerId}/status`).pipe(
      map(response => {
        const items = this.extractCatalogItems(response);
        this.cache.set(playerId, { catalogItems: items, timestamp: Date.now() });
        return items;
      }),
      catchError(error => {
        console.error('[ACLService] Failed to fetch player status for ACL verification:', error);
        return of({} as CatalogItems);
      })
    );
  }

  /**
   * Get the list of team IDs the player has access to.
   *
   * Returns Virtual Good IDs where quantity > 0 (case-sensitive).
   */
  getAccessibleTeamIds(playerId: string): Observable<string[]> {
    return this.getPlayerCatalogItems(playerId).pipe(
      map(catalogItems => this.extractAccessibleIds(catalogItems))
    );
  }

  /**
   * Check whether a player has access to a specific team.
   *
   * Uses case-sensitive lookup. Returns false if the entry is
   * absent or has quantity <= 0.
   */
  hasTeamAccess(playerId: string, teamId: string): Observable<boolean> {
    return this.getPlayerCatalogItems(playerId).pipe(
      map(catalogItems => this.checkAccess(catalogItems, teamId))
    );
  }

  /**
   * Fetch ACL metadata from the acl__c custom collection.
   *
   * Returns entries correlating team names/IDs with virtual good names/IDs.
   * Cached indefinitely per session (metadata rarely changes).
   * On error, returns empty array and logs a warning.
   */
  getAclMetadata(): Observable<AclMetadata[]> {
    if (this.metadataCache$) {
      return this.metadataCache$;
    }

    this.metadataCache$ = this.funifierApi.post<AclMetadata[]>(
      '/v3/database/acl__c/aggregate?strict=true',
      [{ $sort: { team_name: 1 } }]
    ).pipe(
      map(response => {
        if (!Array.isArray(response)) {
          console.warn('[ACLService] acl__c returned non-array response, falling back to empty metadata');
          return [];
        }
        return response;
      }),
      catchError(error => {
        console.warn('[ACLService] Failed to fetch ACL metadata from acl__c, falling back to raw IDs:', error);
        return of([] as AclMetadata[]);
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );

    return this.metadataCache$;
  }

  /**
   * Resolve a human-readable team display name from metadata.
   *
   * Looks up the team_name for the given teamId in the acl__c metadata.
   * Falls back to the raw teamId if metadata is unavailable or the
   * team is not found.
   */
  getTeamDisplayName(teamId: string): Observable<string> {
    return this.getAclMetadata().pipe(
      map(metadata => {
        const entry = metadata.find(m => m.team_id === teamId);
        return entry ? entry.team_name : teamId;
      })
    );
  }

  /**
   * Clear the entire ACL cache, or for a specific player.
   */
  clearCache(playerId?: string): void {
    if (playerId) {
      this.cache.delete(playerId);
    } else {
      this.cache.clear();
      this.metadataCache$ = null;
    }
  }

  // ── Pure helpers (also exported for testing) ──────────────────────

  /**
   * Safely extract catalog_items from a player status response.
   * Returns empty record if missing or malformed.
   */
  private extractCatalogItems(response: any): CatalogItems {
    if (
      !response ||
      typeof response !== 'object' ||
      !response.catalog_items ||
      typeof response.catalog_items !== 'object' ||
      Array.isArray(response.catalog_items)
    ) {
      if (response && !response.catalog_items) {
        console.warn('[ACLService] catalog_items missing from player status response');
      }
      return {};
    }
    return response.catalog_items as CatalogItems;
  }

  /**
   * From a catalog_items record, return the IDs with quantity > 0.
   * Handles both formats:
   *   - Nested: { "id": { quantity: N, item: "..." } }
   *   - Flat:   { "id": N }
   */
  private extractAccessibleIds(catalogItems: CatalogItems): string[] {
    return Object.keys(catalogItems).filter(id => {
      const entry = catalogItems[id];
      if (entry && typeof entry === 'object' && typeof entry.quantity === 'number') {
        return entry.quantity > 0;
      }
      if (typeof entry === 'number') {
        return (entry as number) > 0;
      }
      return false;
    });
  }

  /**
   * Case-sensitive check: does the given teamId exist with quantity > 0?
   * Handles both nested ({ quantity: N }) and flat (N) formats.
   */
  private checkAccess(catalogItems: CatalogItems, teamId: string): boolean {
    const entry = catalogItems[teamId];
    if (entry && typeof entry === 'object' && typeof entry.quantity === 'number') {
      return entry.quantity > 0;
    }
    if (typeof entry === 'number') {
      return (entry as number) > 0;
    }
    return false;
  }
}
