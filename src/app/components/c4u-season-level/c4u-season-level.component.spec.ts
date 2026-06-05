import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { C4uSeasonLevelComponent } from './c4u-season-level.component';
import { C4uInfoButtonModule } from '../c4u-info-button/c4u-info-button.module';

describe('C4uSeasonLevelComponent', () => {
  let component: C4uSeasonLevelComponent;
  let fixture: ComponentFixture<C4uSeasonLevelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [C4uSeasonLevelComponent],
      imports: [C4uInfoButtonModule, HttpClientTestingModule]
    }).compileComponents();

    fixture = TestBed.createComponent(C4uSeasonLevelComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the average goals percentage in the circle', () => {
    component.kpiAveragePercent = 72;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const levelNumber = compiled.querySelector('.level-number');
    expect(levelNumber?.textContent?.trim()).toBe('72%');
  });

  it('should render the player name', () => {
    component.playerName = 'João Silva';
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const playerName = compiled.querySelector('.player-name');
    expect(playerName?.textContent?.trim()).toBe('João Silva');
  });

  it('should render team name below player name', () => {
    component.playerName = 'João Silva';
    component.teamName = 'Time Norte';
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const team = compiled.querySelector('.player-team');
    expect(team?.textContent?.trim()).toBe('Time Norte');
  });

  it('should not render team paragraph when team name is empty', () => {
    component.playerName = 'João Silva';
    component.teamName = '';
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.player-team')).toBeNull();
  });

  it('should render player metadata with all fields', () => {
    component.metadata = {
      area: 'Vendas',
      time: 'Time A',
      squad: 'Squad 1'
    };
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const metadata = compiled.querySelector('.player-metadata');
    expect(metadata?.textContent).toContain('Vendas');
    expect(metadata?.textContent).toContain('Time A');
    expect(metadata?.textContent).toContain('Squad 1');
  });

  it('should render player metadata with only area', () => {
    component.metadata = {
      area: 'Marketing',
      time: '',
      squad: ''
    };
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const metadata = compiled.querySelector('.player-metadata');
    expect(metadata?.textContent).toContain('Marketing');
  });

  it('should not render metadata paragraph when all fields are empty', () => {
    component.metadata = {
      area: '',
      time: '',
      squad: ''
    };
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const metadata = compiled.querySelector('.player-metadata');
    expect(metadata).toBeNull();
  });

  it('should display default values when no inputs are provided', () => {
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const levelNumber = compiled.querySelector('.level-number');
    const playerName = compiled.querySelector('.player-name');

    expect(levelNumber?.textContent?.trim()).toBe('0%');
    expect(playerName?.textContent?.trim()).toBe('');
  });

  it('should cap progress dasharray at 100', () => {
    component.kpiAveragePercent = 150;
    expect(component.progressDasharray).toBe('100, 100');
  });

  it('should render info button above the circular progress', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('c4u-info-button')).toBeTruthy();
  });

  it('should use gold stroke at 100%', () => {
    component.kpiAveragePercent = 100;
    expect(component.circleStroke).toBe('url(#seasonLevelGold)');
    expect(component.levelColorClass).toBe('level-gold');
  });

  it('should interpolate stroke color between red and green', () => {
    component.kpiAveragePercent = 0;
    expect(component.circleStroke).toBe('rgb(197, 102, 133)');
    component.kpiAveragePercent = 50;
    expect(component.circleStroke).toBe('rgb(126, 153, 100)');
    component.kpiAveragePercent = 100;
    expect(component.circleStroke).toBe('url(#seasonLevelGold)');
  });
});
