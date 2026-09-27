import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Input } from "../../src/components/ui/Input";
import { Button } from "../../src/components/ui/Button";
import { useRequestWithdrawal, useWallet } from "../../src/api/wallet";
import { useBankAccounts } from "../../src/api/bankAccounts";
import { useKyc } from "../../src/api/profile";
import { useAuthStore } from "../../src/store/auth";
import { colors } from "../../src/lib/theme";
import { formatCurrency } from "../../src/lib/format";
import type { WithdrawalMethod } from "../../src/lib/types";

const MIN_WITHDRAWAL = 300;

export default function WithdrawScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: wallet } = useWallet();
  const { data: bankAccounts = [] } = useBankAccounts();
  const { data: kyc } = useKyc();
  const profile = useAuthStore((s) => s.profile);
  const request = useRequestWithdrawal();
  const [method, setMethod] = useState<WithdrawalMethod>(profile?.payout_method ?? "upi");
  const [amount, setAmount] = useState("");
  const [upi, setUpi] = useState(profile?.payout_upi_id ?? "");

  const aadhaarVerified = !!kyc?.aadhaar_verified;

  // Bank transfer now pays out to a saved (KYC) bank account. Default to the
  // primary account; let the user pick another saved account if they have more.
  const primary = bankAccounts.find((a) => a.is_primary) ?? bankAccounts[0];
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(primary?.id ?? null);
  const selectedAccount = bankAccounts.find((a) => a.id === (selectedAccountId ?? primary?.id)) ?? primary;

  const onSubmit = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return Alert.alert("Invalid amount", "Enter a valid amount.");
    if (amt < MIN_WITHDRAWAL) return Alert.alert("Minimum ₹300", `The minimum withdrawal amount is ${formatCurrency(MIN_WITHDRAWAL)}.`);
    if (amt > (wallet?.available_balance ?? 0)) return Alert.alert("Insufficient balance");
    if (!aadhaarVerified)
      return Alert.alert("Verify your KYC", "Complete your Aadhaar verification in KYC before withdrawing.");
    if (method === "upi" && !upi) return Alert.alert("Enter UPI ID");
    if (method === "bank_transfer" && !selectedAccount)
      return Alert.alert("No bank account", "Add a bank account in KYC before withdrawing to a bank.");
    if (method === "bank_transfer" && !selectedAccount?.verified)
      return Alert.alert("Verify this account", "Select a verified bank account. Verify it in KYC before withdrawing.");

    try {
      await request.mutateAsync({
        amount: amt,
        method,
        upi: method === "upi" ? upi : undefined,
        bankAccount: method === "bank_transfer" ? selectedAccount?.account_number : undefined,
        ifsc: method === "bank_transfer" ? selectedAccount?.ifsc_code : undefined,
        accountName: method === "bank_transfer" ? selectedAccount?.account_holder_name : undefined,
      });
      Alert.alert("Requested", "Your withdrawal request is pending admin approval.");
      router.back();
    } catch (e: any) {
      Alert.alert("Failed", e.message ?? "Try again.");
    }
  };

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerStyle={{ paddingBottom: 60, paddingTop: insets.top + 12 }}>
      <View className="flex-row items-center gap-3 px-5 pb-4">
        <Pressable onPress={() => router.back()}><Ionicons name="chevron-back" size={26} color={colors.ink} /></Pressable>
        <Text className="text-xl font-bold text-ink">Request Withdrawal</Text>
      </View>

      <View className="mx-5 rounded-2xl bg-primary-100 p-4">
        <Text className="text-xs text-ink-soft">Available Balance</Text>
        <Text className="text-2xl font-extrabold text-primary">{formatCurrency(wallet?.available_balance)}</Text>
        <Text className="mt-1 text-xs text-ink-soft">Minimum withdrawal {formatCurrency(MIN_WITHDRAWAL)}</Text>
      </View>

      {!aadhaarVerified ? (
        <Pressable
          onPress={() => router.push("/kyc")}
          className="mx-5 mt-4 flex-row items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"
        >
          <Ionicons name="shield-outline" size={20} color="#B45309" style={{ marginTop: 1 }} />
          <View className="flex-1">
            <Text className="text-sm font-bold text-amber-700">Verify your KYC to withdraw</Text>
            <Text className="mt-0.5 text-xs text-amber-700">
              Complete your Aadhaar verification in KYC before you can request a payout. Tap to verify.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#B45309" />
        </Pressable>
      ) : null}

      <View className="mt-5 gap-4 px-5">
        <View className="flex-row gap-3">
          {(["upi", "bank_transfer"] as WithdrawalMethod[]).map((m) => (
            <Pressable key={m} onPress={() => setMethod(m)} className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl border py-4 ${method === m ? "border-primary bg-primary-50" : "border-primary-100 bg-white"}`}>
              <Ionicons name={m === "upi" ? "phone-portrait-outline" : "card-outline"} size={18} color={method === m ? colors.primary : colors.inkMuted} />
              <Text className={`text-sm font-semibold ${method === m ? "text-primary" : "text-ink-soft"}`}>{m === "upi" ? "UPI" : "Bank Transfer"}</Text>
            </Pressable>
          ))}
        </View>

        <Input label="Amount" icon="cash-outline" placeholder="Enter amount" keyboardType="number-pad" value={amount} onChangeText={setAmount} />

        {method === "upi" ? (
          <Input label="UPI ID" icon="at-outline" placeholder="name@bank" autoCapitalize="none" value={upi} onChangeText={setUpi} />
        ) : bankAccounts.length === 0 ? (
          <View className="items-center rounded-2xl border border-dashed border-primary-200 bg-primary-50 p-5">
            <Ionicons name="business-outline" size={26} color={colors.primary} />
            <Text className="mt-2 text-center text-sm font-semibold text-ink">No bank account added yet</Text>
            <Text className="mt-1 text-center text-xs text-ink-muted">
              Add a bank account in KYC to receive bank payouts.
            </Text>
            <Pressable onPress={() => router.push("/kyc")} className="mt-3 rounded-full bg-ink px-4 py-2.5">
              <Text className="text-sm font-bold text-white">Add Bank Account</Text>
            </Pressable>
          </View>
        ) : (
          <View className="gap-2">
            <Text className="text-sm font-semibold text-ink">Payout to</Text>
            {bankAccounts.map((acc) => {
              const active = (selectedAccountId ?? primary?.id) === acc.id;
              return (
                <Pressable
                  key={acc.id}
                  onPress={() => setSelectedAccountId(acc.id)}
                  className={`flex-row items-center gap-3 rounded-2xl border p-3.5 ${active ? "border-primary bg-primary-50" : "border-primary-100 bg-white"}`}
                >
                  <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-100">
                    <Ionicons name="business-outline" size={18} color={colors.primary} />
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-sm font-bold text-ink">{acc.bank_name}</Text>
                      {acc.is_primary ? (
                        <View className="rounded-full bg-primary-100 px-2 py-0.5">
                          <Text className="text-[9px] font-bold text-primary">Primary</Text>
                        </View>
                      ) : null}
                      {acc.verified ? (
                        <View className="flex-row items-center gap-0.5 rounded-full bg-green-50 px-2 py-0.5">
                          <Ionicons name="shield-checkmark" size={9} color={colors.success} />
                          <Text className="text-[9px] font-bold text-success">Verified</Text>
                        </View>
                      ) : (
                        <View className="rounded-full bg-amber-50 px-2 py-0.5">
                          <Text className="text-[9px] font-bold text-amber-700">Not verified</Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-xs text-ink-muted">XXXX {acc.account_number.slice(-4)}</Text>
                  </View>
                  <Ionicons
                    name={active ? "radio-button-on" : "radio-button-off"}
                    size={20}
                    color={active ? colors.primary : colors.inkMuted}
                  />
                </Pressable>
              );
            })}
            <Pressable onPress={() => router.push("/kyc")} className="flex-row items-center gap-1 self-start px-1 py-1">
              <Ionicons name="add" size={15} color={colors.primary} />
              <Text className="text-xs font-semibold text-primary">Manage bank accounts</Text>
            </Pressable>
          </View>
        )}

        <Button
          label="Submit Request"
          onPress={onSubmit}
          loading={request.isPending}
          disabled={
            !aadhaarVerified ||
            (method === "bank_transfer" && (bankAccounts.length === 0 || !selectedAccount?.verified))
          }
          variant="dark"
          fullWidth
        />
      </View>
    </ScrollView>
  );
}
