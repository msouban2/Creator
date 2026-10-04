import { Alert, Image, Linking, Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useCampaign } from "../../src/api/campaigns";
import { useApplyToCampaign, useMyApplications, useAmazonQuota, isAmazonProductUrl, useCampaignSlotsLeft } from "../../src/api/applications";
import { useAddresses, useSaveAddress } from "../../src/api/profile";
import { Button } from "../../src/components/ui/Button";
import { Input } from "../../src/components/ui/Input";
import { CountdownCard } from "../../src/components/CountdownCard";
import { CampaignImage } from "../../src/components/CampaignImage";
import { colors, CAMPAIGN_TYPE_LABEL } from "../../src/lib/theme";
import { compactNumber, formatCurrency, formatDate } from "../../src/lib/format";
import { shareCampaign } from "../../src/lib/share";
import { useAuthStore } from "../../src/store/auth";

type TabKey = "details" | "tasks" | "eligibility" | "dos";

const TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "details", label: "Details", icon: "document-text-outline" },
  { key: "tasks", label: "Tasks", icon: "list-outline" },
  { key: "eligibility", label: "Eligibility", icon: "sparkles-outline" },
  { key: "dos", label: "Do's /Dont's", icon: "checkmark-done-outline" },
];

function TabBar({ value, onChange }: { value: TabKey; onChange: (t: TabKey) => void }) {
  return (
    <View className="mt-4 flex-row gap-2">
      {TABS.map((t) => {
        const active = t.key === value;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            className={`flex-1 items-center justify-center gap-1 rounded-2xl border py-2.5 ${
              active ? "border-primary bg-primary-50" : "border-primary-100 bg-white"
            }`}
          >
            <Ionicons name={t.icon} size={18} color={active ? colors.primary : colors.inkMuted} />
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              className={`text-[11px] font-semibold ${active ? "text-primary" : "text-ink-soft"}`}
            >
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TabCard({ children }: { children: React.ReactNode }) {
  return <View className="mt-4 rounded-2xl border border-primary-100 bg-white p-4">{children}</View>;
}

function EligibilityRow({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View className="flex-row items-center justify-between py-2.5">
      <View className="flex-row items-center gap-3">
        <Ionicons name={icon} size={18} color={colors.inkSoft} />
        <Text className="text-sm text-ink-soft">{label}</Text>
      </View>
      <Ionicons name="checkmark-circle" size={20} color={colors.success} />
    </View>
  );
}

function BulletLine({ text }: { text: string }) {
  return (
    <View className="mb-2 flex-row gap-2">
      <Text className="text-sm text-ink-soft">•</Text>
      <Text className="flex-1 text-sm leading-5 text-ink-soft">{text}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mt-5">
      <Text className="mb-2 text-base font-bold text-ink">{title}</Text>
      {children}
    </View>
  );
}

function Row({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View className="flex-row items-center gap-3 rounded-2xl bg-white p-3">
      <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-100">
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <View>
        <Text className="text-xs text-ink-muted">{label}</Text>
        <Text className="text-sm font-semibold text-ink">{value}</Text>
      </View>
    </View>
  );
}

export default function CampaignDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: viewportWidth } = useWindowDimensions();
  const imageInset = Math.min(40, Math.max(20, viewportWidth * 0.06));
  const [tab, setTab] = useState<TabKey>("details");
  const [galleryPreview, setGalleryPreview] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const { data: campaign, isLoading } = useCampaign(id!);
  const { data: myApps = [], isLoading: checkingApplications } = useMyApplications("all");
  const { data: addresses = [] } = useAddresses();
  const apply = useApplyToCampaign();
  const saveAddress = useSaveAddress();
  const profile = useAuthStore((s) => s.profile);
  const session = useAuthStore((s) => s.session);
  const [addressSheet, setAddressSheet] = useState(false);
  const [addr, setAddr] = useState({ name: "", phone: "", address: "", city: "", state: "", postal_code: "" });
  const isAmazonReimbursement =
    campaign?.campaign_type === "reimbursement" && isAmazonProductUrl(campaign?.product_url);
  const { data: quota } = useAmazonQuota();
  const amazonLimitReached = !!(isAmazonReimbursement && quota && quota.remaining <= 0);
  const { data: slotsLeft } = useCampaignSlotsLeft(id);

  if (isLoading || !campaign) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <Text className="text-ink-muted">Loading…</Text>
      </View>
    );
  }

  const productImages = Array.from(
    new Set([campaign.campaign_image, ...(campaign.campaign_images ?? [])].filter((image): image is string => !!image))
  );
  const heroImage = selectedImage && productImages.includes(selectedImage) ? selectedImage : productImages[0] ?? null;
  const imageAreaHeight = Math.min(
    480,
    Math.max(300, viewportWidth * 0.78 + (productImages.length > 0 ? 120 : 64))
  );
  const myApp = myApps.find((a) => a.campaign_id === campaign.id);
  const alreadyApplied = !!myApp;
  // Slots are full when none remain and the creator hasn't already applied
  // (their own application already holds a slot, so they can still view it).
  const slotsFull = !alreadyApplied && slotsLeft != null && slotsLeft <= 0;
  const reimbursementTotal = campaign.reward_amount + campaign.cashback_percentage;
  const needsFollowers = campaign.campaign_type !== "reimbursement";
  const needsAddress = campaign.campaign_type === "barter" || campaign.campaign_type === "paid";
  const followers = profile?.instagram_followers ?? 0;
  const meetsFollowers = !needsFollowers || followers >= campaign.min_followers;

  const rewardLabel =
    campaign.campaign_type === "reimbursement"
      ? "Earn up to"
      : campaign.campaign_type === "barter"
      ? "Product worth"
      : "Payout up to";

  const savedAddress = addresses[0];

  const doApply = async () => {
    try {
      const created = await apply.mutateAsync({ campaignId: campaign.id, campaignType: campaign.campaign_type });
      if (campaign.campaign_type === "reimbursement") {
        Alert.alert(
          "You're in! 🎉",
          "Buy the product from the product link, then upload your order & review screenshots to get reimbursed."
        );
        // Reimbursement auto-selects — take them straight to the application page
        // where they start the 15-min order window and upload the screenshot.
        router.replace(`/application/${created.id}`);
      } else {
        Alert.alert("Applied!", "Your application is under review.");
        router.replace("/(tabs)/campaigns");
      }
    } catch (e: any) {
      Alert.alert("Could not apply", e.message ?? "Try again.");
    }
  };

  const onApply = async () => {
    if (isAmazonReimbursement && quota && quota.remaining <= 0) {
      Alert.alert(
        "Monthly limit reached",
        `You've used all ${quota.limit} Amazon-product deals this month. Your quota resets on the 1st.`
      );
      return;
    }
    if (!meetsFollowers) {
      Alert.alert("Not eligible", `You need at least ${campaign.min_followers.toLocaleString("en-IN")} followers to apply.`);
      return;
    }
    // Barter/paid ship a product — confirm the delivery address (pre-filled from
    // the saved profile address, still editable) before applying.
    if (needsAddress) {
      setAddr({
        name: savedAddress?.name ?? profile?.full_name ?? "",
        phone: savedAddress?.phone ?? profile?.phone ?? "",
        address: savedAddress?.address ?? "",
        city: savedAddress?.city ?? "",
        state: savedAddress?.state ?? "",
        postal_code: savedAddress?.postal_code ?? "",
      });
      setAddressSheet(true);
      return;
    }
    await doApply();
  };

  const confirmAddressAndApply = async () => {
    if (!addr.address.trim() || !addr.city.trim()) {
      Alert.alert("Incomplete address", "Please enter at least the address and city.");
      return;
    }
    if (!addr.phone.trim() || addr.phone.trim().length < 10) {
      Alert.alert("Add phone", "Please enter a valid delivery phone number.");
      return;
    }
    try {
      await saveAddress.mutateAsync({ id: savedAddress?.id, ...addr });
      setAddressSheet(false);
      await doApply();
    } catch (e: any) {
      Alert.alert("Couldn't save address", e.message ?? "Try again.");
    }
  };

  const openProductLink = async () => {
    if (!campaign.product_url) return;
    try {
      const can = await Linking.canOpenURL(campaign.product_url);
      if (!can) throw new Error("invalid");
      await Linking.openURL(campaign.product_url);
    } catch {
      Alert.alert("Couldn't open link", "The product link seems invalid.");
    }
  };

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View
          style={{
            height: imageAreaHeight,
            paddingHorizontal: imageInset,
            paddingTop: insets.top + 8,
            paddingBottom: 16,
          }}
          className="bg-white"
        >
          <View className="h-10 flex-row items-center justify-between">
            <Pressable
              onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")}
              accessibilityRole="button"
              accessibilityLabel="Back to campaigns"
              className="h-10 w-10 items-center justify-center rounded-full bg-white/90"
            >
              <Ionicons name="chevron-back" size={22} color={colors.ink} />
            </Pressable>
            <Pressable
              onPress={() => shareCampaign(campaign, profile?.referral_code)}
              className="h-10 w-10 items-center justify-center rounded-full bg-white/90"
            >
              <Ionicons name="share-social-outline" size={20} color={colors.primary} />
            </Pressable>
          </View>

          {productImages.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mt-2 flex-grow-0"
              style={{ height: 56 }}
              contentContainerStyle={{ gap: 10, alignItems: "center" }}
            >
              {productImages.map((image) => (
                <Pressable
                  key={image}
                  onPress={() => setSelectedImage(image)}
                  className={`h-12 w-12 items-center justify-center rounded-xl border p-1 ${
                    heroImage === image ? "border-primary bg-primary-50" : "border-primary-100 bg-white"
                  }`}
                >
                  <Image source={{ uri: image }} className="h-full w-full rounded-lg" resizeMode="contain" />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          <Pressable
            onPress={() => heroImage && setGalleryPreview(heroImage)}
            className="mt-2 flex-1"
            accessibilityRole="button"
            accessibilityLabel="Open product image full screen"
          >
            <CampaignImage uri={heroImage} className="h-full w-full rounded-2xl bg-white" resizeMode="contain" iconSize={48} />
          </Pressable>
        </View>

        <Modal visible={!!galleryPreview} transparent={false} animationType="fade" onRequestClose={() => setGalleryPreview(null)}>
          <View className="flex-1 items-center justify-center bg-white p-5">
            <Pressable onPress={() => setGalleryPreview(null)} className="absolute right-5 top-12 z-10 h-10 w-10 items-center justify-center rounded-full bg-primary-50">
              <Ionicons name="close" size={22} color={colors.primary} />
            </Pressable>
            {galleryPreview ? <Image source={{ uri: galleryPreview }} className="h-full w-full rounded-2xl bg-white" resizeMode="contain" /> : null}
          </View>
        </Modal>

        <View className="-mt-6 rounded-t-3xl bg-canvas px-5 pt-5">
          <View className="self-start rounded-full bg-primary-100 px-3 py-1">
            <Text className="text-xs font-semibold text-primary">{CAMPAIGN_TYPE_LABEL[campaign.campaign_type]} Collaboration</Text>
          </View>
          <Text className="mt-2 text-2xl font-extrabold text-ink">{campaign.title}</Text>
          <View className="mt-1 flex-row items-center gap-1.5">
            <Ionicons name="business-outline" size={14} color={colors.primary} />
            <Text className="text-sm text-ink-soft">{campaign.brand_name}</Text>
          </View>

          <View className="mt-4 flex-row gap-3">
            <Row
              icon="cash-outline"
              label={rewardLabel}
              value={formatCurrency(campaign.campaign_type === "reimbursement" ? reimbursementTotal || campaign.reward_amount : campaign.reward_amount)}
            />
            {needsFollowers ? (
              <Row icon="people-outline" label="Min Followers" value={`${compactNumber(campaign.min_followers)}+`} />
            ) : null}
          </View>

          {!alreadyApplied && slotsLeft != null ? (
            <View
              className={`mt-4 flex-row items-center gap-2 rounded-2xl border p-3 ${
                slotsLeft <= 0 ? "border-red-200 bg-red-50" : "border-primary-100 bg-primary-50"
              }`}
            >
              <Ionicons
                name={slotsLeft <= 0 ? "lock-closed" : "people-outline"}
                size={16}
                color={slotsLeft <= 0 ? "#dc2626" : colors.primary}
              />
              <Text className="text-sm font-semibold text-ink">
                {slotsLeft <= 0
                  ? "Slots full — all spots are taken"
                  : `${slotsLeft} of ${campaign.slots} slot${campaign.slots === 1 ? "" : "s"} left`}
              </Text>
            </View>
          ) : null}

          {isAmazonReimbursement && quota ? (
            <View
              className={`mt-4 rounded-2xl border p-4 ${
                quota.remaining <= 0 ? "border-red-200 bg-red-50" : "border-primary-100 bg-primary-50"
              }`}
            >
              <View className="flex-row items-center gap-2">
                <Ionicons
                  name={quota.remaining <= 0 ? "alert-circle" : "cart-outline"}
                  size={18}
                  color={quota.remaining <= 0 ? "#dc2626" : colors.primary}
                />
                <Text className="text-sm font-semibold text-ink">
                  {quota.remaining <= 0
                    ? "Amazon monthly limit reached"
                    : `${quota.remaining} of ${quota.limit} Amazon deals left this month`}
                </Text>
              </View>
              <Text className="mt-1 text-xs text-ink-muted">
                {quota.remaining <= 0
                  ? "You can apply to Amazon-product deals again next month."
                  : `You've used ${quota.used} of ${quota.limit} this month. Resets on the 1st.`}
              </Text>
            </View>
          ) : null}

          <TabBar value={tab} onChange={setTab} />

          {tab === "details" ? (
            <TabCard>
              {campaign.description ? (
                <Text className="text-sm leading-5 text-ink-soft">{campaign.description}</Text>
              ) : (
                <Text className="text-sm leading-5 text-ink-soft">
                  Purchase the product and share your honest review as per the instructions
                  mentioned in the Do's &amp; Dont's section.
                </Text>
              )}

              {campaign.product_name ? (
                <Section title="Product">
                  <Text className="text-sm leading-5 text-ink-soft">{campaign.product_name}</Text>
                </Section>
              ) : null}

              {campaign.deliverables ? (
                <Section title="Deliverables">
                  <Text className="text-sm leading-5 text-ink-soft">{campaign.deliverables}</Text>
                </Section>
              ) : null}

              {campaign.campaign_type !== "reimbursement" && (campaign.sample_video_url || (campaign.sample_screenshots?.length ?? 0) > 0) ? (
                <Section title="Sample content">
                  <Text className="mb-2 text-xs text-ink-muted">Reference examples of what to create.</Text>
                  {campaign.sample_video_url ? (
                    <Button
                      label="Watch reference video"
                      variant="outline"
                      fullWidth
                      onPress={() => campaign.sample_video_url && Linking.openURL(campaign.sample_video_url)}
                      leftIcon={<Ionicons name="play-circle-outline" size={18} color={colors.primary} />}
                    />
                  ) : null}
                  {(campaign.sample_screenshots?.length ?? 0) > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3">
                      <View className="flex-row gap-2">
                        {campaign.sample_screenshots!.map((url, i) => (
                          <Pressable key={url + i} onPress={() => Linking.openURL(url)}>
                            <Image source={{ uri: url }} className="h-40 w-28 rounded-xl" />
                          </Pressable>
                        ))}
                      </View>
                    </ScrollView>
                  ) : null}
                </Section>
              ) : null}

              {campaign.campaign_type !== "reimbursement" ? (
                <Section title="Timeline">
                  <View className="gap-3">
                    {campaign.campaign_deadline ? (
                      <CountdownCard
                        target={campaign.campaign_deadline}
                        label="Campaign ends in"
                      />
                    ) : null}
                    <Row icon="calendar-outline" label="Campaign deadline" value={formatDate(campaign.campaign_deadline)} />
                  </View>
                </Section>
              ) : null}
            </TabCard>
          ) : null}

          {tab === "tasks" ? (
            <TabCard>
              <Text className="mb-2 text-sm text-ink-soft">Please find your tasks below:</Text>
              <Text className="mb-3 text-base font-bold text-ink">Tasks</Text>
              {campaign.instructions ? (
                <Text className="text-sm leading-6 text-ink-soft">{campaign.instructions}</Text>
              ) : (
                <View>
                  <BulletLine text="1. Make a purchase and upload the order screenshot." />
                  <BulletLine text="2. After product delivery, write a review and share the review proof screenshot." />
                  <BulletLine text="3. Share the review screenshot when your review is live." />
                  <BulletLine text="4. Share the return window close screenshot when the order return window is closed (if required)." />
                </View>
              )}
            </TabCard>
          ) : null}

          {tab === "eligibility" ? (
            <TabCard>
              <Text className="mb-1 text-sm text-ink-soft">Below is the eligibility criteria</Text>
              <Text className="mb-2 text-base font-bold text-ink">Eligibility</Text>
              {campaign.category ? <EligibilityRow icon="grid-outline" label={campaign.category} /> : null}
              {needsFollowers ? (
                <EligibilityRow
                  icon="people-outline"
                  label={`${compactNumber(campaign.min_followers)}+ followers`}
                />
              ) : null}
              <EligibilityRow icon="location-outline" label="PAN India" />
              <EligibilityRow icon="locate-outline" label="Resident of India" />
            </TabCard>
          ) : null}

          {tab === "dos" ? (
            <TabCard>
              <Text className="mb-3 text-base font-bold text-ink">Do&apos;s &amp; Dont&apos;s</Text>
              <View>
                <BulletLine text="Write an ORIGINAL review sharing why you liked the product and what worked for you ✅" />
                <BulletLine text="You may HIGHLIGHT the product's key features or your experience ✅" />
                <BulletLine text="Keep a screenshot of 'Review Submitted Successfully' once you submit the review ✅" />
                <BulletLine text="One-liners or reviews WITHOUT a Verified Purchase tag will not be approved ❌" />
                <BulletLine text="DO NOT copy-paste the product description or replicate content from other live reviews ❌" />
                <BulletLine text="Please REFRAIN from using the brand name or competitor brand names ❌" />
              </View>
            </TabCard>
          ) : null}
        </View>
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 flex-row items-center gap-3 border-t border-primary-100 bg-white px-5 pb-8 pt-3">
        {campaign.product_url ? (
          <View className="flex-1">
            <Button
              label="Product Link"
              onPress={openProductLink}
              variant="outline"
              fullWidth
              leftIcon={<Ionicons name="open-outline" size={18} color={colors.primary} />}
            />
          </View>
        ) : null}
        <View className={campaign.product_url ? "flex-[1.3]" : "flex-1"}>
          <Button
            label={!session ? "Log in to apply" : checkingApplications ? "Checking application…" : alreadyApplied ? "View Application" : slotsFull ? "Slots full" : amazonLimitReached ? "Limit reached" : "Apply Campaign"}
            onPress={!session ? () => router.push("/(auth)/login") : checkingApplications ? () => {} : alreadyApplied && myApp ? () => router.push(`/application/${myApp.id}`) : onApply}
            loading={apply.isPending || checkingApplications}
            disabled={!!session && (checkingApplications || (!alreadyApplied && (amazonLimitReached || slotsFull)))}
            variant="primary"
            fullWidth
            rightIcon={<Ionicons name="arrow-forward" size={18} color="#fff" />}
          />
        </View>
      </View>

      {/* Delivery address confirm sheet (barter/paid) */}
      <Modal visible={addressSheet} transparent animationType="slide" onRequestClose={() => setAddressSheet(false)}>
        <View className="flex-1 justify-end bg-black/50">
          <View style={{ paddingBottom: insets.bottom + 12 }} className="rounded-t-3xl bg-canvas px-5 pt-5">
            <View className="mb-1 flex-row items-center justify-between">
              <Text className="text-lg font-extrabold text-ink">Delivery address</Text>
              <Pressable onPress={() => setAddressSheet(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color={colors.ink} />
              </Pressable>
            </View>
            <Text className="mb-4 text-xs text-ink-soft">
              {savedAddress
                ? "We've filled in your saved address. Edit it if this product should ship somewhere else."
                : "This campaign ships a product to you. Add your delivery address."}
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
              <View className="gap-3">
                <Input label="Full Name" icon="person-outline" placeholder="Recipient name" value={addr.name} onChangeText={(v) => setAddr((p) => ({ ...p, name: v }))} />
                <Input label="Phone" icon="call-outline" placeholder="Delivery phone" keyboardType="phone-pad" value={addr.phone} onChangeText={(v) => setAddr((p) => ({ ...p, phone: v }))} />
                <Input label="Address" icon="location-outline" placeholder="House no, street, area" value={addr.address} onChangeText={(v) => setAddr((p) => ({ ...p, address: v }))} />
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Input label="City" icon="business-outline" placeholder="City" value={addr.city} onChangeText={(v) => setAddr((p) => ({ ...p, city: v }))} />
                  </View>
                  <View className="flex-1">
                    <Input label="State" icon="map-outline" placeholder="State" value={addr.state} onChangeText={(v) => setAddr((p) => ({ ...p, state: v }))} />
                  </View>
                </View>
                <Input label="Pincode" icon="pin-outline" placeholder="6-digit pincode" keyboardType="number-pad" maxLength={6} value={addr.postal_code} onChangeText={(v) => setAddr((p) => ({ ...p, postal_code: v }))} />
              </View>
            </ScrollView>

            <View className="mt-4">
              <Button
                label={savedAddress ? "Confirm & Apply" : "Save & Apply"}
                variant="dark"
                fullWidth
                loading={saveAddress.isPending || apply.isPending}
                onPress={confirmAddressAndApply}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
