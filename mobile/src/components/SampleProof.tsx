import { useState } from "react";
import { Image, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import { colors } from "../lib/theme";
import type { SampleProof } from "../lib/samples";

function SampleViewer({ sample, onClose }: { sample: SampleProof | null; onClose: () => void }) {
  const player = useVideoPlayer(sample?.video ?? null, (p) => {
    p.loop = true;
  });

  return (
    <Modal visible={!!sample} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/60">
        <View className="max-h-[88%] rounded-t-3xl bg-white">
          <View className="flex-row items-start gap-3 border-b border-primary-100 px-5 py-4">
            <View className="flex-1">
              <Text className="text-base font-extrabold text-ink">{sample?.title}</Text>
              <Text className="mt-1 text-xs text-ink-soft">{sample?.description}</Text>
            </View>
            <Pressable
              onPress={onClose}
              className="h-8 w-8 items-center justify-center rounded-full bg-primary-50"
            >
              <Ionicons name="close" size={16} color={colors.primary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20 }}>
            {sample?.video ? (
              <VideoView
                player={player}
                style={{ width: "100%", height: 460, borderRadius: 16, backgroundColor: "#000" }}
                contentFit="contain"
                allowsFullscreen
                nativeControls
              />
            ) : sample?.image ? (
              <Image
                source={sample.image}
                className="h-[460px] w-full rounded-2xl bg-canvas"
                resizeMode="contain"
              />
            ) : null}
          </ScrollView>
        </View>
      </View>
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
        <Ionicons
          name={sample.video ? "play-circle-outline" : "eye-outline"}
          size={14}
          color={colors.primary}
        />
        <Text className="text-xs font-bold text-primary">See sample</Text>
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
