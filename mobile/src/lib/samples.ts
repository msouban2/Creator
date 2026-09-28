import type { ImageSourcePropType } from "react-native";

export type SampleProof = {
  key: string;
  title: string;
  description: string;
  image: ImageSourcePropType;
  /** When set, the sample is a video and the image acts as its thumbnail. */
  videoUrl?: string;
};

/** Hosted MP4 of the ideal review recording. Replace with your own CDN/Supabase public URL. */
export const SAMPLE_REVIEW_VIDEO_URL = "";

export const SAMPLE_ORDER_SCREENSHOT: SampleProof = {
  key: "order-screenshot",
  title: "Order screenshot",
  description:
    "Full order details page showing the product name, seller, order date, order number and grand total.",
  image: require("../../assets/samples/order-screenshot.png"),
};

export const SAMPLE_REVIEW_SCREENSHOT: SampleProof = {
  key: "review-screenshot",
  title: "Live review screenshot",
  description:
    "Your published review on the product page — star rating, \"Verified Purchase\" badge, review title, photos and text must be visible.",
  image: require("../../assets/samples/review-screenshot.png"),
};

export const SAMPLE_REVIEW_VIDEO: SampleProof = {
  key: "review-video",
  title: "Review submission video",
  description:
    "Screen recording that scrolls from the product page to your live review, so we can confirm the review belongs to your account.",
  image: require("../../assets/samples/review-video-thumb.png"),
  videoUrl: SAMPLE_REVIEW_VIDEO_URL,
};

export const SAMPLE_SELLER_FEEDBACK: SampleProof = {
  key: "seller-feedback",
  title: "Seller feedback screenshot",
  description:
    "The \"Completed Feedback\" page showing your 5-star seller rating, the order number and your comments.",
  image: require("../../assets/samples/seller-feedback-screenshot.png"),
};

/** Order of the reimbursement proof journey: buy → review → record → rate the seller. */
export const REIMBURSEMENT_SAMPLES: SampleProof[] = [
  SAMPLE_ORDER_SCREENSHOT,
  SAMPLE_REVIEW_SCREENSHOT,
  SAMPLE_REVIEW_VIDEO,
  SAMPLE_SELLER_FEEDBACK,
];
