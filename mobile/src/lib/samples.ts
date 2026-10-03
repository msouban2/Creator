import type { ImageSourcePropType } from "react-native";

export type SampleProof = {
  key: string;
  title: string;
  description: string;
  /** Bundled still image, for screenshot samples. */
  image?: ImageSourcePropType;
  /** Bundled mp4, for video samples. Mutually exclusive with `image`. */
  video?: number | string;
};

export const SAMPLE_ORDER_SCREENSHOT: SampleProof = {
  key: "order-screenshot",
  title: "Order screenshot",
  description:
    "Full order details page showing the product name, seller, order date, order number and grand total.",
  image: require("../../assets/samples/order-screenshot.jpeg"),
};

export const SAMPLE_DELIVERY_DATE: SampleProof = {
  key: "delivery-date",
  title: "Delivery date screenshot",
  description:
    "Order details showing the delivery date, delivered status, product and order number.",
  image: require("../../assets/samples/Delivered_date.jpeg"),
};

export const SAMPLE_REVIEW_SCREENSHOT: SampleProof = {
  key: "review-screenshot",
  title: "Live review screenshot",
  description:
    "Your published review on the product page — star rating, \"Verified Purchase\" badge, review title, photos and text must be visible.",
  image: require("../../assets/samples/review-screenshot.jpeg"),
};

export const SAMPLE_REVIEW_VIDEO: SampleProof = {
  key: "review-video",
  title: "Review submission video",
  description:
    "Screen recording that scrolls from the product page to your live review, so we can confirm the review belongs to your account.",
  video: require("../../assets/samples/review-video.mp4"),
};

export const SAMPLE_SELLER_FEEDBACK: SampleProof = {
  key: "seller-feedback",
  title: "Seller feedback screenshot",
  description:
    "The \"Completed Feedback\" page showing your 5-star seller rating, the order number and your comments.",
  image: require("../../assets/samples/seller-feedback-screenshot.jpeg"),
};

/** Order of the reimbursement proof journey: buy → review → record → rate the seller. */
export const REIMBURSEMENT_SAMPLES: SampleProof[] = [
  SAMPLE_ORDER_SCREENSHOT,
  SAMPLE_DELIVERY_DATE,
  SAMPLE_REVIEW_SCREENSHOT,
  SAMPLE_REVIEW_VIDEO,
  SAMPLE_SELLER_FEEDBACK,
];
