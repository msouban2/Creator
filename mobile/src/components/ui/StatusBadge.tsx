import { Text, View } from "react-native";
import type { ApplicationStatus } from "../../lib/types";

const MAP: Record<
  string,
  { label: string; bg: string; text: string; dot: string }
> = {
  applied: { label: "Applied", bg: "bg-primary-100", text: "text-primary-700", dot: "#E36E86" },
  selected: { label: "Selected", bg: "bg-green-100", text: "text-success", dot: "#1BA672" },
  ordered: { label: "Ordered", bg: "bg-indigo-100", text: "text-info", dot: "#5B6EF5" },
  order_approved: { label: "Order Approved", bg: "bg-indigo-100", text: "text-info", dot: "#5B6EF5" },
  product_shipped: { label: "Shipped", bg: "bg-indigo-100", text: "text-info", dot: "#5B6EF5" },
  delivered: { label: "Delivered", bg: "bg-indigo-100", text: "text-info", dot: "#5B6EF5" },
  product_received: { label: "In Progress", bg: "bg-indigo-100", text: "text-info", dot: "#5B6EF5" },
  content_creation: { label: "In Progress", bg: "bg-indigo-100", text: "text-info", dot: "#5B6EF5" },
  draft_submitted: { label: "In Progress", bg: "bg-indigo-100", text: "text-info", dot: "#5B6EF5" },
  draft_revision: { label: "In Progress", bg: "bg-indigo-100", text: "text-info", dot: "#5B6EF5" },
  draft_approved: { label: "In Progress", bg: "bg-indigo-100", text: "text-info", dot: "#5B6EF5" },
  posted: { label: "In Progress", bg: "bg-indigo-100", text: "text-info", dot: "#5B6EF5" },
  link_submitted: { label: "In Progress", bg: "bg-indigo-100", text: "text-info", dot: "#5B6EF5" },
  submitted: { label: "In Review", bg: "bg-indigo-100", text: "text-info", dot: "#5B6EF5" },
  review: { label: "In Review", bg: "bg-indigo-100", text: "text-info", dot: "#5B6EF5" },
  payment_in_progress: { label: "Payment in Progress", bg: "bg-amber-100", text: "text-warning", dot: "#E4870B" },
  completed: { label: "Completed", bg: "bg-green-100", text: "text-success", dot: "#1BA672" },
  rejected: { label: "Rejected", bg: "bg-primary-100", text: "text-primary-700", dot: "#E36E86" },
};

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  const s = MAP[status] ?? MAP.applied;
  return (
    <View className={`flex-row items-center gap-1.5 self-start rounded-full px-2.5 py-1 ${s.bg}`}>
      <View className="h-2 w-2 rounded-full" style={{ backgroundColor: s.dot }} />
      <Text className={`text-xs font-semibold ${s.text}`}>{s.label}</Text>
    </View>
  );
}
