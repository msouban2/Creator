import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../src/lib/supabase";
import { useAuthStore } from "../../src/store/auth";
import { Card } from "../../src/components/ui/Card";
import { colors } from "../../src/lib/theme";
import { useTicketMessages } from "../../src/api/support";

export default function RequestDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const ticketId = String(id ?? "");
  const myId = useAuthStore((s) => s.profile?.id);
  const messages = useTicketMessages(ticketId);

  const { data: ticket } = useQuery({
    queryKey: ["support-ticket", ticketId],
    enabled: !!ticketId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("subject, status, created_at")
        .eq("id", ticketId)
        .maybeSingle();
      if (error) throw error;
      return data as { subject: string; status: "open" | "resolved"; created_at: string } | null;
    },
  });

  const all = messages.data ?? [];
  const mine = all.filter((m) => m.author_id === myId);
  const teamReplies = all.filter((m) => m.author_id !== myId);

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingTop: insets.top + 12 }}
    >
      <View className="flex-row items-center gap-3 px-5 pb-4">
        <Pressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text className="flex-1 text-xl font-bold text-ink" numberOfLines={1}>
          {ticket?.subject ?? "Help request"}
        </Text>
        {ticket ? (
          <View className={"rounded-full px-2 py-0.5 " + (ticket.status === "open" ? "bg-primary-100" : "bg-green-50")}>
            <Text className={"text-[10px] font-bold " + (ticket.status === "open" ? "text-primary" : "text-success")}>
              {ticket.status === "open" ? "Open" : "Resolved"}
            </Text>
          </View>
        ) : null}
      </View>

      <View className="gap-3 px-5">
        {/* Your request */}
        <Card>
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Your request</Text>
          {mine.map((m) => (
            <Text key={m.id} className="mt-1 text-sm text-ink">{m.body}</Text>
          ))}
          {ticket ? (
            <Text className="mt-2 text-[11px] text-ink-muted">
              Sent {new Date(ticket.created_at).toLocaleString("en-IN")}
            </Text>
          ) : null}
        </Card>

        {/* Team response (read-only) */}
        {teamReplies.length > 0 ? (
          <Card>
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Response from our team</Text>
            {teamReplies.map((m) => (
              <View key={m.id} className="mt-2">
                <Text className="text-sm text-ink">{m.body}</Text>
                <Text className="mt-0.5 text-[10px] text-ink-muted">{new Date(m.created_at).toLocaleString("en-IN")}</Text>
              </View>
            ))}
          </Card>
        ) : (
          <Card>
            <Text className="text-sm text-ink-soft">
              Thanks for reaching out. Our team is on it and will contact you shortly.
            </Text>
          </Card>
        )}

        {/* Contact shortcuts */}
        <Text className="mt-2 text-xs text-ink-muted">Need it sooner? Reach us directly:</Text>
        <Pressable onPress={() => Linking.openURL("https://wa.me/917974311721")}>
          <Card className="flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-100">
              <Ionicons name="logo-whatsapp" size={18} color={colors.primary} />
            </View>
            <Text className="flex-1 text-sm font-semibold text-ink">WhatsApp Support</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
          </Card>
        </Pressable>
        <Pressable onPress={() => Linking.openURL("mailto:support@thebilkul.in")}>
          <Card className="flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-100">
              <Ionicons name="mail-outline" size={18} color={colors.primary} />
            </View>
            <Text className="flex-1 text-sm font-semibold text-ink">Email Us</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
          </Card>
        </Pressable>
      </View>
    </ScrollView>
  );
}
