import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NICHE_OPTIONS } from "../lib/niches";
import { colors } from "../lib/theme";

// Multi-select chip picker for a creator's content niches. Controlled: the
// parent owns the selected list and gets a new array on every toggle. A `max`
// caps how many can be selected (default 3) — once reached, unselected chips
// are disabled until the creator removes one.
export function NichePicker({
  label = "Content Niches",
  hint,
  value,
  onChange,
  max = 3,
}: {
  label?: string;
  hint?: string;
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
}) {
  const atLimit = value.length >= max;

  const toggle = (niche: string) => {
    if (value.includes(niche)) {
      onChange(value.filter((n) => n !== niche));
    } else if (!atLimit) {
      onChange([...value, niche]);
    }
  };

  return (
    <View className="gap-2">
      {label ? <Text className="text-sm font-semibold text-ink">{label}</Text> : null}
      {hint ? <Text className="-mt-1 text-xs text-ink-muted">{hint}</Text> : null}
      <Text className="-mt-1 text-xs font-semibold text-primary">
        Choose up to {max} · {value.length}/{max} selected
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {NICHE_OPTIONS.map((niche) => {
          const active = value.includes(niche);
          const disabled = !active && atLimit;
          return (
            <Pressable
              key={niche}
              onPress={() => toggle(niche)}
              disabled={disabled}
              className={`flex-row items-center gap-1.5 rounded-full border px-3 py-2 ${
                active
                  ? "border-primary bg-primary-100"
                  : disabled
                    ? "border-primary-100 bg-primary-50 opacity-40"
                    : "border-primary-100 bg-white"
              }`}
            >
              {active ? <Ionicons name="checkmark" size={14} color={colors.primary} /> : null}
              <Text className={`text-sm font-semibold ${active ? "text-primary" : "text-ink-soft"}`}>
                {niche}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
