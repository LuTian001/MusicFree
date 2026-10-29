import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Pressable } from "react-native-gesture-handler";
import Checkbox from "@/components/base/checkbox";
import Input from "@/components/base/input";
import ThemeText from "@/components/base/themeText";
import { useI18N } from "@/core/i18n";
import useColors from "@/hooks/useColors";
import PersistStatus from "@/utils/persistStatus";
import rpx from "@/utils/rpx";
import {
    defaultSkipIntroOutroSettings,
    normalizeSkipIntroOutroSettings,
} from "@/utils/skipIntroOutro";
import type { SkipIntroOutroSettings } from "@/utils/skipIntroOutro";
import PanelBase from "../base/panelBase";
import PanelHeader from "../base/panelHeader";

interface ITimeSettingProps {
    title: string;
    seconds: number;
    enabled: boolean;
    onSecondsChange: (seconds: number) => void;
    onToggle: () => void;
}

function TimeSetting(props: ITimeSettingProps) {
    const { title, seconds, enabled, onSecondsChange, onToggle } = props;
    const [input, setInput] = useState(String(seconds));
    const colors = useColors();
    const { t } = useI18N();

    return (
        <View style={styles.row}>
            <ThemeText style={styles.label}>{title}</ThemeText>
            <Input
                value={input}
                keyboardType="number-pad"
                accessibilityLabel={title}
                maxLength={8}
                selectTextOnFocus
                hasHorizontalPadding={false}
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.divider }]}
                onChangeText={text => {
                    if (!/^\d*$/.test(text)) {
                        return;
                    }
                    const value = text ? Number(text) : 0;
                    if (!Number.isSafeInteger(value)) {
                        return;
                    }
                    setInput(text);
                    onSecondsChange(value);
                }}
                onBlur={() => setInput(String(seconds))}
            />
            <ThemeText style={styles.unit}>{t("panel.skipIntroOutro.seconds")}</ThemeText>
            <Pressable
                style={styles.toggle}
                onPress={onToggle}
                accessibilityRole="checkbox"
                accessibilityLabel={title}
                accessibilityState={{ checked: enabled }}>
                <Checkbox checked={enabled} />
            </Pressable>
        </View>
    );
}

export default function SkipIntroOutro() {
    const { t } = useI18N();
    const saved = PersistStatus.useValue("music.skipIntroOutro", defaultSkipIntroOutroSettings);
    const settings = normalizeSkipIntroOutroSettings(saved);

    const updateSettings = (patch: Partial<SkipIntroOutroSettings>) => {
        const current = normalizeSkipIntroOutroSettings(PersistStatus.get("music.skipIntroOutro"));
        PersistStatus.set("music.skipIntroOutro", { ...current, ...patch });
    };

    return (
        <PanelBase
            positionMethod="top"
            height={rpx(480)}
            keyboardAvoidBehavior="height"
            renderBody={() => (
                <>
                    <PanelHeader title={t("panel.musicItemOptions.skipIntroOutro")} hideButtons />
                    <View style={styles.body}>
                        <TimeSetting
                            title={t("panel.skipIntroOutro.introTime")}
                            seconds={settings.introSeconds}
                            enabled={settings.introEnabled}
                            onSecondsChange={introSeconds => updateSettings({ introSeconds })}
                            onToggle={() => updateSettings({ introEnabled: !settings.introEnabled })}
                        />
                        <TimeSetting
                            title={t("panel.skipIntroOutro.outroTime")}
                            seconds={settings.outroSeconds}
                            enabled={settings.outroEnabled}
                            onSecondsChange={outroSeconds => updateSettings({ outroSeconds })}
                            onToggle={() => updateSettings({ outroEnabled: !settings.outroEnabled })}
                        />
                        <ThemeText style={styles.hint} fontSize="subTitle" fontColor="textSecondary">
                            {t("panel.skipIntroOutro.hint")}
                        </ThemeText>
                    </View>
                </>
            )}
        />
    );
}

const styles = StyleSheet.create({
    body: {
        paddingHorizontal: rpx(24),
        paddingTop: rpx(12),
    },
    row: {
        height: rpx(104),
        flexDirection: "row",
        alignItems: "center",
    },
    label: {
        flex: 1,
    },
    input: {
        width: rpx(140),
        height: rpx(64),
        borderRadius: rpx(8),
        borderWidth: rpx(1),
        textAlign: "center",
        fontSize: rpx(28),
    },
    unit: {
        marginLeft: rpx(12),
    },
    toggle: {
        height: rpx(80),
        minWidth: rpx(80),
        marginLeft: rpx(16),
        alignItems: "center",
        justifyContent: "center",
    },
    hint: {
        marginTop: rpx(16),
        lineHeight: rpx(36),
    },
});
