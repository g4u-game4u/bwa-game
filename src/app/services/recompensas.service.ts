import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

export interface CatalogItem {
  _id?: string;
  catalogId: string;
  name: string;
  amount: number;
  active: boolean;
  image?: {
    small?: { 
      url: string;
      size?: number;
      width?: number;
      height?: number;
      depth?: number;
    };
    medium?: { 
      url: string;
      size?: number;
      width?: number;
      height?: number;
      depth?: number;
    };
    original?: { 
      url: string;
      size?: number;
      width?: number;
      height?: number;
      depth?: number;
    };
  };
  extra?: {
    category?: string;
    brand?: string;
    [key: string]: any;
  };
  requires?: Array<{
    total: number;
    type: number;
    item: string;
    operation: number;
    extra?: any;
    restrict: boolean;
    perPlayer: boolean;
  }>;
  rewards?: Array<{
    type: string;
    value: number;
  }>;
  notifications?: Array<{
    type: string;
    template: string;
  }>;
  i18n?: {
    [locale: string]: {
      name?: string;
      [key: string]: any;
    };
  };
  techniques?: string[];
  owned?: number;
}

export interface Catalog {
  _id: string;
  catalog: string;
  itens?: CatalogItem[];
  extra?: any;
  created?: number;
  i18n?: any;
}

export interface CatalogResponse {
  data: Catalog[];
}

export interface ItemResponse {
  data: CatalogItem[];
}

export interface PurchaseRequest {
  item: string;
  player: string;
  extra?: {
    upgrade?: string;
    [key: string]: any;
  };
}

export interface PurchaseResponse {
  milliseconds: {
    init: number;
    debits: number;
    credits: number;
    verify: number;
    trigger: number;
    notify: number;
    status: number;
    [key: string]: number;
  };
  achievements: Array<{
    player: string;
    total: number;
    type: number;
    item: string;
    time: number;
    extra?: {
      origin?: string;
      [key: string]: any;
    };
    _id: string;
  }>;
  restrictions: any[];
  status: string;
}

export interface Achievement {
  _id: string;
  player: string;
  total: number;
  type: number;
  item: string;
  time: number;
}

export type AchievementResponse = Achievement[];

@Injectable({ providedIn: 'root' })
export class RecompensasService {
  private baseUrl = environment.backend_url_base;

  constructor(private http: HttpClient) {}

  listCatalogs(): Observable<CatalogResponse> {
    const url = `${this.baseUrl}/reward-store/catalog`;
    return this.http.get<CatalogResponse>(url);
  }

  listItems(): Observable<ItemResponse> {
    const url = `${this.baseUrl}/reward-store/item`;
    return this.http.get<ItemResponse>(url);
  }

  // Método para criar compra de recompensa
  createPurchase(purchaseRequest: PurchaseRequest): Observable<PurchaseResponse> {
    const url = `${this.baseUrl}/reward-store/purchase/create`;
    return this.http.post<PurchaseResponse>(url, purchaseRequest);
  }

  listAchievements(): Observable<AchievementResponse> {
    const url = `${this.baseUrl}/reward-store/purchase/list`;
    return this.http.get<AchievementResponse>(url);
  }

  listAllAchievements(): Observable<AchievementResponse> {
    const url = `${this.baseUrl}/reward-store/purchase/list-all`;
    return this.http.get<AchievementResponse>(url);
  }


  // listItemsFunifier() {
  //   return this.fetchFunifier('/virtualgoods/item');
  // }
} 