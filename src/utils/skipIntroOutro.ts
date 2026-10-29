export interface SkipIntroOutroSettings {
    introSeconds: number;
    outroSeconds: number;
    introEnabled: boolean;
    outroEnabled: boolean;
}

export const defaultSkipIntroOutroSettings: SkipIntroOutroSettings = {
    introSeconds: 0,
    outroSeconds: 0,
    introEnabled: false,
    outroEnabled: false,
};

export function normalizeSkipIntroOutroSettings(value: unknown): SkipIntroOutroSettings {
    const settings = value && typeof value === "object"
        ? value as Partial<SkipIntroOutroSettings>
        : {};
    const seconds = (input: unknown) => typeof input === "number"
        && Number.isSafeInteger(input) && input >= 0 ? input : 0;

    return {
        introSeconds: seconds(settings.introSeconds),
        outroSeconds: seconds(settings.outroSeconds),
        introEnabled: settings.introEnabled === true,
        outroEnabled: settings.outroEnabled === true,
    };
}
