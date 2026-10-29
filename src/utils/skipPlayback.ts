import type { SkipIntroOutroSettings } from "./skipIntroOutro";

/** Resolve skips against this audio's duration; never skip an entire audio. */
export function getSkipPlaybackWindow(settings: SkipIntroOutroSettings, duration: number) {
    if (!Number.isFinite(duration) || duration <= 0) {
        return { introSeconds: 0, outroStart: null };
    }
    const introSeconds = settings.introEnabled ? settings.introSeconds : 0;
    const outroSeconds = settings.outroEnabled ? settings.outroSeconds : 0;
    if (introSeconds + outroSeconds >= duration) {
        return { introSeconds: 0, outroStart: null };
    }
    return {
        introSeconds,
        outroStart: outroSeconds > 0 ? duration - outroSeconds : null,
    };
}
