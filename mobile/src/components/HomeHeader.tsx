import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../lib/theme";
import { greeting } from "../lib/format";
import { useNotifications } from "../api/notifications";
import { useAuthStore } from "../store/auth";

interface HomeHeaderProps {
  name?: string | null;
  title?: string;
  subtitle?: string;
  centered?: boolean;
}

export function HomeHeader({ name, title, subtitle, centered = true }: HomeHeaderProps) {
  const router = useRouter();
  const isSignedIn = !!useAuthStore((s) => s.session);
  const { data: notifications } = useNotifications();
  const unread = (notifications ?? []).filter((n) => !n.is_read).length;

  return (
    <View className="relative px-5 pb-3 pt-2">
      {/* Centered greeting */}
      <View
        pointerEvents="none"
        className="absolute inset-x-0 bottom-3 top-2 items-center justify-center px-24"
      >
        {title ? (
          <>
            <Text className="text-xl font-extrabold text-ink" numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text className="text-xs text-ink-soft" numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <Text className="text-xs text-ink-soft">{greeting()},</Text>
            <View className="flex-row items-center gap-1.5">
              <Text className="text-2xl font-extrabold text-ink" numberOfLines={1}>
                {name?.split(" ")[0] ?? "Creator"}
              </Text>
              <Ionicons name="paw" size={16} color={colors.primary} style={{ transform: [{ rotate: "-20deg" }] }} />
            </View>
          </>
        )}
      </View>

      {/* Support (left) and notifications (right) */}
      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={() => router.push("/help")}
          className="h-11 flex-row items-center gap-1.5 rounded-full border border-primary-100 bg-white px-3.5"
        >
          <Ionicons name="headset-outline" size={18} color={colors.ink} />
          <Text className="text-sm font-semibold text-ink">Help</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push(isSignedIn ? "/notifications" : "/(auth)/login")}
          className="h-11 w-11 items-center justify-center rounded-full border border-primary-100 bg-white"
        >
          <Ionicons name={isSignedIn ? "notifications-outline" : "log-in-outline"} size={20} color={colors.ink} />
          {isSignedIn && unread > 0 ? (
            <View className="absolute -right-1 -top-1 h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1">
              <Text className="text-[10px] font-bold text-white">{unread}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
    </View>
  );
}
