import { Tabs } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../src/lib/theme";
import { KycReminder } from "../../src/components/KycReminder";
import { useAuthStore } from "../../src/store/auth";

const LABELS: Record<string, string> = {
  index: "Home",
  campaigns: "Campaigns",
  referrals: "Referrals",
  profile: "Profile",
};

const ICONS_FOCUSED: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: "home",
  campaigns: "clipboard",
  referrals: "gift",
  profile: "person",
};

const ICONS_OUTLINE: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: "home-outline",
  campaigns: "clipboard-outline",
  referrals: "gift-outline",
  profile: "person-outline",
};

function TabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        position: "absolute",
        left: 16,
        right: 16,
        bottom: insets.bottom ? insets.bottom : 12,
        paddingVertical: 12,
        paddingHorizontal: 8,
        backgroundColor: colors.ink,
        borderRadius: 30,
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
        elevation: 16,
      }}
    >
      <View className="flex-row items-center justify-around">
        {state.routes.map((route: any, index: number) => {
          const focused = state.index === index;
          const onPress = () => {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };
          return (
            <Pressable key={route.key} onPress={onPress} className="flex-1 items-center">
              <View className="items-center justify-center gap-1 px-3 py-1">
                <Ionicons
                  name={(focused ? ICONS_FOCUSED : ICONS_OUTLINE)[route.name] ?? "ellipse"}
                  size={22}
                  color={focused ? "#FFFFFF" : "#8A8A8A"}
                />
                <Text
                  numberOfLines={1}
                  className="text-[10px]"
                  style={{
                    color: focused ? "#FFFFFF" : "#8A8A8A",
                    fontWeight: focused ? "700" : "500",
                  }}
                >
                  {LABELS[route.name]}
                </Text>
                <View
                  style={{
                    marginTop: 2,
                    height: 3,
                    width: 18,
                    borderRadius: 2,
                    backgroundColor: focused ? colors.primary : "transparent",
                  }}
                />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const isSignedIn = !!useAuthStore((s) => s.session);
  return (
    <>
      <Tabs
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.canvas } }}
        tabBar={(props) => <TabBar {...props} />}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="campaigns" />
        <Tabs.Screen name="referrals" options={{ href: isSignedIn ? undefined : null }} />
        <Tabs.Screen name="profile" options={{ href: isSignedIn ? undefined : null }} />
      </Tabs>
      <KycReminder />
    </>
  );
}
