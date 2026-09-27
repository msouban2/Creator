import { useCallback } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Card } from "../../src/components/ui/Card";
import { Button } from "../../src/components/ui/Button";
import { useTransactions, useWallet, useWithdrawals } from "../../src/api/wallet";
import { colors } from "../../src/lib/theme";
import { formatCurrency, formatDate } from "../../src/lib/format";
import type { TransactionType } from "../../src/lib/types";

const TXN_ICON: Record<TransactionType, keyof typeof Ionicons.glyphMap> = {
  campaign_payment: "cash-outline",
  reimbursement: "wallet-outline",
  referral_bonus: "people-outline",
  withdrawal: "arrow-up-outline",
};

export default function WalletScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: wallet, refetch: refetchWallet, isRefetching: r1 } = useWallet();
  const { data: transactions = [], refetch: refetchTxns, isRefetching: r2 } = useTransactions();
  const { data: withdrawals = [], refetch: refetchWithdrawals, isRefetching: r3 } = useWithdrawals();

  const refreshAll = useCallback(() => {
    refetchWallet();
    refetchTxns();
    refetchWithdrawals();
  }, [refetchWallet, refetchTxns, refetchWithdrawals]);

  // Refresh whenever the wallet screen comes into focus so a newly
  // released payment shows up immediately.
  useFocusEffect(
    useCallback(() => {
      refreshAll();
    }, [refreshAll])
  );

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerStyle={{ paddingBottom: 60, paddingTop: insets.top + 12 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={r1 || r2 || r3} onRefresh={refreshAll} tintColor={colors.primary} />
      }
    >
      <View className="flex-row items-center gap-3 px-5 pb-4">
        <Pressable onPress={() => router.back()}><Ionicons name="chevron-back" size={26} color={colors.ink} /></Pressable>
        <Text className="text-xl font-bold text-ink">Wallet</Text>
      </View>

      <LinearGradient colors={["#1A1A1A", "#0D0D0D"]} style={{ borderRadius: 24, marginHorizontal: 20 }}>
        <View className="p-5">
          <Text className="text-sm text-white/80">Available Balance</Text>
          <Text className="text-4xl font-extrabold text-white">{formatCurrency(wallet?.available_balance)}</Text>
          <View className="mt-4 flex-row justify-between">
            <View>
              <Text className="text-xs text-white/70">Pending</Text>
              <Text className="text-base font-bold text-white">{formatCurrency(wallet?.pending_balance)}</Text>
            </View>
            <View>
              <Text className="text-xs text-white/70">Lifetime Earnings</Text>
              <Text className="text-base font-bold text-white">{formatCurrency(wallet?.lifetime_earnings)}</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <View className="mx-5 mt-4">
        <Button
          label="Request Withdrawal"
          variant="dark"
          fullWidth
          onPress={() => router.push("/wallet/withdraw")}
          leftIcon={<Ionicons name="arrow-up-circle-outline" size={18} color="#fff" />}
        />
      </View>

      <Text className="mx-5 mt-6 text-base font-bold text-ink">Transaction History</Text>
      <Card className="mx-5 mt-2 py-1">
        {transactions.length === 0 ? (
          <Text className="py-4 text-center text-sm text-ink-muted">No transactions yet</Text>
        ) : (
          transactions.map((t) => (
            <View key={t.id} className="flex-row items-center gap-3 py-3">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-100">
                <Ionicons name={TXN_ICON[t.type]} size={18} color={colors.primary} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-ink">{t.remarks ?? t.type}</Text>
                <Text className="text-xs text-ink-muted">{formatDate(t.created_at)}</Text>
              </View>
              <Text className={`text-sm font-bold ${t.amount < 0 ? "text-primary" : "text-success"}`}>
                {t.amount < 0 ? "-" : "+"}{formatCurrency(Math.abs(t.amount))}
              </Text>
            </View>
          ))
        )}
      </Card>

      <Text className="mx-5 mt-6 text-base font-bold text-ink">Withdrawal History</Text>
      <Card className="mx-5 mb-6 mt-2 py-1">
        {withdrawals.length === 0 ? (
          <Text className="py-4 text-center text-sm text-ink-muted">No withdrawals yet</Text>
        ) : (
          withdrawals.map((w) => (
            <View key={w.id} className="flex-row items-center gap-3 py-3">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-100">
                <Ionicons name={w.method === "upi" ? "phone-portrait-outline" : "card-outline"} size={18} color={colors.primary} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-ink">{w.method === "upi" ? "UPI" : "Bank Transfer"}</Text>
                <Text className="text-xs text-ink-muted">{formatDate(w.created_at)}</Text>
              </View>
              <View className="items-end">
                <Text className="text-sm font-bold text-ink">{formatCurrency(w.amount)}</Text>
                <Text className="text-[10px] font-semibold capitalize text-warning">{w.status}</Text>
              </View>
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}
