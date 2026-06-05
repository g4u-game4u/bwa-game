import { Component, Input, OnInit, OnDestroy, OnChanges, SimpleChanges, ElementRef, ViewChild } from '@angular/core';
import { HelpTextsService } from '@services/help-texts.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'c4u-info-button',
  templateUrl: './c4u-info-button.component.html',
  styleUrls: ['./c4u-info-button.component.scss']
})
export class C4uInfoButtonComponent implements OnInit, OnDestroy, OnChanges {
  @Input() infoKey: string = '';
  @Input() customText: string = ''; // Optional custom text that overrides help-texts
  @Input() position: 'top' | 'bottom' | 'left' | 'right' = 'bottom';
  /** Alinhamento do tooltip em relação ao botão (`start` / `end` nos eixos secundários). */
  @Input() align: 'center' | 'start' | 'end' = 'center';
  @Input() tooltipGap = 4;
  /** Segue o ponteiro; respeita `position` (ex.: `bottom` = abaixo do cursor, como `top` acima do botão). */
  @Input() tooltipAnchor: 'button' | 'cursor' = 'button';
  @ViewChild('buttonWrapper', { static: false }) buttonWrapper?: ElementRef;
  @ViewChild('infoButton', { static: false }) infoButton?: ElementRef;
  
  helpText: string = '';
  showTooltip: boolean = false;
  computedPosition: 'top' | 'bottom' | 'left' | 'right' = 'bottom';
  tooltipStyle: { [key: string]: string } = {};
  private subscription?: Subscription;
  private pointerX = 0;
  private pointerY = 0;
  private readonly TOOLTIP_ESTIMATED_WIDTH = 280;

  constructor(private helpTextsService: HelpTextsService) {}

  ngOnInit(): void {
    this.updateHelpText();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Update help text when customText or infoKey changes
    if (changes['customText'] || changes['infoKey']) {
      this.updateHelpText();
    }
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  /**
   * Update help text based on customText or infoKey
   */
  private updateHelpText(): void {
    if (this.customText) {
      // If customText is provided, load default text and prepend customText
      this.subscription?.unsubscribe();
      this.subscription = this.helpTextsService.getHelpText(this.infoKey)
        .subscribe(text => {
          // Combine custom text (e.g., "100 de 10") with default help text
          this.helpText = `${this.customText}. ${text}`;
        });
    } else {
      // Load from help-texts service only
      this.loadHelpText();
    }
  }

  private loadHelpText(): void {
    this.subscription?.unsubscribe();
    this.subscription = this.helpTextsService.getHelpText(this.infoKey)
      .subscribe(text => {
        this.helpText = text;
      });
  }

  onMouseEnter(event: MouseEvent): void {
    this.updatePointer(event);
    this.calculatePosition();
    this.showTooltip = true;
  }

  onMouseMove(event: MouseEvent): void {
    if (!this.showTooltip || this.tooltipAnchor !== 'cursor') {
      return;
    }
    this.updatePointer(event);
    this.calculatePosition();
  }

  onMouseLeave(): void {
    this.showTooltip = false;
  }

  private updatePointer(event: MouseEvent): void {
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
  }

  onClick(event: Event): void {
    event.stopPropagation();
  }

  /**
   * Calculate the best position for the tooltip based on available space
   * Default behavior: always show below, only show above if there's not enough space below
   * Uses fixed positioning to avoid being clipped by parent overflow
   */
  private calculatePosition(): void {
    const baseStyle: { [key: string]: string } = {
      position: 'fixed',
      zIndex: '999999'
    };

    if (this.tooltipAnchor === 'cursor') {
      this.tooltipStyle = this.buildCursorAnchoredStyle(baseStyle);
      return;
    }

    // Prefer using the button element itself for more accurate positioning
    const targetElement = this.infoButton?.nativeElement || this.buttonWrapper?.nativeElement;
    
    if (!targetElement) {
      // Default to bottom
      this.computedPosition = this.position;
      this.tooltipStyle = {
        position: 'fixed'
      };
      return;
    }

    const rect = targetElement.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const gap = this.tooltipGap;
    const MIN_SPACE = 120;

    if (this.position === 'top' || this.position === 'bottom') {
      const spaceBelow = viewportHeight - rect.bottom;
      const showBelow = this.position === 'bottom' && spaceBelow >= MIN_SPACE;
      const showAbove = this.position === 'top' || !showBelow;
      this.computedPosition = showAbove ? 'top' : 'bottom';

      const horizontal = this.getHorizontalPlacement(rect);
      if (showAbove) {
        this.tooltipStyle = {
          ...baseStyle,
          top: `${rect.top - gap}px`,
          left: horizontal.left,
          transform: horizontal.transformAbove
        };
      } else {
        this.tooltipStyle = {
          ...baseStyle,
          top: `${rect.bottom + gap}px`,
          left: horizontal.left,
          transform: horizontal.transformBelow
        };
      }
      return;
    }

    if (this.position === 'left' || this.position === 'right') {
      const spaceRight = viewportWidth - rect.right;
      const showRight = this.position === 'right' && spaceRight >= MIN_SPACE;
      const showLeft = this.position === 'left' || !showRight;
      this.computedPosition = showLeft ? 'left' : 'right';

      const vertical = this.getVerticalPlacement(rect);
      if (showLeft) {
        this.tooltipStyle = {
          ...baseStyle,
          left: `${rect.left - gap}px`,
          top: vertical.top,
          transform: vertical.transformLeft
        };
      } else {
        this.tooltipStyle = {
          ...baseStyle,
          left: `${rect.right + gap}px`,
          top: vertical.top,
          transform: vertical.transformRight
        };
      }
      return;
    }

    const horizontal = this.getHorizontalPlacement(rect);
    this.computedPosition = 'bottom';
    this.tooltipStyle = {
      ...baseStyle,
      top: `${rect.bottom + gap}px`,
      left: horizontal.left,
      transform: horizontal.transformBelow
    };
  }

  /**
   * Mesmo layout dos botões da sidebar (`position="top"` centrado no botão),
   * mas ancorado no cursor — ex.: `position="bottom"` abre abaixo do ponteiro.
   */
  private buildCursorAnchoredStyle(
    baseStyle: { [key: string]: string }
  ): { [key: string]: string } {
    const gap = this.tooltipGap;
    const centerX = this.clampCursorCenterX(this.pointerX);

    if (this.position === 'top') {
      this.computedPosition = 'top';
      return {
        ...baseStyle,
        top: `${this.pointerY - gap}px`,
        left: `${centerX}px`,
        transform: 'translate(-50%, -100%)'
      };
    }

    if (this.position === 'left') {
      this.computedPosition = 'left';
      return {
        ...baseStyle,
        left: `${this.pointerX - gap}px`,
        top: `${this.pointerY}px`,
        transform: 'translate(-100%, -50%)'
      };
    }

    if (this.position === 'right') {
      this.computedPosition = 'right';
      return {
        ...baseStyle,
        left: `${this.pointerX + gap}px`,
        top: `${this.pointerY}px`,
        transform: 'translateY(-50%)'
      };
    }

    this.computedPosition = 'bottom';
    return {
      ...baseStyle,
      top: `${this.pointerY + gap}px`,
      left: `${centerX}px`,
      transform: 'translateX(-50%)'
    };
  }

  private clampCursorCenterX(centerX: number): number {
    const edge = 8;
    const half = this.TOOLTIP_ESTIMATED_WIDTH / 2;
    return Math.max(edge + half, Math.min(window.innerWidth - edge - half, centerX));
  }

  private getHorizontalPlacement(rect: DOMRect): {
    left: string;
    transformBelow: string;
    transformAbove: string;
  } {
    const centerX = rect.left + rect.width / 2;
    if (this.align === 'start') {
      return {
        left: `${rect.left}px`,
        transformBelow: 'none',
        transformAbove: 'translateY(-100%)'
      };
    }
    if (this.align === 'end') {
      const edge = 8;
      const preferredWidth = 280;
      const maxWidth = Math.min(preferredWidth, rect.right - edge);
      const left = Math.max(edge, rect.right - maxWidth);
      return {
        left: `${left}px`,
        transformBelow: 'none',
        transformAbove: 'translateY(-100%)'
      };
    }
    return {
      left: `${centerX}px`,
      transformBelow: 'translateX(-50%)',
      transformAbove: 'translate(-50%, -100%)'
    };
  }

  private getVerticalPlacement(rect: DOMRect): {
    top: string;
    transformLeft: string;
    transformRight: string;
  } {
    const centerY = rect.top + rect.height / 2;
    if (this.align === 'start') {
      return {
        top: `${rect.top}px`,
        transformLeft: 'translate(-100%, 0)',
        transformRight: 'none'
      };
    }
    if (this.align === 'end') {
      return {
        top: `${rect.bottom}px`,
        transformLeft: 'translate(-100%, -100%)',
        transformRight: 'translateY(-100%)'
      };
    }
    return {
      top: `${centerY}px`,
      transformLeft: 'translate(-100%, -50%)',
      transformRight: 'translateY(-50%)'
    };
  }

}

