import {
  getOnTimeDeliveryGoalForMonth,
  ON_TIME_DELIVERY_GOAL_CURRENT,
  ON_TIME_DELIVERY_GOAL_LEGACY
} from '@app/constants/on-time-delivery-goal';
import { GameRulesUpdateService } from './game-rules-update.service';

describe('GameRulesUpdateService', () => {
  let service: GameRulesUpdateService;

  beforeEach(() => {
    localStorage.clear();
    service = new GameRulesUpdateService();
  });

  it('should expose July 2026 on-time goal announcement for player audience', () => {
    const july = new Date(2026, 6, 1);
    jasmine.clock().install();
    try {
      jasmine.clock().mockDate(july);
      const items = service.getVisibleAnnouncements(july, 'player');

      expect(items.length).toBe(1);
      expect(items[0].title).toContain('Nova meta');
      expect(items[0].previousValueLabel).toBe(`${ON_TIME_DELIVERY_GOAL_LEGACY}%`);
      expect(items[0].newValueLabel).toBe(`${ON_TIME_DELIVERY_GOAL_CURRENT}%`);
      expect(items[0].body).toContain('95%');
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('should hide announcement before July 2026 on the calendar', () => {
    const june = new Date(2026, 5, 1);
    const july = new Date(2026, 6, 1);
    jasmine.clock().install();
    try {
      jasmine.clock().mockDate(june);
      expect(service.getVisibleAnnouncements(july, 'player')).toEqual([]);
      jasmine.clock().mockDate(july);
      expect(service.getVisibleAnnouncements(july, 'player').length).toBe(1);
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('should hide announcement before July 2026 in the filter', () => {
    const june = new Date(2026, 5, 1);
    jasmine.clock().install();
    try {
      jasmine.clock().mockDate(june);
      expect(service.getVisibleAnnouncements(june, 'player')).toEqual([]);
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('should hide announcement after dismiss', () => {
    const july = new Date(2026, 6, 1);
    jasmine.clock().install();
    try {
      jasmine.clock().mockDate(july);
      const [item] = service.getVisibleAnnouncements(july, 'team');
      service.dismissAnnouncement(item.id);
      expect(service.getVisibleAnnouncements(july, 'team')).toEqual([]);
    } finally {
      jasmine.clock().uninstall();
    }
  });
});

describe('getOnTimeDeliveryGoalForMonth', () => {
  it('should return 90% before July 2026 and 95% from July 2026', () => {
    expect(getOnTimeDeliveryGoalForMonth(new Date(2026, 5, 1))).toBe(90);
    expect(getOnTimeDeliveryGoalForMonth(new Date(2026, 6, 1))).toBe(95);
  });
});
