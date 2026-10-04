import { useState } from "react";
import { Image, Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import type { ImageResizeMode, ImageStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useVideoPlayer, VideoView } from "expo-video";
import { colors } from "../lib/theme";
import type { SampleProof } from "../lib/samples";

function SampleViewer({ sample, onClose }: { sample: SampleProof | null; onClose: () => void }) {
  const { height } = useWindowDimensions();
  const player = useVideoPlayer(sample?.video ?? null, (p) => {
    p.loop = true;
  });

  return (
    <Modal visible={!!sample} presentationStyle="fullScreen" animationType="fade" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1">
          <View className="flex-row items-start gap-3 border-b border-primary-100 px-5 py-4">
            <View className="flex-1">
              <Text className="text-base font-extrabold text-ink">{sample?.title}</Text>
              <Text className="mt-1 text-xs text-ink-soft">{sample?.description}</Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Close preview"
              className="mt-2 h-11 w-11 items-center justify-center rounded-full bg-primary-50"
            >
              <Ionicons name="close" size={20} color={colors.primary} />
            </Pressable>
          </View>

          <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 20 }}>
            {sample?.video ? (
              <VideoView
                player={player}
                style={{ width: "100%", height: Math.max(height - 150, 320), borderRadius: 16, backgroundColor: "#000" }}
                contentFit="contain"
                allowsFullscreen
                nativeControls
              />
            ) : sample?.image ? (
              <Image
                source={sample.image}
                style={{ width: "100%", height: Math.max(height - 150, 320), borderRadius: 16, backgroundColor: colors.canvas }}
                resizeMode="contain"
              />
            ) : null}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

/** Inline "See sample" chip placed next to a single upload field. */
export function SampleProofChip({ sample }: { sample: SampleProof }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className="flex-row items-center gap-1.5 self-start rounded-full bg-primary-50 px-3 py-1.5"
      >
        <Ionicons name="eye-outline" size={14} color={colors.primary} />
        <Text className="text-xs font-bold text-primary">See sample</Text>
      </Pressable>
      {open ? <SampleViewer sample={sample} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function SampleProofImage({
  sample,
  className,
  style,
  resizeMode = "contain",
}: {
  sample: SampleProof;
  className?: string;
  style?: ImageStyle;
  resizeMode?: ImageResizeMode;
}) {
  const [open, setOpen] = useState(false);
  if (!sample.image) return null;

  return (
    <>
      <Pressable onPress={() => setOpen(true)}>
        <Image source={sample.image} className={className} style={style} resizeMode={resizeMode} />
      </Pressable>
      {open ? <SampleViewer sample={sample} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** Horizontal gallery of every proof the creator has to collect, in journey order. */
export function SampleProofGallery({
  samples,
  title = "What we need from you",
  subtitle = "Tap any card to see exactly what your upload should look like.",
}: {
  samples: SampleProof[];
  title?: string;
  subtitle?: string;
}) {
  const [active, setActive] = useState<SampleProof | null>(null);

  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold text-ink">{title}</Text>
      <Text className="text-xs text-ink-muted">{subtitle}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
        {samples.map((sample, index) => (
          <Pressable
            key={sample.key}
            onPress={() => setActive(sample)}
            className="w-32 overflow-hidden rounded-2xl border border-primary-100 bg-white"
          >
            <View className="relative">
              {sample.image ? (
                <Image source={sample.image} className="h-32 w-full bg-canvas" resizeMode="cover" />
              ) : (
                <View className="h-32 w-full items-center justify-center bg-ink">
                  <Ionicons name="play-circle" size={38} color="#fff" />
                </View>
              )}
              <View className="absolute left-2 top-2 h-5 w-5 items-center justify-center rounded-full bg-ink">
                <Text className="text-[10px] font-bold text-white">{index + 1}</Text>
              </View>
            </View>
            <Text className="px-2 py-2 text-[11px] font-semibold text-ink" numberOfLines={2}>
              {sample.title}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {active ? <SampleViewer sample={active} onClose={() => setActive(null)} /> : null}
    </View>
  );
}
