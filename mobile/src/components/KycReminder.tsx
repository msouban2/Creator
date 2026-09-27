import { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useKyc } from "../api/profile";
import { useAuthStore } from "../store/auth";
import { colors } from "../lib/theme";

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

/**
 * Shows a reminder popup asking the creator to complete their KYC. It keeps
 * reappearing once every 12 hours until a KYC record is submitted. Mounted once
 * at the tabs layout so it can surface on any tab.
 */
export function KycReminder() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.session?.user?.id);
  const { data: kyc, isLoading } = useKyc();
  const [visible, setVisible] = useState(false);

  // KYC is considered "not submitted" until a kyc record exists for the user.
  const submitted = !!kyc;

  useEffect(() => {
    if (!userId || isLoading || submitted) return;
    let cancelled = false;
    const key = `kyc_reminder_last_shown_${userId}`;

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(key);
        const last = raw ? Number(raw) : 0;
        if (Date.now() - last >= TWELVE_HOURS_MS) {
          if (cancelled) return;
          setVisible(true);
          await AsyncStorage.setItem(key, String(Date.now()));
        }
      } catch {
        // ignore storage errors — the reminder is best-effort
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, isLoading, submitted]);

  if (submitted) return null;

  const close = () => setVisible(false);
  const goToKyc = () => {
    setVisible(false);
    router.push("/kyc");
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View className="flex-1 items-center justify-center bg-black/50 px-8">
        <View className="w-full rounded-3xl bg-white p-6">
          <View className="items-center">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-primary-100">
              <Ionicons name="shield-checkmark-outline" size={30} color={colors.primary} />
            </View>
            <Text className="mt-4 text-center text-lg font-extrabold text-ink">
              Complete your KYC
            </Text>
            <Text className="mt-2 text-center text-sm text-ink-soft">
              Verify your identity and add your bank details to unlock full access and receive your
              payments without delays.
            </Text>
          </View>

          <View className="mt-6 gap-2">
            <Pressable onPress={goToKyc} className="items-center rounded-2xl bg-ink py-4">
              <Text className="text-base font-bold text-white">Complete KYC Now</Text>
            </Pressable>
            <Pressable onPress={close} className="items-center py-3">
              <Text className="text-sm font-semibold text-ink-muted">Remind me later</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
