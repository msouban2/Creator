import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Input } from "../src/components/ui/Input";
import { Button } from "../src/components/ui/Button";
import { Card } from "../src/components/ui/Card";
import { supabase } from "../src/lib/supabase";
import { useAddresses } from "../src/api/profile";
import { useAuthStore } from "../src/store/auth";
import { colors } from "../src/lib/theme";

export default function AddressScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const userId = useAuthStore((s) => s.session?.user?.id);
  const { data: addresses = [], refetch } = useAddresses();
  const [form, setForm] = useState({ name: "", phone: "", address: "", city: "", state: "", postal_code: "" });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form) => (v: string) => setForm((p) => ({ ...p, [k]: v }));

  const onSave = async () => {
    if (!form.address || !form.city) return Alert.alert("Incomplete", "Enter address and city.");
    if (!form.phone || form.phone.trim().length < 10)
      return Alert.alert("Incomplete", "Enter a valid delivery phone number.");
    setSaving(true);
    try {
      const { error } = await supabase.from("creator_addresses").insert({ ...form, user_id: userId, country: "India" });
      if (error) throw error;
      setForm({ name: "", phone: "", address: "", city: "", state: "", postal_code: "" });
      refetch();
      Alert.alert("Saved", "Address added.");
    } catch (e: any) {
      Alert.alert("Failed", e.message ?? "Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerStyle={{ paddingBottom: 60, paddingTop: insets.top + 12 }}>
      <View className="flex-row items-center gap-3 px-5 pb-4">
        <Pressable onPress={() => router.back()}><Ionicons name="chevron-back" size={26} color={colors.ink} /></Pressable>
        <Text className="text-xl font-bold text-ink">Address</Text>
      </View>

      {addresses.length > 0 ? (
        <View className="gap-3 px-5 pb-4">
          {addresses.map((a) => (
            <Card key={a.id} className="flex-row items-start gap-3">
              <Ionicons name="location" size={20} color={colors.primary} />
              <View className="flex-1">
                <Text className="text-sm font-bold text-ink">{a.name}</Text>
                {a.phone ? <Text className="text-xs text-ink-soft">📞 {a.phone}</Text> : null}
                <Text className="text-xs text-ink-soft">{a.address}, {a.city}, {a.state} - {a.postal_code}</Text>
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      <Text className="mx-5 mb-2 text-base font-bold text-ink">Add New Address</Text>
      <View className="gap-4 px-5">
        <Input label="Name" icon="person-outline" value={form.name} onChangeText={set("name")} />
        <Input label="Phone Number" icon="call-outline" keyboardType="phone-pad" value={form.phone} onChangeText={set("phone")} />
        <Input label="Address" icon="home-outline" value={form.address} onChangeText={set("address")} />
        <Input label="City" icon="business-outline" value={form.city} onChangeText={set("city")} />
        <Input label="State" icon="map-outline" value={form.state} onChangeText={set("state")} />
        <Input label="Postal Code" icon="mail-outline" keyboardType="number-pad" value={form.postal_code} onChangeText={set("postal_code")} />
        <Button label="Save Address" onPress={onSave} loading={saving} variant="dark" fullWidth />
      </View>
    </ScrollView>
  );
}
