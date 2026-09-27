import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const pad = (n: number) => String(n).padStart(2, "0");

export function useCountdown(target?: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!target) return null;
  const end = new Date(target).getTime();
  if (Number.isNaN(end)) return null;
  const diff = end - now;
  const secs = Math.max(0, Math.floor(diff / 1000));
  return {
    ended: diff <= 0,
    days: Math.floor(secs / 86400),
    hours: Math.floor((secs % 86400) / 3600),
    minutes: Math.floor((secs % 3600) / 60),
    seconds: secs % 60,
  };
}

interface CountdownCardProps {
  target?: string | null;
  label: string;
  endedLabel?: string;
}

export function CountdownCard({ target, label, endedLabel }: CountdownCardProps) {
  const c = useCountdown(target);
  if (!c) return null;

  if (c.ended) {
    return (
      <View className="flex-row items-center gap-2 rounded-2xl bg-red-50 p-4">
        <Ionicons name="alert-circle-outline" size={18} color="#DC2626" />
        <Text className="text-sm font-semibold text-red-600">{endedLabel ?? `${label} — Closed`}</Text>
      </View>
    );
  }

  const boxes = [
    { v: c.days, l: "Days" },
    { v: c.hours, l: "Hrs" },
    { v: c.minutes, l: "Min" },
    { v: c.seconds, l: "Sec" },
  ];

  return (
    <View className="rounded-2xl bg-primary p-4">
      <View className="flex-row items-center gap-2">
        <Ionicons name="timer-outline" size={16} color="#fff" />
        <Text className="text-sm font-semibold text-white">{label}</Text>
      </View>
      <View className="mt-3 flex-row gap-2">
        {boxes.map((b) => (
          <View key={b.l} className="flex-1 items-center rounded-xl bg-white/15 py-2">
            <Text className="text-2xl font-extrabold text-white">{pad(b.v)}</Text>
            <Text className="text-[10px] text-white/80">{b.l}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
