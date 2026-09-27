import { Pressable, Text, View } from "react-native";
import type { CampaignType } from "../lib/types";

const TABS: { key: CampaignType; label: string }[] = [
  { key: "reimbursement", label: "Reimbursement" },
  { key: "barter", label: "Barter" },
  { key: "paid", label: "Paid" },
];

export function TypeTabs({
  value,
  onChange,
}: {
  value: CampaignType;
  onChange: (t: CampaignType) => void;
}) {
  return (
    <View className="mx-5 flex-row items-center gap-2">
      {TABS.map((tab) => {
        const active = tab.key === value;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            className={`flex-1 items-center justify-center rounded-2xl border py-3 ${
              active
                ? "border-ink bg-ink"
                : "border-primary-100 bg-white"
            }`}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              className={`text-xs font-bold ${active ? "text-white" : "text-ink-soft"}`}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
