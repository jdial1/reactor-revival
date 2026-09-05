// Barrel for the app's service singletons.
//
// This file previously also contained the entire splash-screen system (~1,100
// lines: SplashScreenManager, SplashSaveSlotUI, SplashStartOptionsBuilder,
// SplashUIManager, version fetching and idle-fade behaviour), which made it a
// junk drawer in violation of Law 6.2/6.3 of docs/architecture-rules.md.
// That feature now lives in components/splash/.

export {
  getValidatedGameData,
  AUDIO_RUNTIME_DEFAULTS,
  resolveAudioService,
  AudioService,
} from "./audio.js";
export { default } from "./audio.js";
export {
  initializePwa,
  requestWakeLock,
  releaseWakeLock,
  VersionChecker,
} from "./pwa.js";
export { leaderboardService, getLocalBestRun } from "./leaderboard.js";
