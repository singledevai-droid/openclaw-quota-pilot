export interface TooltipHost<T> {
  tooltip: T | undefined;
}

/**
 * Prevents VS Code from reopening a status-bar tooltip when focus returns from
 * a Quick Pick. The last tooltip value is restored after focus has settled, so
 * normal pointer hover continues to work.
 */
export class StatusBarTooltipController<T> {
  private desiredTooltip: T | undefined;
  private suppressed = false;
  private restoreTimer: ReturnType<typeof setTimeout> | undefined;

  public constructor(
    private readonly host: TooltipHost<T>,
    private readonly restoreDelayMs = 300,
  ) {
    this.desiredTooltip = host.tooltip;
  }

  public update(tooltip: T | undefined): void {
    this.desiredTooltip = tooltip;
    if (!this.suppressed) this.host.tooltip = tooltip;
  }

  public suppressDuringInteraction(): void {
    if (this.restoreTimer) clearTimeout(this.restoreTimer);
    this.restoreTimer = undefined;
    this.suppressed = true;
    this.host.tooltip = undefined;
  }

  public restoreAfterInteraction(): void {
    if (this.restoreTimer) clearTimeout(this.restoreTimer);
    this.restoreTimer = setTimeout(() => {
      this.restoreTimer = undefined;
      this.suppressed = false;
      this.host.tooltip = this.desiredTooltip;
    }, this.restoreDelayMs);
  }

  public dispose(): void {
    if (this.restoreTimer) clearTimeout(this.restoreTimer);
    this.restoreTimer = undefined;
  }
}
