import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ApplicationStatus, CampaignType } from "../lib/types";
import { STEPS_BY_TYPE, APPLICATION_STEPS, SHORT_STEP_LABEL, stepIndexForStatus, colors } from "../lib/theme";

export function ProgressTracker({
  status,
  campaignType = "reimbursement",
  shipmentStatus,
}: {
  status: ApplicationStatus;
  campaignType?: CampaignType;
  shipmentStatus?: string | null;
}) {
  // Use the correct step list for this campaign type (avoids the duplicate/
  // irrelevant steps the old fixed list produced) and resolve the active step
  // via the shared alias-aware helper.
  const steps = STEPS_BY_TYPE[campaignType] ?? APPLICATION_STEPS.slice();
  let idx = stepIndexForStatus(campaignType, status);
  // For barter/paid the product is marked shipped, then delivered by staff. While
  // the application is still "product_shipped", a delivered shipment advances the
  // tracker to the Delivered step.
  if (
    (campaignType === "barter" || campaignType === "paid") &&
    status === "product_shipped" &&
    shipmentStatus === "delivered"
  ) {
    const di = steps.indexOf("delivered");
    if (di >= 0) idx = di;
  }
  const activeIndex = idx < 0 ? 0 : idx;

  return (
    <View className="flex-row items-start justify-between">
      {steps.map((step, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <View key={step} className="flex-1 items-center">
            <View className="w-full flex-row items-center">
              <View
                className="h-0.5 flex-1"
                style={{ backgroundColor: i === 0 ? "transparent" : done || active ? colors.success : "#E7DEDE" }}
              />
              <View
                className="h-6 w-6 items-center justify-center rounded-full"
                style={{ backgroundColor: done ? colors.success : active ? colors.info : "#F0EAEA" }}
              >
                {done ? (
                  <Ionicons name="checkmark" size={14} color="#fff" />
                ) : (
                  <View className="h-2 w-2 rounded-full bg-white" />
                )}
              </View>
              <View
                className="h-0.5 flex-1"
                style={{ backgroundColor: i === steps.length - 1 ? "transparent" : done ? colors.success : "#E7DEDE" }}
              />
            </View>
            <Text
              className="mt-1.5 text-center text-[10px]"
              style={{ color: active ? colors.info : done ? colors.success : colors.inkMuted }}
              numberOfLines={1}
            >
              {SHORT_STEP_LABEL[step] ?? step}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
