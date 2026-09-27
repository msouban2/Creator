import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../src/components/ui/Card";
import { colors } from "../src/lib/theme";
import { useMyTickets } from "../src/api/support";

const OPTIONS = [
  { icon: "logo-whatsapp", label: "WhatsApp Support", sub: "+91 79743 11721", action: () => Linking.openURL("https://wa.me/917974311721") },
  { icon: "mail-outline", label: "Email Us", sub: "support@thebilkul.in", action: () => Linking.openURL("mailto:support@thebilkul.in") },
  { icon: "call-outline", label: "Call Support", sub: "+91 79743 11721", action: () => Linking.openURL("tel:+917974311721") },
] as const;

const FAQ = [
  { q: "How do I apply for a campaign?", a: "Browse campaigns on the Home screen and tap Apply Campaign." },
  { q: "When do I get paid?", a: "Payments are released after your submitted content is approved." },
  { q: "How do referrals work?", a: "Share your referral code. You earn a bonus when referred creators complete campaigns." },
];

export default function HelpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tickets = useMyTickets();
  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerStyle={{ paddingBottom: 60, paddingTop: insets.top + 12 }}>
      <View className="flex-row items-center gap-3 px-5 pb-4">
        <Pressable onPress={() => router.back()}><Ionicons name="chevron-back" size={26} color={colors.ink} /></Pressable>
        <Text className="text-xl font-bold text-ink">Help & Support</Text>
      </View>

      <View className="gap-3 px-5">
        {OPTIONS.map((o) => (
          <Pressable key={o.label} onPress={o.action}>
            <Card className="flex-row items-center gap-3">
              <View className="h-11 w-11 items-center justify-center rounded-full bg-primary-100">
                <Ionicons name={o.icon} size={20} color={colors.ink} />
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold text-ink">{o.label}</Text>
                <Text className="text-xs text-ink-muted">{o.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
            </Card>
          </Pressable>
        ))}
      </View>

      {/* In-app support tickets */}
      <View className="mt-6 flex-row items-center justify-between px-5">
        <Text className="text-base font-bold text-ink">My requests</Text>
        <Pressable
          onPress={() => router.push("/support/new" as Href)}
          className="flex-row items-center gap-1 rounded-full bg-primary px-3 py-1.5"
        >
          <Ionicons name="add" size={16} color="#fff" />
          <Text className="text-xs font-bold text-white">New query</Text>
        </Pressable>
      </View>
      <View className="mt-2 gap-3 px-5">
        {tickets.isLoading ? (
          <Text className="text-xs text-ink-muted">Loading…</Text>
        ) : (tickets.data ?? []).length === 0 ? (
          <Text className="text-xs text-ink-muted">No requests yet. Tap “New request” to reach our team.</Text>
        ) : (
          tickets.data!.map((t) => (
            <Pressable key={t.id} onPress={() => router.push(`/support/${t.id}` as Href)}>
              <Card className="flex-row items-center gap-3">
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-ink" numberOfLines={1}>{t.subject}</Text>
                  <Text className="text-xs text-ink-muted">
                    Updated {new Date(t.last_message_at).toLocaleDateString("en-IN")}
                  </Text>
                </View>
                <View className={"rounded-full px-2 py-0.5 " + (t.status === "open" ? "bg-primary-100" : "bg-green-50")}>
                  <Text className={"text-[10px] font-bold " + (t.status === "open" ? "text-primary" : "text-success")}>
                    {t.status === "open" ? "Open" : "Resolved"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
              </Card>
            </Pressable>
          ))
        )}
      </View>

      <Text className="mx-5 mt-6 text-base font-bold text-ink">Frequently Asked</Text>
      <View className="mt-2 gap-3 px-5">
        {FAQ.map((f) => (
          <Card key={f.q}>
            <Text className="text-sm font-bold text-ink">{f.q}</Text>
            <Text className="mt-1 text-xs text-ink-soft">{f.a}</Text>
          </Card>
        ))}
      </View>
    </ScrollView>
  );
}
