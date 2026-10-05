import { useEffect, useRef, useState } from "react";
import { Alert, Image, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as Notifications from "expo-notifications";
import { Ionicons } from "@expo/vector-icons";
import { useApplication, useCampaignSlotSummary, useSubmitPurchaseProof, useSubmitDraftVideo, useSubmitReelLink, useSubmitDeliveryPhoto, useSubmitOrderScreenshot, useStartOrderWindow } from "../../src/api/applications";
import { SampleProofChip } from "../../src/components/SampleProof";
import { SAMPLE_ORDER_SCREENSHOT } from "../../src/lib/samples";
import { Card } from "../../src/components/ui/Card";
import { Input } from "../../src/components/ui/Input";
import { StatusBadge } from "../../src/components/ui/StatusBadge";
import { Button } from "../../src/components/ui/Button";
import { CountdownCard, useCountdown } from "../../src/components/CountdownCard";
import { CampaignImage } from "../../src/components/CampaignImage";
import { STEPS_BY_TYPE, stepIndexForStatus, stepLabel, colors, CAMPAIGN_TYPE_LABEL } from "../../src/lib/theme";
import { formatCurrency, formatDate } from "../../src/lib/format";

export default function ApplicationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: app, isLoading } = useApplication(id!);
  const appCampaign = app?.campaign;
  const {
    data: campaignSlotSummary,
    isLoading: campaignSlotsLoading,
    error: campaignSlotsError,
  } = useCampaignSlotSummary(appCampaign?.id, appCampaign?.slots ?? 0, appCampaign?.campaign_type);
  const submitDraft = useSubmitDraftVideo();
  const submitReelLink = useSubmitReelLink();
  const submitDelivery = useSubmitDeliveryPhoto();
  const submitOrderScreenshot = useSubmitOrderScreenshot();
  const startOrderWindow = useStartOrderWindow();
  const [orderScreenshot, setOrderScreenshot] = useState<string | null>(null);
  const [draftVideo, setDraftVideo] = useState<string | null>(null);
  const [reelLink, setReelLink] = useState("");
  const [deliveryImage, setDeliveryImage] = useState<string | null>(null);
  const notifiedRef = useRef(false);

  // Purchase window: from the moment the creator is selected they have 15
  // Purchase/order window: from selection the creator has 15 minutes to buy the
  // product and upload the order screenshot. If it lapses they must wait 24h
  // from the window start before they can restart it and try again. The window
  // is anchored on order_started_at (a resettable stamp), falling back to
  // selected_at for the first window.
  // NOTE: computed with optional chaining and all hooks below run
  // unconditionally so they stay above the loading early-return (rules of hooks).
  const PURCHASE_WINDOW_MINUTES = 15;
  const ORDER_RETRY_COOLDOWN_HOURS = 24;
  const windowStart = app?.order_started_at ?? app?.selected_at ?? null;
  const purchaseWindowDeadline = windowStart
    ? new Date(new Date(windowStart).getTime() + PURCHASE_WINDOW_MINUTES * 60 * 1000).toISOString()
    : null;
  const orderRetryAt = windowStart
    ? new Date(new Date(windowStart).getTime() + ORDER_RETRY_COOLDOWN_HOURS * 3600 * 1000).toISOString()
    : null;
  const purchaseCountdown = useCountdown(purchaseWindowDeadline);
  const retryCountdown = useCountdown(orderRetryAt);
  const purchaseWindowExpired =
    app?.status === "selected" && !!windowStart && !!purchaseCountdown?.ended;
  // Once the window has expired, the creator is in the 24h cooldown until the
  // retry timer ends; then they can restart the 15-min window.
  const retryReady = purchaseWindowExpired && !!retryCountdown?.ended;
  const orderRetrySlotsFull =
    app?.campaign?.campaign_type === "reimbursement" &&
    !!campaignSlotSummary &&
    campaignSlotSummary.available <= 0;
  const orderRetryCapacityUnknown =
    app?.campaign?.campaign_type === "reimbursement" &&
    (campaignSlotsLoading || !!campaignSlotsError || !campaignSlotSummary);

  // Re-upload after rejection: creators get up to 5 free re-uploads (across the
  // order-screenshot and content stages); after that they must wait 24h between
  // attempts. `reject_count`/`last_rejected_at` are stamped server-side.
  const REJECT_MAX_FREE = 5;
  const REJECT_COOLDOWN_HOURS = 24;
  const rawRejectCount = app?.reject_count ?? 0;
  const reuploadRetryAt =
    rawRejectCount >= REJECT_MAX_FREE && app?.last_rejected_at
      ? new Date(new Date(app.last_rejected_at).getTime() + REJECT_COOLDOWN_HOURS * 3600 * 1000).toISOString()
      : null;
  const reuploadCountdown = useCountdown(reuploadRetryAt);
  const reuploadBlocked = !!reuploadCountdown && !reuploadCountdown.ended;
  // Once the 24h cooldown has elapsed the server resets the counter on the next
  // re-upload, so treat the count as 0 in the UI to avoid "Attempt 6 of 5".
  const cooldownElapsed = rawRejectCount >= REJECT_MAX_FREE && !!reuploadCountdown && reuploadCountdown.ended;
  const rejectCount = cooldownElapsed ? 0 : rawRejectCount;

  // Reset the "1 minute left" flag whenever the purchase window (re)starts.
  useEffect(() => {
    notifiedRef.current = false;
  }, [windowStart]);

  // Schedule a local "1 minute left" notification once, ~14 minutes into the
  // 15-minute purchase window.
  useEffect(() => {
    if (
      app?.status === "selected" &&
      windowStart &&
      purchaseCountdown &&
      !purchaseCountdown.ended &&
      purchaseCountdown.minutes === 0 &&
      purchaseCountdown.seconds <= 60 &&
      !notifiedRef.current
    ) {
      notifiedRef.current = true;
      Notifications.scheduleNotificationAsync({
        content: {
          title: "1 minute left!",
          body: "Buy the product and upload your order screenshot now to keep your spot.",
        },
        trigger: null,
      }).catch(() => {});
    }
  }, [purchaseCountdown?.ended, purchaseCountdown?.minutes, purchaseCountdown?.seconds, app?.status, windowStart]);

  if (isLoading || !app || !app.campaign) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <Text className="text-ink-muted">Loading…</Text>
      </View>
    );
  }

  const c = app.campaign;
  const type = c.campaign_type;
  const steps = STEPS_BY_TYPE[type] ?? [];
  const currentIndex = stepIndexForStatus(type, app.status);

  // Which rejection stage are we in — so we know what the creator can re-upload.
  const orderStageReject = type === "reimbursement" && !!app.purchase_proof && !app.product_received_at;
  const reachedContent =
    !!app.product_received_at || !!app.shipped_at || !!app.delivered_at || !!app.draft_video_url || !!app.reel_link;
  const contentStageReject = !orderStageReject && reachedContent;
  // Reimbursement pays back what the creator actually paid (product free) plus
  // the flat cashback bonus. Before purchase we estimate with the campaign price.
  const reimbursementTotal = (app.purchase_amount ?? c.reward_amount) + c.cashback_percentage;

  // Staff have 24 hours to approve a submitted order screenshot. The countdown
  // runs from when the creator submitted it (order_submitted_at).
  const ORDER_APPROVAL_HOURS = 24;
  const orderApprovalDeadline =
    app.order_submitted_at
      ? new Date(new Date(app.order_submitted_at).getTime() + ORDER_APPROVAL_HOURS * 3600 * 1000).toISOString()
      : null;

  const openProductLink = () => {
    if (!c.product_url) {
      Alert.alert("No link yet", "The brand hasn't added a purchase link. Please check back soon.");
      return;
    }
    Linking.openURL(c.product_url).catch(() =>
      Alert.alert("Couldn't open link", "The product link seems invalid.")
    );
  };

  const pickOrderScreenshot = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) setOrderScreenshot(result.assets[0].uri);
  };

  const onSubmitOrderScreenshot = async () => {
    if (!orderScreenshot) {
      Alert.alert("Add proof", "Please upload a screenshot of your order confirmation.");
      return;
    }
    try {
      await submitOrderScreenshot.mutateAsync({
        applicationId: app.id,
        imageUri: orderScreenshot,
      });
      setOrderScreenshot(null);
      Alert.alert("Order submitted!", "Our team will verify your order shortly.");
    } catch (e: any) {
      const msg = /ORDER_WINDOW_CLOSED/.test(e?.message ?? "")
        ? "Your 15-minute order window has closed. Please wait for the retry timer, then start again."
        : e?.message ?? "Please try again.";
      Alert.alert("Couldn't submit order", msg);
    }
  };

  // Restart the 15-min window after the 24h cooldown (stamps a fresh
  // order_started_at). The server rejects this until the cooldown has elapsed.
  const onRestartOrderWindow = async () => {
    if (orderRetrySlotsFull || orderRetryCapacityUnknown) {
      Alert.alert(
        orderRetrySlotsFull ? "Orders full" : "Checking availability",
        orderRetrySlotsFull
          ? "All campaign slots are approved or reserved. You can't start another order right now."
          : "We can't confirm an open campaign slot right now. Please try again shortly."
      );
      return;
    }
    try {
      await startOrderWindow.mutateAsync(app.id);
      Alert.alert("You're back on!", "Your 15-minute order window has started. Buy the product and upload your screenshot now.");
    } catch (e: any) {
      const msg = /ORDER_RETRY_COOLDOWN/.test(e?.message ?? "")
        ? "You need to wait 24 hours before trying again."
        : e?.message ?? "Please try again.";
      Alert.alert("Not yet", msg);
    }
  };

  const pickDraftVideo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsMultipleSelection: false,
      quality: 0.7,
      videoMaxDuration: 180,
    });
    if (!result.canceled && result.assets[0]) setDraftVideo(result.assets[0].uri);
  };

  const onSubmitDraft = async () => {
    if (!draftVideo) {
      Alert.alert("Add your draft", "Please select your draft video first.");
      return;
    }
    try {
      await submitDraft.mutateAsync({ applicationId: app.id, videoUri: draftVideo });
      setDraftVideo(null);
      Alert.alert("Draft submitted!", "Our team will review your draft and get back to you.");
    } catch (e: any) {
      Alert.alert("Upload failed", e.message ?? "Please try again.");
    }
  };

  const onSubmitReel = async () => {
    if (!reelLink.trim()) {
      Alert.alert("Add reel link", "Paste the link to your posted Instagram reel.");
      return;
    }
    try {
      await submitReelLink.mutateAsync({ applicationId: app.id, reelLink: reelLink.trim() });
      Alert.alert("Link submitted!", "We'll verify your reel and release your payment.");
    } catch (e: any) {
      Alert.alert("Submission failed", e.message ?? "Please try again.");
    }
  };

  const pickDelivery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) setDeliveryImage(result.assets[0].uri);
  };

  const onSubmitDelivery = async () => {
    if (!deliveryImage) {
      Alert.alert("Add photo", "Please add a photo of the product you received.");
      return;
    }
    try {
      await submitDelivery.mutateAsync({ applicationId: app.id, imageUri: deliveryImage });
      setDeliveryImage(null);
      Alert.alert(
        "Photo submitted!",
        type === "reimbursement"
          ? "Thanks! Your delivered photo has been saved."
          : "Thanks! Our team will confirm your delivery shortly."
      );
    } catch (e: any) {
      Alert.alert("Upload failed", e.message ?? "Please try again.");
    }
  };

  // Creators upload a photo of the delivered product. For paid/barter this
  // happens while the product is shipped (staff then confirm delivery); for
  // reimbursement it happens after they've bought & received the product.
  const showDeliveryCard =
    (type === "barter" || type === "paid") && app.status === "product_shipped";

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerStyle={{ paddingBottom: 120, paddingTop: insets.top + 12 }}>
      <View className="flex-row items-center gap-3 px-5 pb-4">
        <Pressable onPress={() => router.back()}><Ionicons name="chevron-back" size={26} color={colors.ink} /></Pressable>
        <Text className="text-xl font-bold text-ink">Campaign Progress</Text>
      </View>

      <Card className="mx-5">
        <View className="flex-row items-center gap-3">
          <CampaignImage uri={c.campaign_image} className="h-16 w-16 rounded-2xl" iconSize={24} />
          <View className="flex-1">
            <Text className="text-base font-bold text-ink" numberOfLines={1}>{c.title}</Text>
            <Text className="text-xs text-ink-soft">{CAMPAIGN_TYPE_LABEL[c.campaign_type]} Collaboration</Text>
          </View>
          <StatusBadge status={app.status} />
        </View>
      </Card>

      {app.status === "rejected" ? (
        <Card className="mx-5 mt-4">
          <View className="flex-row items-center gap-2">
            <Ionicons name="alert-circle" size={18} color={colors.primary} />
            <Text className="text-base font-bold text-primary">Reason for Rejection</Text>
          </View>
          <Text className="mt-2 text-sm text-ink-soft">
            {app.reject_reason ?? "Profile not matched with campaign requirements."}
          </Text>

          {reuploadBlocked && (orderStageReject || contentStageReject) ? (
            <View className="mt-4">
              <View className="rounded-2xl bg-primary-50 p-3">
                <Text className="text-sm font-bold text-ink">
                  Rejected — all {REJECT_MAX_FREE} attempts used
                </Text>
                <Text className="mt-1 text-xs text-ink-soft">
                  This order was rejected {REJECT_MAX_FREE} times, so it's closed for now. Your
                  attempts reset automatically after the timer below — then you can re-upload and
                  try again.
                </Text>
              </View>
              <View className="mt-3">
                <CountdownCard
                  target={reuploadRetryAt!}
                  label="Resets in"
                  endedLabel="Reset done — reopen this screen to re-upload"
                />
              </View>
            </View>
          ) : orderStageReject ? (
            <View className="mt-4 rounded-2xl bg-canvas p-3">
              <Text className="text-sm font-bold text-ink">Re-upload your order screenshot</Text>
              <Text className="mt-1 text-xs text-ink-soft">
                Fix the issue above and submit a clear order screenshot again for review.
              </Text>
              {rejectCount > 0 ? (
                <Text className="mt-1 text-xs font-semibold text-primary">
                  Attempt {rejectCount + 1} of {REJECT_MAX_FREE} — after {REJECT_MAX_FREE} rejections
                  this order is closed for 24 hours.
                </Text>
              ) : null}
              <View className="mt-2">
                <SampleProofChip sample={SAMPLE_ORDER_SCREENSHOT} />
              </View>

              {orderScreenshot ? (
                <View className="mt-3 flex-row items-center justify-between rounded-2xl border border-primary-100 bg-white p-3">
                  <View className="flex-row items-center gap-3">
                    <Image source={{ uri: orderScreenshot }} className="h-12 w-12 rounded-xl" />
                    <View>
                      <Text className="text-sm font-semibold text-ink">Screenshot selected</Text>
                      <Text className="text-xs text-ink-muted">Tap remove to change</Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={() => setOrderScreenshot(null)}
                    className="h-8 w-8 items-center justify-center rounded-full bg-primary-50"
                  >
                    <Ionicons name="close" size={16} color={colors.primary} />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={pickOrderScreenshot}
                  className="mt-3 flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-primary bg-white py-4"
                >
                  <Ionicons name="image-outline" size={20} color={colors.primary} />
                  <Text className="text-sm font-semibold text-primary">Upload order screenshot</Text>
                </Pressable>
              )}

              <View className="mt-3">
                <Button
                  label="Re-submit Order"
                  variant="dark"
                  fullWidth
                  onPress={onSubmitOrderScreenshot}
                  loading={submitOrderScreenshot.isPending}
                />
              </View>
            </View>
          ) : contentStageReject ? (
            <View className="mt-4 rounded-2xl bg-canvas p-3">
              <Text className="text-sm font-bold text-ink">Re-submit your content</Text>
              <Text className="mt-1 text-xs text-ink-soft">
                Fix the issue above and submit your content again for review.
              </Text>
              <View className="mt-3">
                <Button
                  label="Re-submit Content"
                  variant="dark"
                  fullWidth
                  onPress={() => router.push(`/submit/${app.id}`)}
                  rightIcon={<Ionicons name="arrow-forward" size={18} color="#fff" />}
                />
              </View>
            </View>
          ) : (
            <View className="mt-4 rounded-2xl bg-primary-50 p-3">
              <Text className="text-sm font-semibold text-ink">Improvement suggestions</Text>
              <Text className="mt-1 text-xs text-ink-soft">
                • Grow your followers and engagement{"\n"}• Submit content on time{"\n"}• Keep your profile complete & authentic
              </Text>
            </View>
          )}
        </Card>
      ) : (
        <Card className="mx-5 mt-4">
          <Text className="mb-4 text-base font-bold text-ink">Progress Tracker</Text>
          {steps.map((step, i) => {
            const done = i < currentIndex;
            const active = i === currentIndex;
            const color = done ? colors.success : active ? colors.info : "#D9D2D2";
            return (
              <View key={step} className="flex-row items-start gap-3">
                <View className="items-center">
                  <View className="h-7 w-7 items-center justify-center rounded-full" style={{ backgroundColor: color }}>
                    {done ? <Ionicons name="checkmark" size={15} color="#fff" /> : <View className="h-2.5 w-2.5 rounded-full bg-white" />}
                  </View>
                  {i < steps.length - 1 ? (
                    <View className="h-8 w-0.5" style={{ backgroundColor: done ? colors.success : "#E7DEDE" }} />
                  ) : null}
                </View>
                <Text className="pt-1 text-sm font-semibold" style={{ color: active ? colors.info : done ? colors.ink : colors.inkMuted }}>
                  {stepLabel(type, step)}
                </Text>
              </View>
            );
          })}
        </Card>
      )}

      {showDeliveryCard ? (
        <Card className="mx-5 mt-4">
          <View className="flex-row items-center gap-2">
            <Ionicons name="cube-outline" size={18} color={colors.primary} />
            <Text className="text-base font-bold text-ink">Delivered photo</Text>
          </View>
          {app.delivery_photo_url ? (
            <View className="mt-2 flex-row items-center gap-2 rounded-xl bg-green-50 p-3">
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text className="flex-1 text-xs text-success">
                Delivered photo submitted — waiting for our team to confirm delivery.
              </Text>
            </View>
          ) : (
            <>
              <Text className="mt-1 text-sm text-ink-soft">
                Received your product? Upload a clear photo of the delivered item to confirm you got it.
              </Text>
              {deliveryImage ? (
                <View className="mt-3 flex-row items-center gap-3">
                  <Image source={{ uri: deliveryImage }} className="h-24 w-24 rounded-xl" />
                  <Pressable
                    onPress={() => setDeliveryImage(null)}
                    className="h-8 w-8 items-center justify-center rounded-full bg-primary-50"
                  >
                    <Ionicons name="close" size={16} color={colors.primary} />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={pickDelivery}
                  className="mt-3 flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-primary bg-white py-4"
                >
                  <Ionicons name="camera-outline" size={20} color={colors.primary} />
                  <Text className="text-sm font-semibold text-primary">Upload delivered photo</Text>
                </Pressable>
              )}
              <View className="mt-4">
                <Button
                  label="Submit Delivered Photo"
                  variant="dark"
                  fullWidth
                  onPress={onSubmitDelivery}
                  loading={submitDelivery.isPending}
                />
              </View>
            </>
          )}
        </Card>
      ) : null}

      {app.status === "completed" ? (
        <Card className="mx-5 mt-4">
          <Text className="text-base font-bold text-ink">Earnings</Text>
          <View className="mt-3 flex-row justify-between">
            <View>
              <Text className="text-xs text-ink-muted">
                {c.campaign_type === "reimbursement" ? "Cashback received" : "Reward"}
              </Text>
              <Text className="text-2xl font-extrabold text-success">
                {formatCurrency(c.campaign_type === "reimbursement" ? app.payout_amount ?? reimbursementTotal : c.reward_amount)}
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-xs text-ink-muted">Completed On</Text>
              <Text className="text-sm font-semibold text-ink">{formatDate(app.completed_at)}</Text>
            </View>
          </View>
          <View className="mt-3 flex-row items-center gap-2 rounded-xl bg-green-50 p-3">
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text className="text-xs text-success">
              {c.campaign_type === "reimbursement"
                ? "Your cashback has been credited. Check your wallet."
                : "Payment released to your wallet."}
            </Text>
          </View>
        </Card>
      ) : null}

      {app.status === "applied" ? (
        <Card className="mx-5 mt-4">
          <View className="flex-row items-center gap-2">
            <Ionicons name="time-outline" size={18} color={colors.info} />
            <Text className="text-base font-bold text-ink">Application under review</Text>
          </View>
          <Text className="mt-1 text-sm text-ink-soft">
            The brand is reviewing your profile. You'll be notified once you're selected.
          </Text>
        </Card>
      ) : null}

      {type === "reimbursement" && app.status === "selected" ? (
        <Card className="mx-5 mt-4">
          <Text className="text-base font-bold text-ink">You're selected! 🎉</Text>
          <Text className="mt-1 text-sm text-ink-soft">
            Follow these 2 steps to unlock content submission.
          </Text>

          {purchaseWindowExpired ? (
            /* Window closed — either in the 24h cooldown or ready to restart. */
            !retryReady ? (
              <View className="mt-4">
                <View className="flex-row items-center gap-2 rounded-2xl bg-amber-50 p-3">
                  <Ionicons name="time-outline" size={18} color={colors.warning ?? "#B45309"} />
                  <Text className="flex-1 text-xs text-ink-soft">
                    Your 15-minute order window has closed. You can try again after the timer below —
                    please wait 24 hours from when it started.
                  </Text>
                </View>
                {orderRetryAt ? (
                  <View className="mt-3">
                    <CountdownCard
                      target={orderRetryAt}
                      label="You can order again in"
                      endedLabel="You can order again now"
                    />
                  </View>
                ) : null}
              </View>
            ) : orderRetrySlotsFull ? (
              <View className="mt-4 rounded-2xl bg-red-50 p-3">
                <Text className="text-sm font-semibold text-red-700">Orders full — all campaign slots are approved or reserved.</Text>
              </View>
            ) : orderRetryCapacityUnknown ? (
              <View className="mt-4 rounded-2xl bg-amber-50 p-3">
                <Text className="text-sm text-ink-soft">Checking slot availability… Please try again shortly.</Text>
              </View>
            ) : (
              <View className="mt-4">
                <View className="flex-row items-center gap-2 rounded-2xl bg-green-50 p-3">
                  <Ionicons name="refresh" size={18} color={colors.success} />
                  <Text className="flex-1 text-xs text-ink-soft">
                    The wait is over! Start a fresh 15-minute window to buy the product and upload
                    your order screenshot.
                  </Text>
                </View>
                <View className="mt-3">
                  <Button
                    label="Start ordering again"
                    variant="dark"
                    fullWidth
                    onPress={onRestartOrderWindow}
                    loading={startOrderWindow.isPending}
                    rightIcon={<Ionicons name="arrow-forward" size={18} color="#fff" />}
                  />
                </View>
              </View>
            )
          ) : (
            <>
              {purchaseWindowDeadline ? (
                <View className="mt-4">
                  <CountdownCard
                    target={purchaseWindowDeadline}
                    label="Complete your order within"
                    endedLabel="Order window closed"
                  />
                </View>
              ) : null}

              {/* Step 1 — buy product within the 15-min purchase window */}
              <View className="mt-4 rounded-2xl bg-primary-50 p-3">
                <Text className="text-sm font-bold text-ink">Step 1 · Buy the product</Text>
                <Text className="mt-1 text-xs text-ink-soft">
                  Tap below to open the purchase link. Complete your order and upload the screenshot
                  within the 15 minutes shown above — if the timer runs out you'll need to wait 24
                  hours before trying again.
                </Text>
                <View className="mt-3">
                  <Button
                    label={c.product_url ? "Open purchase link" : "Link coming soon"}
                    variant="outline"
                    fullWidth
                    onPress={openProductLink}
                    rightIcon={<Ionicons name="open-outline" size={16} color={colors.primary} />}
                  />
                </View>
              </View>

              {/* Step 2 — upload order screenshot */}
              <View className="mt-3 rounded-2xl bg-canvas p-3">
                <Text className="text-sm font-bold text-ink">Step 2 · Upload order screenshot</Text>
                <Text className="mt-1 text-xs text-ink-soft">
                  Add a screenshot of your order confirmation or invoice.
                </Text>
                <View className="mt-2">
                  <SampleProofChip sample={SAMPLE_ORDER_SCREENSHOT} />
                </View>

                {orderScreenshot ? (
                  <View className="mt-3 flex-row items-center justify-between rounded-2xl border border-primary-100 bg-white p-3">
                    <View className="flex-row items-center gap-3">
                      <Image source={{ uri: orderScreenshot }} className="h-12 w-12 rounded-xl" />
                      <View>
                        <Text className="text-sm font-semibold text-ink">Screenshot selected</Text>
                        <Text className="text-xs text-ink-muted">Tap remove to change</Text>
                      </View>
                    </View>
                    <Pressable
                      onPress={() => setOrderScreenshot(null)}
                      className="h-8 w-8 items-center justify-center rounded-full bg-primary-50"
                    >
                      <Ionicons name="close" size={16} color={colors.primary} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={pickOrderScreenshot}
                    className="mt-3 flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-primary bg-white py-4"
                  >
                    <Ionicons name="image-outline" size={20} color={colors.primary} />
                    <Text className="text-sm font-semibold text-primary">Upload order screenshot</Text>
                  </Pressable>
                )}
              </View>

              <View className="mt-4">
                <Button
                  label="Confirm Order"
                  variant="dark"
                  fullWidth
                  onPress={onSubmitOrderScreenshot}
                  loading={submitOrderScreenshot.isPending}
                />
              </View>
            </>
          )}
        </Card>
      ) : null}

      {type === "reimbursement" && app.status === "ordered" ? (
        <Card className="mx-5 mt-4">
          <View className="flex-row items-center gap-2">
            <Ionicons name="time-outline" size={18} color={colors.info} />
            <Text className="text-base font-bold text-ink">Order submitted</Text>
          </View>
          <Text className="mt-1 text-sm text-ink-soft">
            We're verifying your order screenshot. You'll be able to submit your review once it's
            approved.
          </Text>
          {orderApprovalDeadline ? (
            <View className="mt-3">
              <CountdownCard
                target={orderApprovalDeadline}
                label="Order will be reviewed within"
                endedLabel="Under review — approval is taking a little longer than usual"
              />
            </View>
          ) : null}
        </Card>
      ) : null}

      {type === "reimbursement" && app.status === "order_approved" ? (
        <Card className="mx-5 mt-4">
          <View className="flex-row items-center gap-2">
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text className="text-base font-bold text-ink">Order approved!</Text>
          </View>
          <Text className="mt-1 text-sm text-ink-soft">
            {app.expected_delivery_at
              ? `Expected delivery date: ${formatDate(app.expected_delivery_at)}.`
              : "Your order is approved."} Upload the delivered-date screenshot and required campaign proof when ready. The 72-hour employee review timer starts after you submit.
          </Text>
        </Card>
      ) : null}


      {(type === "barter" || type === "paid") && app.status === "selected" ? (
        <Card className="mx-5 mt-4">
          <Text className="text-base font-bold text-ink">You're approved! 🎉</Text>
          <Text className="mt-1 text-sm text-ink-soft">
            The brand is shipping your product to your saved address. Once it arrives, confirm you received it — then you'll upload a draft video for our team to approve before you post.
          </Text>
        </Card>
      ) : null}

      {/* ---------- PAID / BARTER: draft video ---------- */}
      {(type === "paid" || type === "barter") && (app.status === "delivered" || app.status === "draft_revision") ? (
        <Card className="mx-5 mt-4">
          <Text className="text-base font-bold text-ink">
            {app.status === "draft_revision" ? "Your draft needs changes" : "Upload your draft video"}
          </Text>

          {app.draft_deadline ? (
            <View className="mt-3">
              <CountdownCard
                target={app.draft_deadline}
                label="Upload your draft before"
                endedLabel="Draft window closed — contact support"
              />
            </View>
          ) : null}

          {app.status === "draft_revision" && app.draft_feedback ? (
            <View className="mt-3 rounded-2xl bg-red-50 p-3">
              <Text className="text-sm font-semibold text-red-600">Requested changes</Text>
              <Text className="mt-1 text-xs text-ink-soft">{app.draft_feedback}</Text>
            </View>
          ) : (
            <Text className="mt-2 text-sm text-ink-soft">
              Record a draft of your reel and upload it for our team to approve before you post it publicly.
            </Text>
          )}

          {draftVideo ? (
            <View className="mt-3 flex-row items-center justify-between rounded-2xl border border-primary-100 bg-white p-3">
              <View className="flex-row items-center gap-3">
                <View className="h-12 w-12 items-center justify-center rounded-xl bg-primary-50">
                  <Ionicons name="videocam" size={22} color={colors.primary} />
                </View>
                <Text className="text-sm font-semibold text-ink">Draft video selected</Text>
              </View>
              <Pressable onPress={() => setDraftVideo(null)} className="h-8 w-8 items-center justify-center rounded-full bg-primary-50">
                <Ionicons name="close" size={16} color={colors.primary} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={pickDraftVideo}
              className="mt-3 flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-primary bg-white py-4"
            >
              <Ionicons name="cloud-upload-outline" size={20} color={colors.primary} />
              <Text className="text-sm font-semibold text-primary">Select your draft video</Text>
            </Pressable>
          )}

          <View className="mt-4">
            <Button
              label={app.status === "draft_revision" ? "Re-upload Draft" : "Submit Draft"}
              variant="dark"
              fullWidth
              onPress={onSubmitDraft}
              loading={submitDraft.isPending}
            />
          </View>
        </Card>
      ) : null}

      {(type === "paid" || type === "barter") && app.status === "draft_submitted" ? (
        <Card className="mx-5 mt-4">
          <View className="flex-row items-center gap-2">
            <Ionicons name="time-outline" size={18} color={colors.info} />
            <Text className="text-base font-bold text-ink">Draft under review</Text>
          </View>
          <Text className="mt-1 text-sm text-ink-soft">
            Our team is reviewing your draft video. You'll be notified once it's approved or if changes are needed.
          </Text>
        </Card>
      ) : null}

      {(type === "paid" || type === "barter") && (app.status === "draft_approved" || app.status === "posted") ? (
        <Card className="mx-5 mt-4">
          <Text className="text-base font-bold text-ink">Draft approved! Post your reel 🎬</Text>
          <Text className="mt-1 text-sm text-ink-soft">
            Post the approved reel on your Instagram, then paste its link below so we can verify it.
          </Text>
          <View className="mt-3">
            <Input
              label="Instagram reel link"
              icon="videocam-outline"
              placeholder="https://instagram.com/reel/..."
              autoCapitalize="none"
              value={reelLink}
              onChangeText={setReelLink}
            />
          </View>
          <View className="mt-4">
            <Button
              label="Submit Reel Link"
              variant="dark"
              fullWidth
              onPress={onSubmitReel}
              loading={submitReelLink.isPending}
            />
          </View>
        </Card>
      ) : null}

      {(type === "paid" || type === "barter") && app.status === "link_submitted" ? (
        <Card className="mx-5 mt-4">
          <View className="flex-row items-center gap-2">
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text className="text-base font-bold text-ink">Video is live 🎉</Text>
          </View>
          <Text className="mt-1 text-sm text-ink-soft">
            We're verifying your posted video. Once our team confirms it's live, this collaboration will be marked complete.
          </Text>
        </Card>
      ) : null}

      {app.purchase_proof && ["product_received", "content_creation", "submitted", "review", "completed"].includes(app.status) ? (
        <Card className="mx-5 mt-4">
          <View className="flex-row items-center gap-2">
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text className="text-base font-bold text-ink">Purchase confirmed</Text>
          </View>
          {app.product_received_at ? (
            <Text className="text-xs text-ink-muted">On {formatDate(app.product_received_at)}</Text>
          ) : null}
        </Card>
      ) : null}

      {type === "reimbursement" && ["order_approved", "product_received", "content_creation"].includes(app.status) ? (
        <View className="mx-5 mt-4 gap-3">
          <Button
            label="Submit Content"
            variant="dark"
            fullWidth
            onPress={() => router.push(`/submit/${app.id}`)}
            rightIcon={<Ionicons name="arrow-forward" size={18} color="#fff" />}
          />
        </View>
      ) : null}
      {type === "reimbursement" && app.status === "submitted" ? (
        <Card className="mx-5 mt-4">
          <Text className="text-base font-bold text-ink">Review submitted</Text>
          <Text className="mt-1 text-sm text-ink-soft">The employee review timer starts now. Your review will be checked within 72 hours.</Text>
          {app.review_deadline ? (
            <View className="mt-3">
              <CountdownCard target={app.review_deadline} label="Employee review due in" endedLabel="Review is overdue" />
            </View>
          ) : null}
        </Card>
      ) : null}
    </ScrollView>
  );
}
