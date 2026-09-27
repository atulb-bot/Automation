export type FunnelKind = 'regular' | 'oneclick';

export interface FunnelPageStep {
  name: string;
  tabTitle?: string;
  templateChosen?: string;
  liveUrl?: string;
}

export class TestContext {
  public funnelKind: FunnelKind;
  public projectName: string = '';
  public productName: string = '';
  public projectUrl: string = '';
  public liveSalesPageUrl: string = '';
  public customerEmail: string = '';
  public createdPages: Map<string, FunnelPageStep> = new Map();
  public currentStep: string = 'Initialization';
  public lastSuccessfulStep: string = 'None';

  constructor(funnelKind: FunnelKind = 'regular') {
    this.funnelKind = funnelKind;
  }

  public recordStep(step: string): void {
    this.lastSuccessfulStep = this.currentStep;
    this.currentStep = step;
  }
}