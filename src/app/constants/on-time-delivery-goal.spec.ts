import {
  getOnTimeDeliveryGoalForMonth,
  monthKeyFromDate,
  ON_TIME_DELIVERY_GOAL_CURRENT,
  ON_TIME_DELIVERY_GOAL_EFFECTIVE_FROM,
  ON_TIME_DELIVERY_GOAL_LEGACY
} from '@app/constants/on-time-delivery-goal';

describe('on-time-delivery-goal', () => {
  it('should use 90% for June 2026 and earlier', () => {
    expect(getOnTimeDeliveryGoalForMonth(new Date(2026, 5, 30))).toBe(ON_TIME_DELIVERY_GOAL_LEGACY);
    expect(getOnTimeDeliveryGoalForMonth(new Date(2025, 11, 1))).toBe(ON_TIME_DELIVERY_GOAL_LEGACY);
  });

  it('should use 95% from July 2026 onwards', () => {
    expect(getOnTimeDeliveryGoalForMonth(new Date(2026, 6, 1))).toBe(ON_TIME_DELIVERY_GOAL_CURRENT);
    expect(getOnTimeDeliveryGoalForMonth(new Date(2026, 8, 1))).toBe(ON_TIME_DELIVERY_GOAL_CURRENT);
  });

  it('should treat boundary at ON_TIME_DELIVERY_GOAL_EFFECTIVE_FROM', () => {
    expect(monthKeyFromDate(new Date(2026, 5, 1))).toBe('2026-06');
    expect(monthKeyFromDate(new Date(2026, 6, 1))).toBe(ON_TIME_DELIVERY_GOAL_EFFECTIVE_FROM);
    expect(getOnTimeDeliveryGoalForMonth(new Date(2026, 5, 1))).toBe(90);
    expect(getOnTimeDeliveryGoalForMonth(new Date(2026, 6, 1))).toBe(95);
  });

  it('should derive goal from current date when month is omitted', () => {
    jasmine.clock().install();
    try {
      jasmine.clock().mockDate(new Date(2026, 5, 15));
      expect(getOnTimeDeliveryGoalForMonth(null)).toBe(90);
      jasmine.clock().mockDate(new Date(2026, 6, 1));
      expect(getOnTimeDeliveryGoalForMonth(undefined)).toBe(95);
    } finally {
      jasmine.clock().uninstall();
    }
  });
});
