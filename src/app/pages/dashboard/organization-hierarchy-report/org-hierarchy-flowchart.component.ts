import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  OnChanges,
  SimpleChanges
} from '@angular/core';
import panzoom, { PanZoom } from 'panzoom';
import { OrgHierarchyNode, OrgHierarchyNodeType, OrgHierarchyKpiDetailKey } from '@model/game4u-api.model';
import {
  formatHighlightMtdMetricValue,
  getOrgHierarchyNodeTypeLabel,
  getOrgHierarchyCompareTone,
  formatOrgHierarchyComparePct
} from '@services/org-hierarchy-report.mapper';

@Component({
  selector: 'c4u-org-hierarchy-flowchart',
  templateUrl: './org-hierarchy-flowchart.component.html',
  styleUrls: ['./org-hierarchy-flowchart.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class C4uOrgHierarchyFlowchartComponent implements AfterViewInit, OnDestroy, OnChanges {
  @Input() root!: OrgHierarchyNode;
  @Input() expandedIds = new Set<string>();
  @Input() searchHighlightIds = new Set<string>();

  @Output() toggleNode = new EventEmitter<string>();
  @Output() expandAll = new EventEmitter<void>();
  @Output() collapseAll = new EventEmitter<void>();
  @Output() kpiClick = new EventEmitter<{
    kpi: OrgHierarchyKpiDetailKey;
    nodeType: OrgHierarchyNodeType;
    nodeId: string;
    nodeLabel: string;
  }>();
  @Output() searchChange = new EventEmitter<string>();
  @Output() selectNode = new EventEmitter<string>();

  @ViewChild('viewport') viewportRef?: ElementRef<HTMLElement>;
  @ViewChild('stage') stageRef?: ElementRef<HTMLElement>;

  searchQuery = '';
  selectedNodeId: string | null = null;
  zoomLevel = 1;
  isPanning = false;

  readonly minZoom = 0.3;
  readonly maxZoom = 2.5;
  readonly zoomStep = 1.2;

  readonly legendItems = [
    { type: 'organization', label: 'Organização', color: '#6366f1' },
    { type: 'c_level', label: 'C-Level', color: '#6366f1' },
    { type: 'segmentacao', label: 'Área', color: '#818cf8' },
    { type: 'diretoria', label: 'Diretoria', color: '#8b5cf6' },
    { type: 'gerencia', label: 'Gerência', color: '#0ea5e9' },
    { type: 'supervisao', label: 'Supervisão', color: '#10b981' },
    { type: 'player', label: 'Colaborador', color: '#64748b' }
  ] as const;

  private panZoomInstance: PanZoom | null = null;
  private wheelHandler: ((event: WheelEvent) => void) | null = null;
  private fitTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly cdr: ChangeDetectorRef) {}

  get selectedNode(): OrgHierarchyNode | null {
    if (!this.selectedNodeId || !this.root) {
      return null;
    }
    return this.findNode(this.root, this.selectedNodeId);
  }

  get hasSearch(): boolean {
    return this.searchQuery.trim().length > 0;
  }

  get zoomPercentLabel(): string {
    return `${Math.round(this.zoomLevel * 100)}%`;
  }

  ngAfterViewInit(): void {
    this.initPanzoom();
    this.scheduleFitToView();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['expandedIds'] && !changes['expandedIds'].firstChange) {
      this.scheduleFitToView();
    }
  }

  ngOnDestroy(): void {
    if (this.fitTimer) {
      clearTimeout(this.fitTimer);
    }
    this.disposePanzoom();
  }

  onSearchInput(raw: string): void {
    this.searchQuery = raw;
    this.searchChange.emit(raw);
    this.cdr.markForCheck();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchChange.emit('');
    this.cdr.markForCheck();
  }

  onNodeSelect(nodeId: string): void {
    this.selectedNodeId = nodeId;
    this.selectNode.emit(nodeId);
    this.cdr.markForCheck();
  }

  zoomIn(): void {
    this.zoomAtCenter(this.zoomStep);
  }

  zoomOut(): void {
    this.zoomAtCenter(1 / this.zoomStep);
  }

  resetZoom(): void {
    if (!this.panZoomInstance || !this.viewportRef) {
      return;
    }
    const viewport = this.viewportRef.nativeElement;
    const cx = viewport.clientWidth / 2;
    const cy = viewport.clientHeight / 2;
    this.panZoomInstance.zoomAbs(cx, cy, 1);
    this.panZoomInstance.moveTo(0, 0);
    this.syncZoomLevel();
  }

  fitToView(): void {
    const viewport = this.viewportRef?.nativeElement;
    const stage = this.stageRef?.nativeElement;
    const panZoom = this.panZoomInstance;
    if (!viewport || !stage || !panZoom) {
      return;
    }

    panZoom.moveTo(0, 0);
    panZoom.zoomAbs(0, 0, 1);

    const padding = 32;
    const vw = Math.max(viewport.clientWidth - padding * 2, 120);
    const vh = Math.max(viewport.clientHeight - padding * 2, 120);
    const sw = stage.offsetWidth;
    const sh = stage.offsetHeight;

    if (sw <= 0 || sh <= 0) {
      return;
    }

    const scale = Math.min(vw / sw, vh / sh, 1);
    const clampedScale = Math.max(this.minZoom, Math.min(this.maxZoom, scale));
    const cx = viewport.clientWidth / 2;
    const cy = viewport.clientHeight / 2;

    panZoom.zoomAbs(cx, cy, clampedScale);
    const transform = panZoom.getTransform();
    panZoom.moveTo(
      (viewport.clientWidth - sw * transform.scale) / 2,
      Math.max(padding / 2, (viewport.clientHeight - sh * transform.scale) / 2)
    );
    this.syncZoomLevel();
  }

  formatPoints(node: OrgHierarchyNode): string {
    return formatHighlightMtdMetricValue(node.mtd?.points_delivered, 'number');
  }

  formatOnTime(node: OrgHierarchyNode): string {
    return formatHighlightMtdMetricValue(node.mtd?.on_time_pct, 'pct');
  }

  formatFinished(node: OrgHierarchyNode): string {
    return formatHighlightMtdMetricValue(node.mtd?.finished, 'number');
  }

  formatPending(node: OrgHierarchyNode): string {
    return formatHighlightMtdMetricValue(node.mtd?.pending_open, 'number');
  }

  nodeTypeLabel(node: OrgHierarchyNode): string {
    return getOrgHierarchyNodeTypeLabel(node.node_type);
  }

  mtdComparePct(node: OrgHierarchyNode): string {
    return formatOrgHierarchyComparePct(node.compare?.vs_prev_mtd_points_pct);
  }

  mtdCompareTone(node: OrgHierarchyNode): 'positive' | 'negative' | 'neutral' {
    return getOrgHierarchyCompareTone(node.compare?.vs_prev_mtd_points_pct);
  }

  onTimeTone(node: OrgHierarchyNode): 'success' | 'warning' | 'danger' | 'neutral' {
    const pct = node.mtd?.on_time_pct;
    if (pct == null || !Number.isFinite(pct)) {
      return 'neutral';
    }
    if (pct >= 90) {
      return 'success';
    }
    if (pct >= 70) {
      return 'warning';
    }
    return 'danger';
  }

  private initPanzoom(): void {
    const stage = this.stageRef?.nativeElement;
    const viewport = this.viewportRef?.nativeElement;
    if (!stage || !viewport) {
      return;
    }

    this.disposePanzoom();

    this.panZoomInstance = panzoom(stage, {
      maxZoom: this.maxZoom,
      minZoom: this.minZoom,
      smoothScroll: false,
      filterKey: () => false,
      beforeWheel: () => true,
      beforeMouseDown: (event: MouseEvent) => {
        const target = event.target as HTMLElement | null;
        if (!target) {
          return false;
        }
        return !!target.closest('button, input, textarea, a, .org-flowchart-card');
      }
    });

    this.panZoomInstance.on('panstart', () => {
      this.isPanning = true;
      this.cdr.markForCheck();
    });

    this.panZoomInstance.on('panend', () => {
      this.isPanning = false;
      this.cdr.markForCheck();
    });

    this.panZoomInstance.on('zoom', () => this.syncZoomLevel());
    this.panZoomInstance.on('pan', () => this.cdr.markForCheck());

    this.wheelHandler = (event: WheelEvent) => {
      const panZoom = this.panZoomInstance;
      const viewport = this.viewportRef?.nativeElement;
      if (!panZoom || !viewport) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest('.org-flowchart-zoom')) {
        return;
      }
      event.preventDefault();
      const multiplier = event.deltaY > 0 ? 1 / this.zoomStep : this.zoomStep;
      panZoom.zoomTo(event.clientX, event.clientY, multiplier);
      this.syncZoomLevel();
    };
    viewport.addEventListener('wheel', this.wheelHandler, { passive: false });
    this.syncZoomLevel();
  }

  private disposePanzoom(): void {
    const viewport = this.viewportRef?.nativeElement;
    if (viewport && this.wheelHandler) {
      viewport.removeEventListener('wheel', this.wheelHandler);
    }
    this.wheelHandler = null;
    this.panZoomInstance?.dispose();
    this.panZoomInstance = null;
  }

  private zoomAtCenter(factor: number): void {
    const viewport = this.viewportRef?.nativeElement;
    const panZoom = this.panZoomInstance;
    if (!viewport || !panZoom) {
      return;
    }
    const cx = viewport.clientWidth / 2;
    const cy = viewport.clientHeight / 2;
    panZoom.smoothZoom(cx, cy, factor);
  }

  private syncZoomLevel(): void {
    if (!this.panZoomInstance) {
      return;
    }
    this.zoomLevel = this.panZoomInstance.getTransform().scale;
    this.cdr.markForCheck();
  }

  private scheduleFitToView(): void {
    if (this.fitTimer) {
      clearTimeout(this.fitTimer);
    }
    this.fitTimer = setTimeout(() => {
      this.fitTimer = null;
      this.fitToView();
    }, 80);
  }

  private findNode(node: OrgHierarchyNode, nodeId: string): OrgHierarchyNode | null {
    if (node.node_id === nodeId) {
      return node;
    }
    for (const child of node.children ?? []) {
      const found = this.findNode(child, nodeId);
      if (found) {
        return found;
      }
    }
    return null;
  }
}
