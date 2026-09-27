import { useState } from "react";
import { Alert, Image, Pressable, ScrollView, Text, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Input } from "../../src/components/ui/Input";
import { Button } from "../../src/components/ui/Button";
import { colors } from "../../src/lib/theme";
import { useAuthStore } from "../../src/store/auth";
import { useCreateTicket } from "../../src/api/support";

const CATEGORIES = [
  "Payment issue",
  "Campaign help",
  "Account / profile",
  "KYC / verification",
  "Technical problem",
  "Other",
];

export default function ContactUsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useAuthStore((s) => s.profile);
  const create = useCreateTicket();

  const [category, setCategory] = useState("");
  const [catOpen, setCatOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [email, setEmail] = useState(profile?.email ?? "");
  const [name, setName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [imageUri, setImageUri] = useState<string | null>(null);

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Please allow photo access to attach a screenshot.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
    });
    if (!res.canceled && res.assets[0]) setImageUri(res.assets[0].uri);
  };

  const submit = async () => {
    if (!category) {
      Alert.alert("Select a category", "Please choose what your query is about.");
      return;
    }
    if (!query.trim()) {
      Alert.alert("Add your query", "Please explain your query so we can help.");
      return;
    }
    try {
      await create.mutateAsync({ category, query: query.trim(), email, name, phone, imageUri });
      Alert.alert("Query submitted 🎉", "Thanks! Our team will get back to you soon.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert("Couldn't submit", e.message ?? "Please try again.");
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-canvas">
      <ScrollView
        className="flex-1 bg-canvas"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: insets.top + 12 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-center gap-3 px-5 pb-2">
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={26} color={colors.ink} />
          </Pressable>
          <Text className="text-xl font-bold text-ink">Contact Us</Text>
        </View>
        <Text className="px-5 pb-4 text-sm text-ink-soft">Please fill out the details, we'll get back to you soon.</Text>

        <View className="gap-4 px-5">
          {/* Category */}
          <View className="gap-2">
            <Text className="text-sm font-semibold text-ink">Select category</Text>
            <Pressable
              onPress={() => setCatOpen((v) => !v)}
              className="h-14 flex-row items-center justify-between rounded-2xl border border-primary-100 bg-white px-4"
            >
              <Text className={category ? "text-base text-ink" : "text-base text-ink-muted"}>
                {category || "Select category"}
              </Text>
              <Ionicons name={catOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.inkMuted} />
            </Pressable>
            {catOpen ? (
              <View className="overflow-hidden rounded-2xl border border-primary-100 bg-white">
                {CATEGORIES.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => {
                      setCategory(c);
                      setCatOpen(false);
                    }}
                    className="border-b border-primary-50 px-4 py-3"
                  >
                    <Text className="text-base text-ink">{c}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          {/* Query */}
          <Input
            label="Your query"
            icon="chatbubble-ellipses-outline"
            value={query}
            onChangeText={setQuery}
            placeholder="Explain your query here"
            multiline
          />

          {/* Contact details */}
          <Input label="Email Id" icon="mail-outline" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
          <Input label="Your Name" icon="person-outline" value={name} onChangeText={setName} />
          <Input label="Mobile No." icon="call-outline" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />

          {/* Screenshot */}
          <View className="gap-2">
            <Text className="text-sm font-semibold text-ink">Screenshot of the issue (if applicable)</Text>
            {imageUri ? (
              <View className="overflow-hidden rounded-2xl border border-primary-100">
                <Image source={{ uri: imageUri }} style={{ width: "100%", height: 180 }} resizeMode="cover" />
                <Pressable onPress={() => setImageUri(null)} className="absolute right-2 top-2 h-8 w-8 items-center justify-center rounded-full bg-black/60">
                  <Ionicons name="close" size={16} color="#fff" />
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={pickImage}
                className="items-center justify-center rounded-2xl border border-dashed border-primary-200 bg-white py-8"
              >
                <Ionicons name="cloud-upload-outline" size={30} color={colors.primary} />
                <Text className="mt-2 text-sm text-ink-soft">Upload a screenshot</Text>
                <Text className="text-xs text-ink-muted">Images only</Text>
              </Pressable>
            )}
          </View>

          <Text className="mt-1 text-center text-xs text-ink-muted">
            Responses are available from 10 AM to 7 PM on working days.
          </Text>

          <Button
            label={create.isPending ? "Submitting…" : "Submit query"}
            onPress={submit}
            loading={create.isPending}
            variant="dark"
            fullWidth
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
