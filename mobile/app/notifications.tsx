import { FlatList, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { markNotificationRead, useNotifications } from "../src/api/notifications";
import { EmptyState } from "../src/components/ui/EmptyState";
import { colors } from "../src/lib/theme";
import { formatDate } from "../src/lib/format";

const ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  payment: "cash-outline",
  referral: "people-outline",
  general: "notifications-outline",
};

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: notifications = [], refetch } = useNotifications();

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top + 12 }}>
      <View className="flex-row items-center gap-3 px-5 pb-4">
        <Pressable onPress={() => router.back()}><Ionicons name="chevron-back" size={26} color={colors.ink} /></Pressable>
        <Text className="text-xl font-bold text-ink">Notifications</Text>
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={async () => { if (!item.is_read) { await markNotificationRead(item.id); refetch(); } }}
            className={`mx-5 mb-2.5 flex-row items-start gap-3 rounded-2xl border p-3.5 ${item.is_read ? "border-primary-50 bg-white" : "border-primary-100 bg-primary-50"}`}
          >
            <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-100">
              <Ionicons name={ICON[item.type ?? "general"] ?? "notifications-outline"} size={18} color={colors.primary} />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-ink">{item.title}</Text>
              {item.message ? <Text className="text-xs text-ink-soft">{item.message}</Text> : null}
              <Text className="mt-1 text-[10px] text-ink-muted">{formatDate(item.created_at)}</Text>
            </View>
            {!item.is_read ? <View className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
          </Pressable>
        )}
        ListEmptyComponent={<EmptyState icon="notifications-outline" title="No notifications" message="You're all caught up!" />}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
