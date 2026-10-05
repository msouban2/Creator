import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HomeHeader } from "../../src/components/HomeHeader";
import { Card } from "../../src/components/ui/Card";
import { CampaignImage } from "../../src/components/CampaignImage";
import { StatusBadge } from "../../src/components/ui/StatusBadge";
import { ProgressTracker } from "../../src/components/ProgressTracker";
import { EmptyState } from "../../src/components/ui/EmptyState";
import { useCampaignSlotSummary, useMyApplications } from "../../src/api/applications";
import { colors, CAMPAIGN_TYPE_LABEL } from "../../src/lib/theme";
import { formatCurrency, formatDate } from "../../src/lib/format";
import type { Application, ApplicationStatus } from "../../src/lib/types";

const FILTERS = ["All", "Applied", "Selected", "In Progress", "Completed", "Rejected"] as const;
type Filter = (typeof FILTERS)[number];

const IN_PROGRESS: ApplicationStatus[] = [
  "selected",
  "ordered",
  "order_approved",
  "product_shipped",
  "delivered",
  "product_received",
  "content_creation",
  "draft_submitted",
  "draft_revision",
  "draft_approved",
  "posted",
  "link_submitted",
  "submitted",
  "review",
  "payment_in_progress",
];

function matches(filter: Filter, status: ApplicationStatus) {
  switch (filter) {
    case "All": return true;
    case "Applied": return status === "applied";
    case "Selected": return status === "selected";
    case "In Progress": return IN_PROGRESS.includes(status);
    case "Completed": return status === "completed";
    case "Rejected": return status === "rejected";
  }
}

// The next action the creator should take, driving the bottom CTA. `dark` marks
// an action the creator must do now (highlighted button); otherwise it's a
// read-only "view" state.
function nextAction(app: Application): { cta: string; dark: boolean } {
  const type = app.campaign?.campaign_type;
  const isPaidBarter = type === "paid" || type === "barter";
  switch (app.status) {
    case "selected":
      return type === "reimbursement"
        ? { cta: "Buy & Upload Order", dark: true }
        : { cta: "Awaiting Shipment", dark: false };
    case "ordered":
      return { cta: "Order under review", dark: false };
    case "order_approved":
    case "product_received":
    case "content_creation":
      return { cta: "Submit Content", dark: true };
    case "product_shipped":
      return isPaidBarter
        ? { cta: "Confirm Delivery", dark: true }
        : { cta: "View Progress", dark: false };
    case "delivered":
      return isPaidBarter
        ? { cta: "Upload Draft", dark: true }
        : { cta: "View Progress", dark: false };
    case "draft_revision":
      return { cta: "Re-submit Draft", dark: true };
    case "draft_approved":
    case "posted":
      return { cta: "Post & Submit Video", dark: true };
    case "rejected":
      return { cta: "View & Re-submit", dark: true };
    case "submitted":
    case "review":
    case "draft_submitted":
    case "link_submitted":
    case "payment_in_progress":
      return { cta: "View Progress", dark: false };
    case "completed":
      return { cta: "View Details", dark: false };
    default:
      return { cta: "View Details", dark: false };
  }
}

function InfoBox({ icon, label, value, valueClass = "text-ink" }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; value: string; valueClass?: string;
}) {
  return (
    <View className="flex-1 flex-row items-center gap-2 rounded-xl bg-primary-50 px-3 py-2.5">
      <Ionicons name={icon} size={16} color={colors.primary} />
      <View className="flex-1">
        <Text className="text-[10px] text-ink-muted">{label}</Text>
        <Text className={`text-xs font-semibold ${valueClass}`} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

function ApplicationCard({ app }: { app: Application }) {
  const router = useRouter();
  const c = app.campaign;
  const {
    data: slotSummary,
    error: slotSummaryError,
  } = useCampaignSlotSummary(c?.campaign_type === "reimbursement" ? c.id : undefined, c?.slots ?? 0, c?.campaign_type);
  if (!c) return null;
  const inProgress = IN_PROGRESS.includes(app.status);
  const reimbursementTotal = c.reward_amount + c.cashback_percentage;
  const slotActionMessage =
    c.campaign_type !== "reimbursement"
      ? null
      : slotSummaryError
        ? "Order availability unavailable — try again shortly"
        : !slotSummary
          ? "Checking order availability…"
          : slotSummary.available <= 0
            ? "Orders full — better luck next time"
            : null;
  const blockOrderAction = app.status === "selected" && slotActionMessage !== null;

  return (
    <Card className="mx-5 mb-4">
      <View className="flex-row">
        <CampaignImage uri={c.campaign_image} className="h-24 w-24 rounded-2xl" iconSize={28} />
        <View className="ml-3 flex-1">
          <View className="flex-row items-center justify-between">
            <StatusBadge status={app.status} />
            <Ionicons name="bookmark-outline" size={18} color={colors.ink} />
          </View>
          <Text className="mt-1.5 text-base font-bold text-ink" numberOfLines={1}>{c.title}</Text>
          <View className="mt-0.5 flex-row items-center gap-1">
            <Ionicons name="pricetag-outline" size={12} color={colors.primary} />
            <Text className="text-xs text-ink-soft">{CAMPAIGN_TYPE_LABEL[c.campaign_type]} Collaboration</Text>
          </View>
        </View>
      </View>

      {inProgress ? (
        <View className="mt-3">
          <Text className="mb-2 text-xs font-semibold text-ink-soft">Campaign Progress</Text>
          <ProgressTracker status={app.status} campaignType={c.campaign_type} shipmentStatus={app.seller_shipment_status} />
        </View>
      ) : (
        <View className="mt-3 flex-row gap-2">
          {app.status === "applied" && (
            <>
              <InfoBox icon="calendar-outline" label="Applied On" value={formatDate(app.applied_at)} />
              <InfoBox icon="time-outline" label="Status" value="Under Review" valueClass="text-warning" />
            </>
          )}
          {app.status === "selected" && (
            <>
              <InfoBox icon="calendar-outline" label="Selected On" value={formatDate(app.selected_at)} />
              <InfoBox
                icon="document-text-outline"
                label="Next Step"
                value={c.campaign_type === "reimbursement" ? "Buy & Upload Order" : "Submit Details"}
                valueClass="text-info"
              />
            </>
          )}
          {app.status === "completed" && (
            <>
              <InfoBox icon="calendar-outline" label="Completed On" value={formatDate(app.completed_at)} />
              <InfoBox
                icon="cash-outline"
                label="Earnings"
                value={c.campaign_type === "reimbursement" ? formatCurrency(reimbursementTotal) : formatCurrency(c.reward_amount)}
                valueClass="text-success"
              />
            </>
          )}
          {app.status === "rejected" && (
            <View className="flex-1 rounded-xl bg-primary-50 px-3 py-2.5">
              <View className="flex-row items-center gap-1">
                <Ionicons name="alert-circle-outline" size={13} color={colors.primary} />
                <Text className="text-xs font-semibold text-primary">Reason for Rejection</Text>
              </View>
              <Text className="mt-0.5 text-xs text-ink-soft">
                {app.reject_reason ?? "Profile not matched with campaign requirements."}
              </Text>
            </View>
          )}
        </View>
      )}

      <View className="mt-3 flex-row justify-end">
        {blockOrderAction ? (
          <View className="flex-row items-center gap-1.5 rounded-xl bg-red-50 px-4 py-2.5">
            <Ionicons name="lock-closed-outline" size={14} color="#dc2626" />
            <Text className="text-xs font-semibold text-red-700">{slotActionMessage}</Text>
          </View>
        ) : (() => {
            const action = nextAction(app);
            return (
            <Pressable
              onPress={() => router.push(`/application/${app.id}`)}
              className={`flex-row items-center gap-1.5 rounded-xl px-4 py-2.5 ${
                action.dark ? "bg-ink" : "bg-primary-100"
              }`}
            >
              <Text className={`text-xs font-semibold ${action.dark ? "text-white" : "text-primary"}`}>
                {action.cta}
              </Text>
              <Ionicons name="arrow-forward" size={14} color={action.dark ? "#fff" : colors.primary} />
            </Pressable>
            );
          })()}
      </View>
    </Card>
  );
}

export default function MyCampaignsScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>("All");
  const { data: apps = [], isLoading, refetch, isRefetching } = useMyApplications("all");

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const filtered = useMemo(() => apps.filter((a) => matches(filter, a.status)), [apps, filter]);

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top + 6 }}>
      <HomeHeader title="My Campaigns" />

      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 12, gap: 8, alignItems: "center" }}
        >
          {FILTERS.map((item) => {
            const active = item === filter;
            return (
              <Pressable
                key={item}
                onPress={() => setFilter(item)}
                style={{
                  minHeight: 38,
                  paddingHorizontal: 18,
                  justifyContent: "center",
                  alignItems: "center",
                  borderRadius: 999,
                  backgroundColor: active ? colors.ink : "#FADFE5",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: active ? "#FFFFFF" : colors.inkSoft,
                  }}
                >
                  {item}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <Text className="px-5 pb-1 text-xs text-ink-muted">Total {filtered.length} campaigns</Text>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ApplicationCard app={item} />}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState icon="clipboard-outline" title="No campaigns here" message="Apply to campaigns to see them here." />
          ) : null
        }
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
        }
      />
    </View>
  );
}
