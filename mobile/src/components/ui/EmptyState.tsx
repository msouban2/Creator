import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../lib/theme";

export function EmptyState({
  icon = "sparkles-outline",
  title,
  message,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
}) {
  return (
    <View className="items-center justify-center px-8 py-16">
      <View className="mb-4 h-20 w-20 items-center justify-center rounded-3xl bg-primary-100">
        <Ionicons name={icon} size={36} color={colors.primary} />
      </View>
      <Text className="text-center text-xl font-bold text-ink">{title}</Text>
      {message ? (
        <Text className="mt-2 text-center text-sm text-ink-muted">{message}</Text>
      ) : null}
    </View>
  );
}

export function ScreenSafeArea({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.canvas }}>
      {children}
    </SafeAreaView>
  );
}
