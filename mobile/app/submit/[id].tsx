import { useState } from "react";
import { Alert, Image, Pressable, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { Input } from "../../src/components/ui/Input";
import { Button } from "../../src/components/ui/Button";
import { useSubmitContent, useUploadScreenshots, useUploadVideo } from "../../src/api/submissions";
import { useApplication, useSubmitDeliveryPhoto } from "../../src/api/applications";
import { supabase } from "../../src/lib/supabase";
import { colors } from "../../src/lib/theme";
import { formatCurrency, formatDate } from "../../src/lib/format";
import { SampleProofChip } from "../../src/components/SampleProof";
import {
  SAMPLE_DELIVERY_DATE,
  SAMPLE_REVIEW_VIDEO,
  SAMPLE_SELLER_FEEDBACK,
} from "../../src/lib/samples";

export default function SubmitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: app } = useApplication(id!);
  const isReimbursement = app?.campaign?.campaign_type === "reimbursement";
  const submissionDateLocked = isReimbursement && !!app?.expected_delivery_at && new Date(app.expected_delivery_at).getTime() > Date.now();
  const submissionLockDate = isReimbursement && app?.expected_delivery_at ? new Date(app.expected_delivery_at) : null;
  const [deliveryImage, setDeliveryImage] = useState<string | null>(null);
  const [deliveryPhotoUploaded, setDeliveryPhotoUploaded] = useState(false);
  const deliveryPhotoMissing = isReimbursement && !app?.delivery_photo_url && !deliveryPhotoUploaded;
  const deliverables = app?.campaign?.deliverables?.toLowerCase() ?? "";
  const isOnlyOrder = deliverables.includes("only order");
  const hasRating = deliverables.includes("rating");
  const hasReview = deliverables.includes("review");
  const requiresReviewVideo = isReimbursement && !isOnlyOrder;
  const requiresSellerFeedback = isReimbursement && deliverables.includes("seller feedback");
  const showSellerFeedback = isReimbursement && requiresSellerFeedback;
  const reviewVideoTitle = hasReview && hasRating
    ? "Review + rating sample video"
    : hasRating && requiresSellerFeedback
      ? "Rating + seller feedback sample video"
    : hasRating
      ? "Rating sample video"
      : hasReview && requiresSellerFeedback
        ? "Review + seller feedback sample video"
        : "Review sample video";
  const campaignReviewSample = app?.campaign?.sample_video_url
    ? { ...SAMPLE_REVIEW_VIDEO, title: reviewVideoTitle, description: `Campaign ${app.campaign.campaign_code ?? app.campaign.title}: follow this campaign's review criteria.`, video: app.campaign.sample_video_url }
    : { ...SAMPLE_REVIEW_VIDEO, title: reviewVideoTitle, description: `Campaign ${app?.campaign?.campaign_code ?? "criteria"}: follow the campaign's review criteria.` };
  const [reel, setReel] = useState("");
  const [post, setPost] = useState("");
  const [story, setStory] = useState("");
  const [youtube, setYoutube] = useState("");
  const [notes, setNotes] = useState("");
  const [video, setVideo] = useState<string | null>(null);
  const [sellerFeedbackShot, setSellerFeedbackShot] = useState<string | null>(null);
  const submissionLocked =
    submissionDateLocked ||
    deliveryPhotoMissing ||
    (requiresReviewVideo && !video) ||
    (requiresSellerFeedback && !sellerFeedbackShot);

  const upload = useUploadScreenshots();
  const uploadVideo = useUploadVideo();
  const submitDelivery = useSubmitDeliveryPhoto();
  const submit = useSubmitContent();
  const { data: orderProofUrl } = useQuery({
    queryKey: ["submit-order-proof", app?.id, app?.purchase_proof],
    enabled: !!app?.purchase_proof,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("purchase-orders")
        .createSignedUrl(app!.purchase_proof!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });

  const pickDeliveryPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) setDeliveryImage(result.assets[0].uri);
  };

  const pickVideo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsMultipleSelection: false,
      quality: 0.7,
      videoMaxDuration: 120,
    });
    if (!result.canceled && result.assets[0]) {
      setVideo(result.assets[0].uri);
    }
  };

  const pickSellerFeedback = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setSellerFeedbackShot(result.assets[0].uri);
    }
  };

  const onSubmitDeliveryPhoto = async () => {
    if (!deliveryImage) {
      Alert.alert("Add delivery proof", "Please select the delivered-date screenshot first.");
      return;
    }
    try {
      await submitDelivery.mutateAsync({ applicationId: id!, imageUri: deliveryImage });
      setDeliveryImage(null);
      setDeliveryPhotoUploaded(true);
      Alert.alert("Delivery proof saved", "Your delivered-date screenshot is ready for the review submission.");
    } catch (error: any) {
      Alert.alert("Upload failed", error.message ?? "Please try again.");
    }
  };

  const onSubmit = async () => {
    if (submissionDateLocked) {
      Alert.alert("Review uploads are locked", `You can submit after ${submissionLockDate?.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.`);
      return;
    }
    if (deliveryPhotoMissing) {
      Alert.alert("Add delivery proof", "Upload the delivered-date screenshot from your application before submitting your review.");
      return;
    }
    if (!isReimbursement && !reel && !post && !youtube) {
      Alert.alert("Add content", "Please provide at least one content link.");
      return;
    }
    if (requiresReviewVideo && !video) {
      Alert.alert("Add review video", "Please upload your review video before submitting.");
      return;
    }
    if (isReimbursement && requiresSellerFeedback && !sellerFeedbackShot) {
      Alert.alert("Add seller feedback", "This campaign requires a seller feedback screenshot.");
      return;
    }
    try {
      const video_url = video ? await uploadVideo.mutateAsync(video) : undefined;
      const seller_feedback_screenshot = sellerFeedbackShot
        ? (await upload.mutateAsync([sellerFeedbackShot]))[0]
        : undefined;
      await submit.mutateAsync({
        applicationId: id!,
        reel_url: reel || undefined,
        post_url: post || undefined,
        story_url: story || undefined,
        youtube_url: youtube || undefined,
        notes: notes || undefined,
        screenshots: [],
        video_url,
        seller_feedback_screenshot,
      });
      Alert.alert("Submitted!", "Your content is now under review.");
      router.replace("/(tabs)/campaigns");
    } catch (e: any) {
      Alert.alert("Submission failed", e.message ?? "Try again.");
    }
  };

  const loading = submitDelivery.isPending || upload.isPending || uploadVideo.isPending || submit.isPending;

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerStyle={{ paddingBottom: 60, paddingTop: insets.top + 12 }}>
      <View className="flex-row items-center gap-3 px-5 pb-4">
        <Pressable onPress={() => router.back()}><Ionicons name="chevron-back" size={26} color={colors.ink} /></Pressable>
        <Text className="text-xl font-bold text-ink">{isReimbursement ? "Upload Review" : "Submit Content"}</Text>
      </View>

      <View className="gap-4 px-5">
        {isReimbursement ? (
          <View className="rounded-2xl bg-primary-50 p-3">
            <Text className="text-sm font-semibold text-ink">Complete the campaign proof steps below.</Text>
            <Text className="mt-1 text-xs text-ink-soft">
              Upload the delivered-date screenshot, campaign-required review video, and seller feedback screenshot when required.
            </Text>
            {submissionDateLocked && submissionLockDate ? (
              <Text className="mt-2 text-xs font-semibold text-amber-700">
                Review uploads are locked until {submissionLockDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.
              </Text>
            ) : null}
            {deliveryPhotoMissing ? (
              <Text className="mt-2 text-xs font-semibold text-amber-700">
                Upload the delivered-date screenshot from your application before submitting your review.
              </Text>
            ) : null}
          </View>
        ) : null}

        {isReimbursement ? (
          <View className="gap-3 rounded-2xl border border-primary-100 bg-white p-4">
            <Text className="text-base font-bold text-ink">Order details</Text>
            {app?.campaign?.campaign_code ? <Text className="text-xs text-ink-muted">Campaign code: {app.campaign.campaign_code}</Text> : null}
            {app?.campaign?.deliverables ? <Text className="text-sm text-ink-soft">Deliverables: {app.campaign.deliverables}</Text> : null}
            <View className="flex-row justify-between gap-3">
              <Text className="text-sm text-ink-muted">Order ID</Text>
              <Text className="flex-1 text-right text-sm font-semibold text-ink">{app?.order_id || "Pending employee update"}</Text>
            </View>
            <View className="flex-row justify-between gap-3">
              <Text className="text-sm text-ink-muted">Order date</Text>
              <Text className="text-sm font-semibold text-ink">{formatDate(app?.order_date)}</Text>
            </View>
            <View className="flex-row justify-between gap-3">
              <Text className="text-sm text-ink-muted">Delivery date</Text>
              <Text className="text-sm font-semibold text-ink">{formatDate(app?.expected_delivery_at)}</Text>
            </View>
            <View className="flex-row justify-between gap-3 border-t border-primary-100 pt-2">
              <Text className="text-sm font-semibold text-ink">Cashback up to (verified order amount)</Text>
              <Text className="text-sm font-bold text-primary">{formatCurrency(app?.purchase_amount ?? app?.payout_amount ?? 0)}</Text>
            </View>
            {orderProofUrl ? (
              <Image source={{ uri: orderProofUrl }} className="h-48 w-full rounded-xl bg-canvas" resizeMode="contain" />
            ) : app?.purchase_proof ? (
              <Text className="text-xs text-ink-muted">Loading order screenshot…</Text>
            ) : (
              <Text className="text-xs text-amber-700">Order screenshot is not available yet.</Text>
            )}
          </View>
        ) : null}

        {isReimbursement ? (
          <View className="gap-3 rounded-2xl border border-primary-100 bg-white p-4">
            <Text className="text-base font-bold text-ink">1. Delivered-date screenshot</Text>
            <Text className="text-xs text-ink-muted">View the sample, then upload proof that your order was delivered.</Text>
            <SampleProofChip sample={SAMPLE_DELIVERY_DATE} />
            {app?.delivery_photo_url || deliveryPhotoUploaded ? (
              <View className="flex-row items-center gap-2 rounded-xl bg-green-50 p-3">
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <Text className="text-sm font-semibold text-success">Delivered screenshot uploaded</Text>
              </View>
            ) : (
              <>
                {deliveryImage ? <Image source={{ uri: deliveryImage }} className="h-24 w-full rounded-xl" resizeMode="contain" /> : null}
                <Pressable onPress={pickDeliveryPhoto} className="flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-primary bg-primary-50 py-4">
                  <Ionicons name="image-outline" size={19} color={colors.primary} />
                  <Text className="text-sm font-semibold text-primary">Choose delivered screenshot</Text>
                </Pressable>
                <Button
                  label="Upload delivered screenshot"
                  variant="outline"
                  fullWidth
                  onPress={onSubmitDeliveryPhoto}
                  loading={submitDelivery.isPending}
                  disabled={!deliveryImage || submitDelivery.isPending}
                />
              </>
            )}
          </View>
        ) : null}

        {isReimbursement ? null : (
          <>
            <Input label="Instagram Reel URL" icon="videocam-outline" placeholder="https://instagram.com/reel/..." autoCapitalize="none" value={reel} onChangeText={setReel} />
            <Input label="Instagram Post URL" icon="image-outline" placeholder="https://instagram.com/p/..." autoCapitalize="none" value={post} onChangeText={setPost} />
            <Input label="Instagram Story URL" icon="ellipse-outline" placeholder="https://instagram.com/stories/..." autoCapitalize="none" value={story} onChangeText={setStory} />
            <Input label="YouTube URL" icon="logo-youtube" placeholder="https://youtube.com/watch?v=..." autoCapitalize="none" value={youtube} onChangeText={setYoutube} />
          </>
        )}

        {!isReimbursement ? <View className="gap-2">
          <Text className="text-sm font-semibold text-ink">Notes</Text>
          <View className="rounded-2xl border border-primary-100 bg-white p-3">
            <Input placeholder="Add any notes for the reviewer…" multiline value={notes} onChangeText={setNotes} style={{ minHeight: 80, textAlignVertical: "top" }} />
          </View>
        </View> : null}

        {isReimbursement ? (
          requiresReviewVideo ? (
          <View className="gap-2">
            <Text className="text-sm font-semibold text-ink">2. Review proof video</Text>
            <Text className="text-xs text-ink-muted">Use the example for this campaign&apos;s code and deliverable criteria.</Text>
            <SampleProofChip sample={campaignReviewSample} />
            {video ? (
              <View className="flex-row items-center justify-between rounded-2xl border border-primary-100 bg-white p-3">
                <View className="flex-row items-center gap-3">
                  <View className="h-12 w-12 items-center justify-center rounded-xl bg-primary-50">
                    <Ionicons name="videocam" size={22} color={colors.primary} />
                  </View>
                  <View>
                    <Text className="text-sm font-semibold text-ink">Video selected</Text>
                    <Text className="text-xs text-ink-muted">Tap remove to change</Text>
                  </View>
                </View>
                <Pressable onPress={() => setVideo(null)} className="h-8 w-8 items-center justify-center rounded-full bg-primary-50">
                  <Ionicons name="close" size={16} color={colors.primary} />
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={pickVideo} className="flex-row items-center justify-center gap-2 rounded-2xl border border-dashed border-primary bg-primary-50 py-4">
                <Ionicons name="cloud-upload-outline" size={20} color={colors.primary} />
                <Text className="text-sm font-semibold text-primary">Select a video</Text>
              </Pressable>
            )}
          </View>
          ) : null
        ) : (
          <View className="gap-2">
            <Text className="text-sm font-semibold text-ink">Upload Review Video</Text>
            <Text className="text-xs text-ink-muted">Add a short video of your content for faster review &amp; payout.</Text>
            {video ? (
              <View className="flex-row items-center justify-between rounded-2xl border border-primary-100 bg-white p-3">
                <View className="flex-row items-center gap-3">
                  <View className="h-12 w-12 items-center justify-center rounded-xl bg-primary-50">
                    <Ionicons name="videocam" size={22} color={colors.primary} />
                  </View>
                  <View>
                    <Text className="text-sm font-semibold text-ink">Video selected</Text>
                    <Text className="text-xs text-ink-muted">Tap remove to change</Text>
                  </View>
                </View>
                <Pressable onPress={() => setVideo(null)} className="h-8 w-8 items-center justify-center rounded-full bg-primary-50">
                  <Ionicons name="close" size={16} color={colors.primary} />
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={pickVideo} className="flex-row items-center justify-center gap-2 rounded-2xl border border-dashed border-primary bg-primary-50 py-4">
                <Ionicons name="cloud-upload-outline" size={20} color={colors.primary} />
                <Text className="text-sm font-semibold text-primary">Select a video</Text>
              </Pressable>
            )}
          </View>
        )}

        {showSellerFeedback ? <View className="gap-2">
          <Text className="text-sm font-semibold text-ink">3. Seller feedback screenshot</Text>
          <SampleProofChip sample={SAMPLE_SELLER_FEEDBACK} />
          <Text className="text-xs text-ink-muted">
            Upload the screenshot required by this campaign&apos;s deliverables.
          </Text>
          {sellerFeedbackShot ? (
            <View className="flex-row items-center justify-between rounded-2xl border border-primary-100 bg-white p-3">
              <View className="flex-row items-center gap-3">
                <Image source={{ uri: sellerFeedbackShot }} className="h-12 w-12 rounded-xl" />
                <View>
                  <Text className="text-sm font-semibold text-ink">Screenshot selected</Text>
                  <Text className="text-xs text-ink-muted">Tap remove to change</Text>
                </View>
              </View>
              <Pressable onPress={() => setSellerFeedbackShot(null)} className="h-8 w-8 items-center justify-center rounded-full bg-primary-50">
                <Ionicons name="close" size={16} color={colors.primary} />
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={pickSellerFeedback} className="flex-row items-center justify-center gap-2 rounded-2xl border border-dashed border-primary bg-primary-50 py-4">
              <Ionicons name="image-outline" size={20} color={colors.primary} />
              <Text className="text-sm font-semibold text-primary">Select seller feedback screenshot</Text>
            </Pressable>
          )}
        </View> : null}

        <Button
          label={submissionDateLocked ? "Waiting for delivery date" : isReimbursement ? "Submit for Reimbursement" : "Submit for Review"}
          onPress={onSubmit}
          loading={loading}
          variant="dark"
          fullWidth
          disabled={submissionLocked || loading}
        />
      </View>
    </ScrollView>
  );
}
