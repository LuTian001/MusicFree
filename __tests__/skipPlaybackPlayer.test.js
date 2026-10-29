jest.mock("../src/components/dialogs/useDialog", () => ({
    getCurrentDialog: jest.fn(),
    showDialog: jest.fn(),
}));
jest.mock("../src/constants/commonConst", () => ({
    internalFakeSoundKey: "fake-key",
    sortIndexSymbol: Symbol.for("sort-index"),
    timeStampSymbol: Symbol.for("time-stamp"),
}));
jest.mock("../src/utils/log", () => ({ trace: jest.fn(), errorLog: jest.fn() }));
jest.mock("../src/utils/delay", () => jest.fn(async () => {}));
jest.mock("../src/utils/mediaUtils", () => ({
    getLocalPath: () => null,
    isSameMediaItem: (a, b) => !!(a && b && a.id === b.id && a.platform === b.platform),
}));
jest.mock("../src/utils/network", () => ({ __esModule: true, default: { isCellular: false } }));
jest.mock("../src/core/localMusicSheet", () => ({
    __esModule: true,
    default: { isLocalMusic: () => false },
}));
jest.mock("../src/constants/assetsConst", () => ({ ImgAsset: { albumDefault: "default.png" } }));
jest.mock("../src/utils/fileUtils", () => ({ resolveImportedAssetOrPath: value => value }));
jest.mock("../src/utils/qualities", () => ({ getQualityOrder: () => ["standard"] }));
jest.mock("../src/utils/persistStatus", () => {
    const values = {};
    return {
        __esModule: true,
        values,
        default: {
            get: jest.fn(key => values[key] ?? null),
            set: jest.fn((key, value) => { values[key] = value; }),
        },
    };
});
jest.mock("react-native-track-player", () => {
    const State = {
        Playing: "playing", Paused: "paused", Stopped: "stopped",
        Loading: "loading", Buffering: "buffering", None: "none", Ready: "ready", Error: "error",
    };
    const Event = { PlaybackActiveTrackChanged: "active", PlaybackError: "error", PlaybackState: "state" };
    const state = {
        queue: [], index: 0, position: 0, duration: 120,
        playbackState: State.Paused, events: {}, actions: [],
    };
    const api = {
        setQueue: jest.fn(async tracks => {
            state.queue = tracks.map(track => ({ ...track }));
            state.index = 0;
            state.position = 0;
            state.duration = tracks[0]?.duration ?? 120;
            if (state.duration === 0) {
                state.playbackState = State.Ready;
            }
            state.actions.push("queue");
        }),
        getTrack: jest.fn(async index => state.queue[index]),
        getActiveTrack: jest.fn(async () => state.queue[state.index]),
        getActiveTrackIndex: jest.fn(async () => state.index),
        getPlaybackState: jest.fn(async () => ({ state: state.playbackState })),
        getProgress: jest.fn(async () => ({ position: state.position, duration: state.duration, buffered: state.duration })),
        seekTo: jest.fn(async position => {
            state.position = position;
            state.actions.push(`seek:${position}`);
        }),
        play: jest.fn(async () => {
            state.playbackState = State.Playing;
            state.actions.push("play");
        }),
        pause: jest.fn(async () => {
            if (![State.Loading, State.Buffering, State.None].includes(state.playbackState)) {
                state.playbackState = State.Paused;
            }
        }),
        reset: jest.fn(async () => {
            state.queue = [];
            state.position = 0;
            state.playbackState = State.Stopped;
        }),
        skip: jest.fn(async index => { state.index = index; }),
        updateMetadataForTrack: jest.fn(async (index, props) => { Object.assign(state.queue[index], props); }),
        addEventListener: jest.fn((event, listener) => {
            state.events[event] = listener;
            return { remove: jest.fn(() => {
                if (state.events[event] === listener) {
                    delete state.events[event];
                }
            }) };
        }),
        setRate: jest.fn(), getRate: jest.fn(async () => 1), setupPlayer: jest.fn(),
    };
    return { __esModule: true, default: api, ...api, State, Event, state };
});

let player, native, state, values, plugin, config;
const audio = (id, duration = 120) => ({
    id, platform: "test", title: `Audio ${id}`, artist: "Reader",
    url: `https://example.test/${id}.mp3`, artwork: "cover.png", duration,
});
const enabled = { introSeconds: 30, outroSeconds: 20, introEnabled: true, outroEnabled: true };
const flushPromises = async () => {
    for (let index = 0; index < 40; index++) {
        await Promise.resolve();
    }
};

beforeEach(() => {
    jest.resetModules();
    // Each test reloads the player singleton and its Jotai default store.
    delete global.__JOTAI_DEFAULT_STORE__;
    const rn = require("react-native-track-player");
    native = rn.default;
    state = rn.state;
    values = require("../src/utils/persistStatus").values;
    values["music.skipIntroOutro"] = { ...enabled };
    player = require("../src/core/trackPlayer").default;
    config = { getConfig: jest.fn(key => key === "basic.autoStopWhenError" ? true : undefined) };
    plugin = {
        methods: {
            getMediaSource: jest.fn(async (track, quality) => ({ url: `${track.url}?${quality}` })),
            getMusicInfo: jest.fn(async () => null),
        },
    };
    player.injectDependencies(config, { addMusic: jest.fn() }, {
        getByName: () => plugin, getByMedia: () => plugin, getSearchablePlugins: () => [],
    });
});

test("saved times do nothing while both switches are off", async () => {
    values["music.skipIntroOutro"] = { ...enabled, introEnabled: false, outroEnabled: false };
    await player.playWithReplacePlayList(audio("a"), [audio("a"), audio("b")]);
    expect(native.seekTo).not.toHaveBeenCalled();
    state.position = 115;
    await player.handlePlaybackProgress();
    expect(player.currentMusic.id).toBe("a");
});

test("a new audio seeks past its intro before playback starts", async () => {
    await player.play(audio("a"));
    expect(state.actions.slice(-3)).toEqual(["queue", "seek:30", "play"]);
    expect(values["music.progress"]).toBe(30);
});

test("outro uses each audio duration and concurrent ticks advance only once", async () => {
    await player.playWithReplacePlayList(audio("a"), [audio("a"), audio("b", 240)]);
    const ended = jest.fn();
    player.on("play-end", ended);
    state.position = 99;
    await player.handlePlaybackProgress();
    expect(player.currentMusic.id).toBe("a");
    state.position = 100;
    await Promise.all([player.handlePlaybackProgress(), player.handlePlaybackProgress()]);
    expect(player.currentMusic.id).toBe("b");
    expect(state.position).toBe(30);
    expect(ended).toHaveBeenCalledTimes(1);
    state.position = 219;
    await player.handlePlaybackProgress();
    expect(player.currentMusic.id).toBe("b");
    state.position = 220;
    await player.handlePlaybackProgress();
    expect(player.currentMusic.id).toBe("a");
    expect(ended).toHaveBeenCalledTimes(2);
});

test("times changed during playback apply to the next audio", async () => {
    await player.playWithReplacePlayList(audio("a"), [audio("a"), audio("b")]);
    values["music.skipIntroOutro"] = { ...enabled, introSeconds: 45, outroSeconds: 10 };
    state.position = 100;
    await player.handlePlaybackProgress();
    expect(player.currentMusic.id).toBe("b");
    expect(state.position).toBe(45);
    state.position = 109;
    await player.handlePlaybackProgress();
    expect(player.currentMusic.id).toBe("b");
    state.position = 110;
    await player.handlePlaybackProgress();
    expect(player.currentMusic.id).toBe("a");
});

test("turning off outro immediately prevents the pending skip and retains saved times", async () => {
    await player.playWithReplacePlayList(audio("a"), [audio("a"), audio("b")]);
    values["music.skipIntroOutro"] = { ...enabled, introSeconds: 45, outroEnabled: false };
    state.position = 100;
    await player.handlePlaybackProgress();
    expect(player.currentMusic.id).toBe("a");
    expect(values["music.skipIntroOutro"].outroSeconds).toBe(20);
    await player.skipToNext();
    expect(player.currentMusic.id).toBe("b");
    expect(state.position).toBe(45);
    state.position = 119;
    await player.handlePlaybackProgress();
    expect(player.currentMusic.id).toBe("b");
});

test("a delayed progress result cannot skip a manually selected audio", async () => {
    await player.playWithReplacePlayList(audio("a"), [audio("a"), audio("b")]);
    let resolveProgress;
    native.getProgress.mockImplementationOnce(() => new Promise(resolve => { resolveProgress = resolve; }));
    const oldTick = player.handlePlaybackProgress();
    await player.skipToNext();
    resolveProgress({ position: 115, duration: 120, buffered: 120 });
    await oldTick;
    expect(player.currentMusic.id).toBe("b");
    expect(state.position).toBe(30);
});

test("paused playback and internal placeholder audios do not skip", async () => {
    await player.playWithReplacePlayList(audio("a"), [audio("a"), audio("b")]);
    state.position = 115;
    await player.pause();
    await player.handlePlaybackProgress();
    expect(player.currentMusic.id).toBe("a");
    state.playbackState = "playing";
    for (const url of ["musicfree://fake-audio", "musicfree://proposed-audio"]) {
        state.queue[0].url = url;
        await player.handlePlaybackProgress();
        expect(player.currentMusic.id).toBe("a");
    }
});

test.each([0, 40])("unknown or too short duration %s falls back to normal playback", async duration => {
    await player.playWithReplacePlayList(audio("a", duration), [audio("a", duration), audio("b")]);
    expect(native.seekTo).not.toHaveBeenCalled();
    state.position = 35;
    await player.handlePlaybackProgress();
    expect(player.currentMusic.id).toBe("a");
});

test("intro is applied once when native duration becomes available later", async () => {
    await player.play(audio("a", 0));
    expect(native.seekTo).not.toHaveBeenCalled();
    state.duration = 120;
    state.position = 1;
    await player.handlePlaybackProgress();
    expect(state.position).toBe(30);
    await player.seekTo(10);
    await player.handlePlaybackProgress();
    expect(state.position).toBe(10);
});

test("pause/resume and a quality change retain the listening position", async () => {
    await player.play(audio("a"));
    await player.seekTo(67);
    await player.pause();
    native.seekTo.mockClear();
    await player.play();
    expect(native.seekTo).not.toHaveBeenCalled();
    expect(state.position).toBe(67);
    expect(await player.changeQuality("high")).toBe(true);
    expect(state.position).toBe(67);
    expect(native.seekTo.mock.calls).toEqual([[67]]);
});

test("app startup restores saved progress without seeking back to the intro", async () => {
    const track = audio("a");
    values["music.playList"] = [track];
    values["music.musicItem"] = track;
    values["music.progress"] = 68;
    await player.setupTrackPlayer();
    await flushPromises();
    expect(player.currentMusic.id).toBe("a");
    expect(native.seekTo.mock.calls).toEqual([[68]]);
    expect(state.position).toBe(68);
    expect(native.play).not.toHaveBeenCalled();
});

test("reset from the end-of-audio listener prevents starting the next audio", async () => {
    await player.playWithReplacePlayList(audio("a"), [audio("a"), audio("b")]);
    player.on("play-end", () => player.reset());
    const starts = native.play.mock.calls.length;
    state.position = 100;
    await player.handlePlaybackProgress();
    expect(native.reset).toHaveBeenCalledTimes(1);
    expect(native.play).toHaveBeenCalledTimes(starts);
    expect(state.queue).toEqual([]);
});

test("a single-audio list restarts at its configured intro after the outro", async () => {
    await player.play(audio("a"));
    state.position = 100;
    await player.handlePlaybackProgress();
    expect(player.currentMusic.id).toBe("a");
    expect(state.position).toBe(30);
    expect(state.actions.slice(-2)).toEqual(["seek:30", "play"]);
    expect(native.play).toHaveBeenCalledTimes(2);
});

test("natural completion preserves single-repeat, while outro requests the next audio", async () => {
    values["music.repeatMode"] = "SINGLE";
    await player.setupTrackPlayer();
    await player.playWithReplacePlayList(audio("a"), [audio("a"), audio("b")]);
    const lastTrack = state.queue[0];
    state.index = 1;
    await state.events.active({ index: 1, lastIndex: 0, track: state.queue[1], lastTrack });
    expect(player.currentMusic.id).toBe("a");
    expect(state.position).toBe(30);
    state.position = 100;
    await player.handlePlaybackProgress();
    expect(player.currentMusic.id).toBe("b");
});

test("a delayed natural-completion event cannot advance a newly selected audio", async () => {
    await player.setupTrackPlayer();
    await player.playWithReplacePlayList(audio("a"), [audio("a"), audio("b")]);
    const oldTrack = state.queue[0];
    const oldMarker = state.queue[1];
    await player.skipToNext();
    await state.events.active({ index: 1, lastIndex: 0, track: oldMarker, lastTrack: oldTrack });
    expect(player.currentMusic.id).toBe("b");
    expect(state.position).toBe(30);
});

function delayAudioPreparation(id = "a") {
    const setQueue = native.setQueue.getMockImplementation();
    native.setQueue.mockImplementation(async tracks => {
        await setQueue(tracks);
        if (tracks[0].id === id) {
            state.duration = 0;
            state.playbackState = "loading";
        } else {
            state.playbackState = "ready";
        }
    });
}

test("loading audio stays silent until ready, then seeks before it plays", async () => {
    delayAudioPreparation();
    const preparing = player.play(audio("a"));
    await flushPromises();
    expect(native.play).not.toHaveBeenCalled();
    expect(native.seekTo).not.toHaveBeenCalled();
    expect(state.events.state).toEqual(expect.any(Function));
    state.playbackState = "buffering";
    state.events.state({ state: "buffering" });
    await flushPromises();
    expect(native.play).not.toHaveBeenCalled();
    state.duration = 120;
    state.playbackState = "ready";
    state.events.state({ state: "ready" });
    await preparing;
    expect(state.actions.slice(-3)).toEqual(["queue", "seek:30", "play"]);
    expect(state.events.state).toBeUndefined();
});

test.each(["next audio", "reset"])("%s cancels preparation without starting the old audio", async action => {
    delayAudioPreparation();
    const preparing = player.play(audio("a"));
    await flushPromises();
    const oldReadyListener = state.events.state;
    expect(oldReadyListener).toEqual(expect.any(Function));
    if (action === "next audio") {
        await player.play(audio("b"));
    } else {
        await player.reset();
    }
    await preparing;
    oldReadyListener({ state: "ready" });
    await flushPromises();
    expect(state.events.state).toBeUndefined();
    if (action === "next audio") {
        expect(player.currentMusic.id).toBe("b");
        expect(native.play).toHaveBeenCalledTimes(1);
        expect(state.position).toBe(30);
    } else {
        expect(native.play).not.toHaveBeenCalled();
        expect(state.queue).toEqual([]);
    }
});

test("ready audio with a truly unknown duration starts normally", async () => {
    delayAudioPreparation();
    const preparing = player.play(audio("a", 0));
    await flushPromises();
    expect(native.play).not.toHaveBeenCalled();
    state.playbackState = "ready";
    state.events.state({ state: "ready" });
    await preparing;
    expect(native.seekTo).not.toHaveBeenCalled();
    expect(native.play).toHaveBeenCalledTimes(1);
    expect(state.position).toBe(0);
    expect(state.events.state).toBeUndefined();
});

test("a transient paused state with duration zero still waits for preparation", async () => {
    delayAudioPreparation();
    const preparing = player.play(audio("a"));
    await flushPromises();
    state.playbackState = "paused";
    state.events.state({ state: "paused" });
    await flushPromises();
    expect(native.play).not.toHaveBeenCalled();
    expect(native.seekTo).not.toHaveBeenCalled();
    expect(state.events.state).toEqual(expect.any(Function));
    state.duration = 120;
    state.playbackState = "ready";
    state.events.state({ state: "ready" });
    await preparing;
    expect(state.actions.slice(-3)).toEqual(["queue", "seek:30", "play"]);
    expect(state.events.state).toBeUndefined();
});

test("pausing during preparation prevents automatic playback when ready", async () => {
    delayAudioPreparation();
    const preparing = player.play(audio("a"));
    await flushPromises();
    await player.pause();
    state.duration = 120;
    state.playbackState = "ready";
    state.events.state({ state: "ready" });
    await preparing;
    expect(state.position).toBe(30);
    expect(native.play).not.toHaveBeenCalled();
});

test("resuming during preparation still waits for ready before seeking and playing", async () => {
    delayAudioPreparation();
    const preparing = player.play(audio("a"));
    await flushPromises();
    await player.pause();
    const resuming = player.play();
    await flushPromises();
    expect(native.play).not.toHaveBeenCalled();
    expect(native.seekTo).not.toHaveBeenCalled();
    state.duration = 120;
    state.playbackState = "ready";
    state.events.state({ state: "ready" });
    await Promise.all([preparing, resuming]);
    expect(state.position).toBe(30);
    expect(native.seekTo).toHaveBeenCalledTimes(1);
    expect(native.play).toHaveBeenCalledTimes(1);
    expect(state.events.state).toBeUndefined();
});

test.each([false, true])("an already prepared unknown stream can resume with force=%s without another ready event", async force => {
    await player.play(audio("a", 0));
    expect(native.play).toHaveBeenCalledTimes(1);
    await player.pause();
    expect(state.playbackState).toBe("paused");
    const resuming = player.play(null, force);
    let completed = false;
    resuming.then(() => { completed = true; });
    await flushPromises();
    expect(completed).toBe(true);
    await resuming;
    expect(native.play).toHaveBeenCalledTimes(2);
    expect(state.events.state).toBeUndefined();
});

test("a new audio still waits for its own ready state after an unknown stream", async () => {
    await player.play(audio("a", 0));
    delayAudioPreparation("b");
    const nextAudio = player.play(audio("b"));
    await flushPromises();
    expect(native.play).toHaveBeenCalledTimes(1);
    expect(state.events.state).toEqual(expect.any(Function));
    state.duration = 160;
    state.playbackState = "ready";
    state.events.state({ state: "ready" });
    await nextAudio;
    expect(player.currentMusic.id).toBe("b");
    expect(state.actions.slice(-3)).toEqual(["queue", "seek:30", "play"]);
    expect(native.play).toHaveBeenCalledTimes(2);
});

test("enabling intro for a prepared unknown stream does not block a forced replay", async () => {
    values["music.skipIntroOutro"] = { ...enabled, introEnabled: false };
    await player.play(audio("a", 0));
    await player.pause();
    values["music.skipIntroOutro"] = { ...enabled };
    const replaying = player.play(null, true);
    let completed = false;
    replaying.then(() => { completed = true; });
    await flushPromises();
    expect(completed).toBe(true);
    await replaying;
    expect(native.play).toHaveBeenCalledTimes(2);
    expect(state.position).toBe(0);
    expect(state.events.state).toBeUndefined();
});

test("a ready event releases unknown-stream preparation even if native is already paused", async () => {
    await player.setupTrackPlayer();
    const observeReady = state.events.state;
    delayAudioPreparation();
    const preparing = player.play(audio("a", 0));
    await flushPromises();
    expect(native.play).not.toHaveBeenCalled();
    state.playbackState = "paused";
    observeReady({ state: "ready" });
    let completed = false;
    preparing.then(() => { completed = true; });
    await flushPromises();
    expect(completed).toBe(true);
    await preparing;
    expect(native.play).toHaveBeenCalledTimes(1);
    expect(native.seekTo).not.toHaveBeenCalled();
});

test("a restored unknown stream can force replay after its ready event without another event", async () => {
    const track = audio("a", 0);
    values["music.playList"] = [track];
    values["music.musicItem"] = track;
    values["music.progress"] = 12;
    values["music.skipIntroOutro"] = { ...enabled, introEnabled: false };
    await player.setupTrackPlayer();
    const observeReady = state.events.state;
    await flushPromises();
    expect(state.position).toBe(12);
    expect(native.play).not.toHaveBeenCalled();
    state.playbackState = "paused";
    observeReady({ state: "ready" });
    await flushPromises();
    values["music.skipIntroOutro"] = { ...enabled };
    const replaying = player.play(null, true);
    let completed = false;
    replaying.then(() => { completed = true; });
    await flushPromises();
    expect(completed).toBe(true);
    await replaying;
    expect(native.play).toHaveBeenCalledTimes(1);
    expect(state.position).toBe(0);
});
