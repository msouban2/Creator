import { useState } from "react";
import { Alert, Image, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { Input } from "../../src/components/ui/Input";
import { Button } from "../../src/components/ui/Button";
import { useSubmitContent, useUploadScreenshots, useUploadVideo } from "../../src/api/submissions";
import { useApplication } from "../../src/api/applications";
import { colors } from "../../src/lib/theme";
import { SampleProofChip, SampleProofGallery } from "../../src/components/SampleProof";
import {
  REIMBURSEMENT_SAMPLES,
  SAMPLE_ORDER_SCREENSHOT,
  SAMPLE_REVIEW_SCREENSHOT,
  SAMPLE_REVIEW_VIDEO,
  SAMPLE_SELLER_FEEDBACK,
} from "../../src/lib/samples";

export default function SubmitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: app } = useApplication(id!);
  const isReimbursement = app?.campaign?.campaign_type === "reimbursement";
  const submissionLocked = isReimbursement && !!app?.expected_delivery_at && new Date(app.expected_delivery_at).getTime() > Date.now();
  const submissionLockDate = isReimbursement && app?.expected_delivery_at ? new Date(app.expected_delivery_at) : null;
  const [reel, setReel] = useState("");
  const [post, setPost] = useState("");
  const [story, setStory] = useState("");
  const [youtube, setYoutube] = useState("");
  const [notes, setNotes] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [video, setVideo] = useState<string | null>(null);
  const [sellerFeedbackShot, setSellerFeedbackShot] = useState<string | null>(null);
  const [orderAmount, setOrderAmount] = useState("");

  const upload = useUploadScreenshots();
  const uploadVideo = useUploadVideo();
  const submit = useSubmitContent();

  const pickImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.7,
    });
    if (!result.canceled) {
      setImages((prev) => [...prev, ...result.assets.map((a) => a.uri)]);
    }
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

  const onSubmit = async () => {
    if (submissionLocked) {
      Alert.alert("Review uploads are locked", `You can submit after ${submissionLockDate?.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.`);
      return;
    }
    if (isReimbursement) {
      if (images.length === 0) {
        Alert.alert("Add screenshots", "Please upload at least one screenshot of your product review / order.");
        return;
      }
    } else if (!reel && !post && !youtube) {
      Alert.alert("Add content", "Please provide at least one content link.");
      return;
    }
    if (!video) {
      Alert.alert("Add review video", "Please upload your review video before submitting.");
      return;
    }
    try {
      let screenshots: string[] = [];
      if (images.length) screenshots = await upload.mutateAsync(images);
      const video_url = await uploadVideo.mutateAsync(video);
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
        screenshots,
        video_url,
        seller_feedback_screenshot,
        order_amount: orderAmount.trim() ? Number(orderAmount) : undefined,
      });
      Alert.alert("Submitted!", "Your content is now under review.");
      router.replace("/(tabs)/campaigns");
    } catch (e: any) {
      Alert.alert("Submission failed", e.message ?? "Try again.");
    }
  };

  const loading = upload.isPending || uploadVideo.isPending || submit.isPending;

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerStyle={{ paddingBottom: 60, paddingTop: insets.top + 12 }}>
      <View className="flex-row items-center gap-3 px-5 pb-4">
        <Pressable onPress={() => router.back()}><Ionicons name="chevron-back" size={26} color={colors.ink} /></Pressable>
        <Text className="text-xl font-bold text-ink">{isReimbursement ? "Upload Review" : "Submit Content"}</Text>
      </View>

      <View className="gap-4 px-5">
        {isReimbursement ? (
          <View className="rounded-2xl bg-primary-50 p-3">
            <Text className="text-sm font-semibold text-ink">Almost done!</Text>
            <Text className="mt-1 text-xs text-ink-soft">
              Upload a screenshot of your product review (and order, if you haven't already). No reel needed — our team will verify it and send your reimbursement to your wallet.
            </Text>
            {submissionLocked && submissionLockDate ? (
              <Text className="mt-2 text-xs font-semibold text-amber-700">
                Review uploads are locked until {submissionLockDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.
              </Text>
            ) : null}
          </View>
        ) : null}

        {isReimbursement ? <SampleProofGallery samples={REIMBURSEMENT_SAMPLES} /> : null}

        {isReimbursement ? null : (
          <>
            <Input label="Instagram Reel URL" icon="videocam-outline" placeholder="https://instagram.com/reel/..." autoCapitalize="none" value={reel} onChangeText={setReel} />
            <Input label="Instagram Post URL" icon="image-outline" placeholder="https://instagram.com/p/..." autoCapitalize="none" value={post} onChangeText={setPost} />
            <Input label="Instagram Story URL" icon="ellipse-outline" placeholder="https://instagram.com/stories/..." autoCapitalize="none" value={story} onChangeText={setStory} />
            <Input label="YouTube URL" icon="logo-youtube" placeholder="https://youtube.com/watch?v=..." autoCapitalize="none" value={youtube} onChangeText={setYoutube} />
          </>
        )}

        <View className="gap-2">
          <Text className="text-sm font-semibold text-ink">Notes</Text>
          <View className="rounded-2xl border border-primary-100 bg-white p-3">
            <Input placeholder="Add any notes for the reviewer…" multiline value={notes} onChangeText={setNotes} style={{ minHeight: 80, textAlignVertical: "top" }} />
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-sm font-semibold text-ink">
            {isReimbursement ? "Review & order screenshots" : "Upload Screenshots"}
          </Text>
          {isReimbursement ? (
            <>
              <Text className="text-xs text-ink-muted">Add your product review screenshot (and order proof if needed).</Text>
              <View className="flex-row flex-wrap gap-2">
                <SampleProofChip sample={SAMPLE_REVIEW_SCREENSHOT} />
                <SampleProofChip sample={SAMPLE_ORDER_SCREENSHOT} />
              </View>
            </>
          ) : null}
          <View className="flex-row flex-wrap gap-3">
            {images.map((uri, i) => (
              <View key={uri + i} className="relative">
                <Image source={{ uri }} className="h-20 w-20 rounded-xl" />
                <Pressable onPress={() => setImages((prev) => prev.filter((u) => u !== uri))} className="absolute -right-2 -top-2 h-6 w-6 items-center justify-center rounded-full bg-primary">
                  <Ionicons name="close" size={14} color="#fff" />
                </Pressable>
              </View>
            ))}
            <Pressable onPress={pickImages} className="h-20 w-20 items-center justify-center rounded-xl border border-dashed border-primary bg-primary-50">
              <Ionicons name="add" size={26} color={colors.primary} />
            </Pressable>
          </View>
        </View>

        {isReimbursement ? (
          <View className="gap-2">
            <Text className="text-sm font-semibold text-ink">Upload Review Video</Text>
            <Text className="text-xs text-ink-muted">Add a short video of your product review for faster verification.</Text>
            <SampleProofChip sample={SAMPLE_REVIEW_VIDEO} />
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

        <View className="gap-2">
          <Text className="text-sm font-semibold text-ink">Order amount (₹)</Text>
          <Text className="text-xs text-ink-muted">The order value of the product you received (optional).</Text>
          <Input
            placeholder="e.g. 899"
            keyboardType="numeric"
            value={orderAmount}
            onChangeText={setOrderAmount}
          />
        </View>

        <View className="gap-2">
          <Text className="text-sm font-semibold text-ink">Seller feedback screenshot</Text>
          <Text className="text-xs text-ink-muted">
            A screenshot of the feedback you left for the brand/seller (optional, speeds up verification).
          </Text>
          {isReimbursement ? <SampleProofChip sample={SAMPLE_SELLER_FEEDBACK} /> : null}
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
        </View>

        <Button
          label={submissionLocked ? "Uploads Locked" : isReimbursement ? "Submit for Reimbursement" : "Submit for Review"}
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
