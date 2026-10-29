import {
    defaultSkipIntroOutroSettings,
    normalizeSkipIntroOutroSettings,
} from '../src/utils/skipIntroOutro';
import { getSkipPlaybackWindow } from '../src/utils/skipPlayback';

const enabled = {
    introSeconds: 30,
    outroSeconds: 20,
    introEnabled: true,
    outroEnabled: true,
};

describe('saved global intro/outro settings', () => {
    test.each([null, undefined, '', 30, false, []])('defaults for absent or invalid storage: %p', value => {
        expect(normalizeSkipIntroOutroSettings(value)).toEqual(defaultSkipIntroOutroSettings);
    });

    test('retains times while each switch is independently disabled', () => {
        expect(normalizeSkipIntroOutroSettings({ ...enabled, introEnabled: false })).toEqual({
            ...enabled,
            introEnabled: false,
        });
        expect(normalizeSkipIntroOutroSettings({ ...enabled, outroEnabled: false })).toEqual({
            ...enabled,
            outroEnabled: false,
        });
    });

    test.each([-1, 1.5, Infinity, NaN, '30', Number.MAX_SAFE_INTEGER + 1])(
        'rejects invalid stored seconds without coercion: %p', value => {
            expect(normalizeSkipIntroOutroSettings({
                ...enabled,
                introSeconds: value,
                outroSeconds: value,
            })).toEqual({ ...enabled, introSeconds: 0, outroSeconds: 0 });
        },
    );

    test('requires an explicit boolean true to enable skipping', () => {
        expect(normalizeSkipIntroOutroSettings({
            ...enabled,
            introEnabled: 'true',
            outroEnabled: 1,
        })).toEqual({ ...enabled, introEnabled: false, outroEnabled: false });
    });
});

describe('playable interval for each audio duration', () => {
    test.each([
        [120, 100],
        [300, 280],
    ])('uses the actual duration %s for the outro boundary', (duration, outroStart) => {
        expect(getSkipPlaybackWindow(enabled, duration)).toEqual({ introSeconds: 30, outroStart });
    });

    test('does not apply remembered seconds while both switches are off', () => {
        expect(getSkipPlaybackWindow({
            ...enabled,
            introEnabled: false,
            outroEnabled: false,
        }, 120)).toEqual({ introSeconds: 0, outroStart: null });
    });

    test('ignores a disabled oversized intro while applying the enabled outro', () => {
        expect(getSkipPlaybackWindow({
            ...enabled,
            introSeconds: 1000,
            introEnabled: false,
        }, 120)).toEqual({ introSeconds: 0, outroStart: 100 });
    });

    test('applies the intro independently of the outro switch', () => {
        expect(getSkipPlaybackWindow({ ...enabled, outroEnabled: false }, 120))
            .toEqual({ introSeconds: 30, outroStart: null });
    });

    test('zero seconds performs no skip even when switches are enabled', () => {
        expect(getSkipPlaybackWindow({ ...enabled, introSeconds: 0, outroSeconds: 0 }, 120))
            .toEqual({ introSeconds: 0, outroStart: null });
    });

    test.each([0, -1, NaN, Infinity, 10, 49, 50])(
        'falls back to normal playback for unknown or fully covered audio: %p', duration => {
            expect(getSkipPlaybackWindow(enabled, duration)).toEqual({ introSeconds: 0, outroStart: null });
        },
    );
});
