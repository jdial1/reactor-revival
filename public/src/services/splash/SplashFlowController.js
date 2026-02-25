export const LOADING_STEPS = [
  { id: "init", message: "Initializing reactor systems..." },
  { id: "ui", message: "Calibrating control panels..." },
  { id: "game", message: "Spinning up nuclear protocols..." },
  { id: "parts", message: "Installing reactor components..." },
  { id: "upgrades", message: "Analyzing technological blueprints..." },
  { id: "objectives", message: "Briefing mission parameters..." },
  { id: "engine", message: "Achieving critical mass..." },
  { id: "ready", message: "Reactor online - All systems nominal!" },
];

export class SplashFlowController {
  constructor() {
    this.loadingSteps = LOADING_STEPS;
    this.currentStep = 0;
  }

  nextStep(onUpdateStatus) {
    if (this.currentStep < this.loadingSteps.length - 1) {
      this.currentStep++;
      const step = this.loadingSteps[this.currentStep];
      onUpdateStatus?.(step.message);
    }
  }
}
