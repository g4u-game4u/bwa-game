import { Component, Input, ChangeDetectionStrategy, ChangeDetectorRef, OnChanges } from '@angular/core';
import { GameRulesUpdateAnnouncement, GameRulesUpdateAudience } from '@model/game-rules-update.model';
import { GameRulesUpdateService } from '@services/game-rules-update.service';

@Component({
  selector: 'c4u-game-rules-update-banner',
  templateUrl: './c4u-game-rules-update-banner.component.html',
  styleUrls: ['./c4u-game-rules-update-banner.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class C4uGameRulesUpdateBannerComponent implements OnChanges {
  @Input() selectedMonth: Date | undefined;
  @Input() audience: GameRulesUpdateAudience = 'player';

  visibleAnnouncements: GameRulesUpdateAnnouncement[] = [];

  constructor(
    private readonly gameRulesUpdateService: GameRulesUpdateService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnChanges(): void {
    this.refreshAnnouncements();
  }

  dismiss(announcement: GameRulesUpdateAnnouncement): void {
    this.gameRulesUpdateService.dismissAnnouncement(announcement.id);
    this.refreshAnnouncements();
  }

  trackByAnnouncementId(_index: number, item: GameRulesUpdateAnnouncement): string {
    return item.id;
  }

  private refreshAnnouncements(): void {
    this.visibleAnnouncements = this.gameRulesUpdateService.getVisibleAnnouncements(
      this.selectedMonth,
      this.audience
    );
    this.cdr.markForCheck();
  }
}
