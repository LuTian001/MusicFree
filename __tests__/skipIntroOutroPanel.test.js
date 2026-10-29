const React = require("react");
const { create, act } = require("react-test-renderer");

jest.mock("@/components/base/input", () => ({ __esModule: true, default: "Input" }));
jest.mock("@/components/base/checkbox", () => ({ __esModule: true, default: "Checkbox" }));
jest.mock("@/components/base/themeText", () => ({ __esModule: true, default: "ThemeText" }));
jest.mock("@/components/panels/base/panelHeader", () => ({ __esModule: true, default: "PanelHeader" }));
jest.mock("@/components/panels/base/panelBase", () => ({
    __esModule: true,
    default: ({ renderBody }) => require("react").createElement("PanelBase", null, renderBody(false)),
}));
jest.mock("react-native-gesture-handler", () => ({ Pressable: "Pressable" }));
jest.mock("@/hooks/useColors", () => ({
    __esModule: true,
    default: () => ({ card: "white", divider: "gray" }),
}));
jest.mock("@/core/i18n", () => ({ useI18N: () => ({ t: key => key }) }));
jest.mock("@/utils/rpx", () => ({ __esModule: true, default: value => value }));
jest.mock("@/utils/persistStatus", () => {
    const react = require("react");
    let saved = null;
    const listeners = new Set();
    const persistStatus = {
        get: jest.fn(() => saved),
        set: jest.fn((key, value) => {
            saved = value;
            listeners.forEach(listener => listener(value));
        }),
        useValue: (key, defaultValue) => {
            const [value, setValue] = react.useState(saved ?? defaultValue);
            react.useEffect(() => {
                listeners.add(setValue);
                return () => listeners.delete(setValue);
            }, []);
            return value;
        },
    };
    return {
        __esModule: true,
        default: persistStatus,
        reset: value => {
            saved = value;
            listeners.clear();
            persistStatus.get.mockClear();
            persistStatus.set.mockClear();
        },
    };
});

const SkipIntroOutro = require("@/components/panels/types/skipIntroOutro").default;
const persistModule = require("@/utils/persistStatus");
const PersistStatus = persistModule.default;

describe("global intro/outro settings panel", () => {
    let panel;

    beforeEach(() => {
        persistModule.reset(null);
        act(() => {
            panel = create(React.createElement(SkipIntroOutro));
        });
    });

    afterEach(() => {
        act(() => panel.unmount());
    });

    const inputs = () => panel.root.findAllByType("Input");
    const toggles = () => panel.root.findAllByType("Pressable");
    const checks = () => panel.root.findAllByType("Checkbox");
    const setTime = (index, text) => act(() => inputs()[index].props.onChangeText(text));
    const toggle = index => act(() => toggles()[index].props.onPress());

    test("saving times keeps both switches off until explicitly enabled", () => {
        setTime(0, "30");
        setTime(1, "20");

        expect(PersistStatus.get("music.skipIntroOutro")).toEqual({
            introSeconds: 30,
            outroSeconds: 20,
            introEnabled: false,
            outroEnabled: false,
        });
        expect(checks().map(check => check.props.checked)).toEqual([false, false]);
    });

    test("turning a switch off retains its time and does not change the other switch", () => {
        setTime(0, "30");
        setTime(1, "15");
        toggle(0);
        toggle(1);
        toggle(0);

        expect(PersistStatus.get("music.skipIntroOutro")).toEqual({
            introSeconds: 30,
            outroSeconds: 15,
            introEnabled: false,
            outroEnabled: true,
        });
        expect(inputs().map(input => input.props.value)).toEqual(["30", "15"]);
        expect(checks().map(check => check.props.checked)).toEqual([false, true]);
    });

    test("reopening restores both times and both switches from persistent storage", () => {
        setTime(0, "45");
        setTime(1, "12");
        toggle(0);
        act(() => panel.unmount());
        act(() => {
            panel = create(React.createElement(SkipIntroOutro));
        });

        expect(inputs().map(input => input.props.value)).toEqual(["45", "12"]);
        expect(checks().map(check => check.props.checked)).toEqual([true, false]);
        expect(toggles()[0].props.accessibilityState.checked).toBe(true);
        expect(toggles()[1].props.accessibilityState.checked).toBe(false);
    });

    test.each(["-1", "1.5", "abc", "30s", "Infinity", "9007199254740992"])(
        "invalid time %s does not overwrite the saved time",
        text => {
            setTime(0, "30");
            PersistStatus.set.mockClear();
            setTime(0, text);

            expect(PersistStatus.set).not.toHaveBeenCalled();
            expect(PersistStatus.get("music.skipIntroOutro").introSeconds).toBe(30);
            expect(inputs()[0].props.value).toBe("30");
        },
    );

    test("clearing a time saves zero without changing its switch", () => {
        setTime(1, "20");
        toggle(1);
        setTime(1, "");
        act(() => inputs()[1].props.onBlur());

        expect(PersistStatus.get("music.skipIntroOutro").outroSeconds).toBe(0);
        expect(PersistStatus.get("music.skipIntroOutro").outroEnabled).toBe(true);
        expect(inputs()[1].props.value).toBe("0");
    });
});
