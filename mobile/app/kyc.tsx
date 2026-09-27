import { useState } from "react";
import { Alert, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Input } from "../src/components/ui/Input";
import { Button } from "../src/components/ui/Button";
import { supabase } from "../src/lib/supabase";
import { useKyc } from "../src/api/profile";
import {
  useBankAccounts,
  useAddBankAccount,
  useSetPrimaryBankAccount,
} from "../src/api/bankAccounts";
import {
  useVerifyPan,
  useSendAadhaarOtp,
  useVerifyAadhaarOtp,
  useVerifyBank,
} from "../src/api/kycVerify";
import { useAuthStore } from "../src/store/auth";
import { colors } from "../src/lib/theme";
import type { BankAccount } from "../src/lib/types";
import { isValidPan, isValidAadhaar, normalizePan, normalizeAadhaar } from "../src/lib/kyc";

type Step = "intro" | "aadhaar" | "pan" | "bank-intro" | "add-bank" | "accounts";

const STEP_NO: Record<Exclude<Step, "intro">, number> = {
  aadhaar: 2,
  pan: 3,
  "bank-intro": 4,
  "add-bank": 5,
  accounts: 6,
};

function Header({
  title,
  step,
  onBack,
}: {
  title: string;
  step?: number;
  onBack: () => void;
}) {
  return (
    <View className="mb-5 flex-row items-center justify-between">
      <Pressable onPress={onBack} hitSlop={8}>
        <Ionicons name="chevron-back" size={26} color={colors.ink} />
      </Pressable>
      {step ? <Text className="text-sm font-semibold text-ink-muted">{step}/6</Text> : null}
    </View>
  );
}

function InfoNote({ icon, children }: { icon: keyof typeof Ionicons.glyphMap; children: React.ReactNode }) {
  return (
    <View className="mt-4 flex-row gap-2 rounded-2xl bg-primary-50 p-4">
      <Ionicons name={icon} size={18} color={colors.primary} style={{ marginTop: 1 }} />
      <Text className="flex-1 text-xs leading-5 text-ink-soft">{children}</Text>
    </View>
  );
}

export default function KycScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const userId = useAuthStore((s) => s.session?.user?.id);
  const { data: kyc, refetch: refetchKyc } = useKyc();
  const { data: accounts = [], refetch: refetchAccounts } = useBankAccounts();
  const primaryAccount = accounts.find((a) => a.is_primary) ?? accounts[0];
  const addBank = useAddBankAccount();
  const setPrimary = useSetPrimaryBankAccount();
  const sendOtp = useSendAadhaarOtp();
  const verifyAadhaar = useVerifyAadhaarOtp();
  const verifyPan = useVerifyPan();
  const verifyBank = useVerifyBank();

  const [step, setStep] = useState<Step>("intro");

  // Form state
  const [aadhaar, setAadhaar] = useState(kyc?.aadhaar_number ?? "");
  const [pan, setPan] = useState(kyc?.pan_number ?? "");
  const [savingId, setSavingId] = useState(false);

  // Aadhaar OTP verification state
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [reqId, setReqId] = useState<string | null>(null);
  const [aadhaarVerified, setAadhaarVerified] = useState(!!kyc?.aadhaar_verified);
  const [aadhaarName, setAadhaarName] = useState<string | null>(kyc?.aadhaar_name ?? null);

  // PAN verification state
  const [panVerified, setPanVerified] = useState(!!kyc?.pan_verified);
  const [panName, setPanName] = useState<string | null>(kyc?.pan_name ?? null);

  const [holder, setHolder] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNo, setAccountNo] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [primary, setPrimaryFlag] = useState(true);

  // Enable the button on plausible input (12 digits); the real check is the
  // server-side OTP verification, which returns a precise error for bad numbers.
  const aadhaarDigits = normalizeAadhaar(aadhaar).length;
  const aadhaarOk = aadhaarDigits === 12;
  const aadhaarChecksumOk = isValidAadhaar(aadhaar);
  const panLenOk = normalizePan(pan).length === 10;

  const saveIdentity = async (status: "pending" | "keep" = "pending") => {
    setSavingId(true);
    try {
      const { error } = await supabase.from("kyc").upsert(
        {
          user_id: userId,
          aadhaar_number: normalizeAadhaar(aadhaar),
          pan_number: pan.trim() ? normalizePan(pan) : null,
          status: status === "keep" ? (kyc?.status ?? "pending") : "pending",
        },
        { onConflict: "user_id" }
      );
      if (error) throw error;
      await refetchKyc();
      return true;
    } catch (e: any) {
      Alert.alert("Couldn't save", e.message ?? "Please try again.");
      return false;
    } finally {
      setSavingId(false);
    }
  };

  const onSendOtp = async () => {
    if (!aadhaarOk) return Alert.alert("Invalid Aadhaar", "Enter all 12 digits correctly.");
    try {
      const res = await sendOtp.mutateAsync(normalizeAadhaar(aadhaar));
      if (!res.sent) throw new Error(res.error ?? "Couldn't send OTP.");
      setReqId(res.reqId ?? null);
      setOtpSent(true);
      setOtp("");
      Alert.alert("OTP sent 📩", "Enter the OTP sent to your Aadhaar-linked mobile number.");
    } catch (e: any) {
      Alert.alert("Couldn't send OTP", e.message ?? "Please try again.");
    }
  };

  const onVerifyAadhaar = async () => {
    if (!otp.trim()) return Alert.alert("Enter OTP", "Enter the OTP you received.");
    try {
      const res = await verifyAadhaar.mutateAsync({
        aadhaar: normalizeAadhaar(aadhaar),
        otp: otp.trim(),
        reqId: reqId ?? "",
      });
      if (!res.verified) throw new Error(res.error ?? "Verification failed.");
      setAadhaarVerified(true);
      setAadhaarName(res.name ?? null);
      await refetchKyc();
      setStep("pan");
    } catch (e: any) {
      Alert.alert("Verification failed", e.message ?? "Please check the OTP and try again.");
    }
  };

  const onVerifyPan = async () => {
    if (!isValidPan(pan)) return Alert.alert("Invalid PAN", "Enter a valid PAN like ABCDE1234F.");
    try {
      const res = await verifyPan.mutateAsync(normalizePan(pan));
      if (!res.verified) throw new Error(res.error ?? "PAN verification failed.");
      setPanVerified(true);
      setPanName(res.name ?? null);
      await refetchKyc();
      Alert.alert("PAN verified ✅", res.name ? `Registered name: ${res.name}` : "Your PAN is verified.");
    } catch (e: any) {
      Alert.alert("Verification failed", e.message ?? "Please check the PAN and try again.");
    }
  };

  const onSaveBank = async () => {
    if (!holder.trim()) return Alert.alert("Add name", "Enter the account holder name.");
    if (!bankName.trim()) return Alert.alert("Add bank", "Enter the bank name.");
    if (accountNo.trim().length < 6) return Alert.alert("Check account number", "Enter a valid account number.");
    if (!/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(ifsc.trim()))
      return Alert.alert("Check IFSC", "Enter a valid 11-character IFSC code, e.g. HDFC0001234.");
    try {
      const acct = await addBank.mutateAsync({
        account_holder_name: holder.trim(),
        bank_name: bankName.trim(),
        account_number: accountNo.trim(),
        ifsc_code: ifsc.trim(),
        is_primary: primary,
      });
      setHolder("");
      setBankName("");
      setAccountNo("");
      setIfsc("");
      setPrimaryFlag(false);

      // Real-time penny-less verification against the account + IFSC.
      try {
        const v = await verifyBank.mutateAsync(acct.id);
        if (v.verified) {
          Alert.alert(
            "Bank verified ✅",
            v.nameAtBank ? `Account holder: ${v.nameAtBank}` : "Your bank account is verified."
          );
        } else {
          Alert.alert(
            "Saved, not verified",
            v.error ?? "We couldn't verify this account right now. You can retry from your accounts list."
          );
        }
      } catch (ve: any) {
        Alert.alert("Saved, not verified", ve.message ?? "You can retry verification from your accounts list.");
      }

      await refetchAccounts();
      setStep("accounts");
    } catch (e: any) {
      Alert.alert("Couldn't save account", e.message ?? "Please try again.");
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerStyle={{ paddingBottom: 60, paddingTop: insets.top + 12, paddingHorizontal: 20 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ---------------- STEP 1 · INTRO ---------------- */}
      {step === "intro" && (
        <View>
          <Header title="KYC Verification" onBack={() => router.back()} />
          <Text className="text-2xl font-extrabold text-ink">KYC Verification</Text>
          <Text className="mt-1 text-sm text-ink-soft">
            Complete your KYC to get full access to all features and start earning!
          </Text>

          <View className="my-6 items-center">
            <View className="h-28 w-40 items-center justify-center rounded-3xl bg-primary-50">
              <Ionicons name="card-outline" size={54} color={colors.primary} />
            </View>
          </View>

          <IntroCard
            icon="finger-print-outline"
            title="Aadhaar (Mandatory)"
            sub="We need your Aadhaar to verify your identity."
            verified={!!kyc?.aadhaar_verified}
            details={[
              ...(kyc?.aadhaar_name ? [{ label: "Name", value: kyc.aadhaar_name }] : []),
              ...(kyc?.aadhaar_number ? [{ label: "Aadhaar", value: maskId(kyc.aadhaar_number, 4) }] : []),
            ]}
          />
          <IntroCard
            icon="card-outline"
            title="PAN (Optional)"
            sub="PAN is optional for users below 18 years of age."
            verified={!!kyc?.pan_verified}
            details={[
              ...(kyc?.pan_name ? [{ label: "Name", value: kyc.pan_name }] : []),
              ...(kyc?.pan_number ? [{ label: "PAN", value: maskId(kyc.pan_number, 4) }] : []),
            ]}
          />
          <IntroCard
            icon="business-outline"
            title="Bank Details"
            sub="Add your bank account details to receive payments."
            verified={accounts.length > 0}
            details={
              primaryAccount
                ? [
                    { label: "Holder", value: primaryAccount.account_holder_name },
                    { label: primaryAccount.bank_name, value: maskId(primaryAccount.account_number, 4) },
                    { label: "IFSC", value: primaryAccount.ifsc_code },
                  ]
                : undefined
            }
          />

          <View className="mt-6">
            <Button
              label={kyc?.status === "verified" ? "Manage KYC" : "Get Started"}
              variant="dark"
              fullWidth
              onPress={() => setStep("aadhaar")}
            />
          </View>
        </View>
      )}

      {/* ---------------- STEP 2 · AADHAAR ---------------- */}
      {step === "aadhaar" && (
        <View>
          <Header title="Aadhaar" step={STEP_NO.aadhaar} onBack={() => setStep("intro")} />
          <Text className="text-2xl font-extrabold text-ink">Aadhaar Verification</Text>
          <Text className="mt-1 text-sm text-ink-soft">
            Enter your 12-digit Aadhaar number. We'll send an OTP to your Aadhaar-linked mobile to
            verify your identity.
          </Text>

          <View className="mt-6">
            <Input
              label="Aadhaar Number"
              icon="finger-print-outline"
              placeholder="12-digit Aadhaar"
              keyboardType="number-pad"
              maxLength={12}
              value={aadhaar}
              editable={!otpSent && !aadhaarVerified}
              onChangeText={(t) => {
                setAadhaar(t);
                setAadhaarVerified(false);
                setOtpSent(false);
                setReqId(null);
              }}
            />
          </View>

          {!aadhaarVerified && !otpSent && aadhaarOk && !aadhaarChecksumOk ? (
            <View className="mt-2 flex-row items-center gap-1.5">
              <Ionicons name="alert-circle-outline" size={13} color={colors.warning} />
              <Text className="text-xs text-amber-700">
                This doesn't look like a valid Aadhaar — double-check it, then tap Send OTP.
              </Text>
            </View>
          ) : null}

          {aadhaarVerified ? (
            <View className="mt-4 flex-row items-start gap-2 rounded-2xl bg-green-50 p-4">
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <View className="flex-1">
                <Text className="text-sm font-bold text-success">Aadhaar verified</Text>
                {aadhaarName ? <Text className="text-xs text-ink-soft">Name: {aadhaarName}</Text> : null}
              </View>
            </View>
          ) : otpSent ? (
            <>
              <View className="mt-4">
                <Input
                  label="OTP"
                  icon="keypad-outline"
                  placeholder="Enter OTP"
                  keyboardType="number-pad"
                  maxLength={8}
                  value={otp}
                  onChangeText={setOtp}
                />
              </View>
              <Pressable onPress={onSendOtp} disabled={sendOtp.isPending} className="mt-2 self-start py-1">
                <Text className="text-sm font-semibold text-primary">
                  {sendOtp.isPending ? "Resending…" : "Resend OTP"}
                </Text>
              </Pressable>
            </>
          ) : null}

          <View className="mt-3 flex-row items-center gap-1.5">
            <Ionicons name="lock-closed-outline" size={13} color={colors.inkMuted} />
            <Text className="text-xs text-ink-muted">Your information is secure and encrypted.</Text>
          </View>

          <View className="mt-6">
            {aadhaarVerified ? (
              <Button label="Continue" variant="dark" fullWidth onPress={() => setStep("pan")} />
            ) : otpSent ? (
              <Button
                label="Verify OTP"
                variant="dark"
                fullWidth
                loading={verifyAadhaar.isPending}
                disabled={!otp.trim()}
                onPress={onVerifyAadhaar}
              />
            ) : (
              <Button
                label="Send OTP"
                variant="dark"
                fullWidth
                loading={sendOtp.isPending}
                disabled={!aadhaarOk}
                onPress={onSendOtp}
              />
            )}
          </View>

          <InfoNote icon="information-circle-outline">
            Aadhaar is mandatory for KYC verification and to ensure a safe and secure experience.
          </InfoNote>
        </View>
      )}

      {/* ---------------- STEP 3 · PAN ---------------- */}
      {step === "pan" && (
        <View>
          <Header title="PAN" step={STEP_NO.pan} onBack={() => setStep("aadhaar")} />
          <View className="my-4 items-center">
            <View className="relative h-24 w-40 items-center justify-center rounded-3xl bg-primary-50">
              <Ionicons name="card-outline" size={48} color={colors.primary} />
              <View className="absolute -bottom-2 rounded-full bg-primary px-3 py-1">
                <Text className="text-[10px] font-bold text-white">Optional</Text>
              </View>
            </View>
          </View>
          <Text className="text-2xl font-extrabold text-ink">Enter your PAN number</Text>
          <Text className="mt-1 text-sm text-ink-soft">
            PAN is optional for users below 18 years of age.
          </Text>

          <View className="mt-6">
            <Input
              label="PAN Number"
              icon="card-outline"
              placeholder="ABCDE1234F"
              autoCapitalize="characters"
              maxLength={10}
              value={pan}
              editable={!panVerified}
              onChangeText={(t) => {
                setPan(t);
                setPanVerified(false);
              }}
            />
          </View>

          {panVerified ? (
            <View className="mt-4 flex-row items-start gap-2 rounded-2xl bg-green-50 p-4">
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <View className="flex-1">
                <Text className="text-sm font-bold text-success">PAN verified</Text>
                {panName ? <Text className="text-xs text-ink-soft">Registered name: {panName}</Text> : null}
              </View>
            </View>
          ) : null}

          <InfoNote icon="information-circle-outline">
            If you are below 18 years old, you can skip this step.
          </InfoNote>

          <View className="mt-6 gap-2">
            {panVerified ? (
              <Button
                label="Continue"
                variant="dark"
                fullWidth
                onPress={() => setStep(accounts.length ? "accounts" : "bank-intro")}
              />
            ) : (
              <Button
                label="Verify PAN"
                variant="dark"
                fullWidth
                loading={verifyPan.isPending}
                disabled={!panLenOk}
                onPress={onVerifyPan}
              />
            )}
            <Pressable
              onPress={async () => {
                setPan("");
                setPanVerified(false);
                if (await saveIdentity("pending")) setStep(accounts.length ? "accounts" : "bank-intro");
              }}
              className="items-center py-2"
            >
              <Text className="text-sm font-semibold text-ink-muted">Skip for now</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ---------------- STEP 4 · BANK INTRO ---------------- */}
      {step === "bank-intro" && (
        <View>
          <Header title="Bank Details" step={STEP_NO["bank-intro"]} onBack={() => setStep("pan")} />
          <View className="my-4 items-center">
            <View className="h-28 w-40 items-center justify-center rounded-3xl bg-primary-50">
              <Ionicons name="business-outline" size={52} color={colors.primary} />
            </View>
          </View>
          <Text className="text-2xl font-extrabold text-ink">Add Your Bank Details</Text>
          <Text className="mt-1 text-sm text-ink-soft">
            You can add 2–3 bank accounts. One account must be set as your primary account —
            payouts are sent there.
          </Text>

          <InfoNote icon="information-circle-outline">
            • 1 primary account (mandatory){"\n"}• 1–2 additional accounts (optional){"\n"}• Only your own bank accounts are allowed
          </InfoNote>

          <View className="mt-6">
            <Button label="Add Bank Account" variant="dark" fullWidth onPress={() => setStep("add-bank")} />
          </View>
        </View>
      )}

      {/* ---------------- STEP 5 · ADD BANK ACCOUNT ---------------- */}
      {step === "add-bank" && (
        <View>
          <Header
            title="Add Bank Account"
            step={STEP_NO["add-bank"]}
            onBack={() => setStep(accounts.length ? "accounts" : "bank-intro")}
          />
          <Text className="text-2xl font-extrabold text-ink">Add Bank Account</Text>

          <View className="mt-5 gap-4">
            <Input label="Account Holder Name" icon="person-outline" placeholder="As per bank records" value={holder} onChangeText={setHolder} />
            <Input label="Bank Name" icon="business-outline" placeholder="e.g. HDFC Bank" value={bankName} onChangeText={setBankName} />
            <Input label="Account Number" icon="card-outline" placeholder="Enter account number" keyboardType="number-pad" value={accountNo} onChangeText={setAccountNo} />
            <Input label="IFSC Code" icon="pricetag-outline" placeholder="e.g. HDFC0001234" autoCapitalize="characters" maxLength={11} value={ifsc} onChangeText={setIfsc} />

            <View className="flex-row items-center justify-between rounded-2xl border border-primary-100 bg-white px-4 py-3">
              <View className="flex-1 pr-3">
                <Text className="text-sm font-semibold text-ink">Set as Primary Account</Text>
                <Text className="text-xs text-ink-muted">Only one account can be set as primary. Payouts go here.</Text>
              </View>
              <Switch
                value={primary}
                onValueChange={setPrimaryFlag}
                trackColor={{ true: colors.primary, false: "#E5E5E5" }}
                thumbColor="#fff"
              />
            </View>
          </View>

          <View className="mt-6">
            <Button
              label={verifyBank.isPending ? "Verifying…" : "Save & Verify"}
              variant="dark"
              fullWidth
              loading={addBank.isPending || verifyBank.isPending}
              onPress={onSaveBank}
            />
          </View>
        </View>
      )}

      {/* ---------------- STEP 6 · BANK ACCOUNTS LIST ---------------- */}
      {step === "accounts" && (
        <View>
          <Header title="Bank Accounts" step={STEP_NO.accounts} onBack={() => setStep("bank-intro")} />

          <View className="flex-row items-start gap-2 rounded-2xl bg-green-50 p-4">
            <Ionicons name="checkmark-circle" size={22} color={colors.success} />
            <View className="flex-1">
              <Text className="text-sm font-bold text-success">KYC completed!</Text>
              <Text className="text-xs text-ink-soft">Your details have been submitted for verification.</Text>
            </View>
          </View>

          <View className="mt-5 flex-row items-center justify-between">
            <Text className="text-base font-bold text-ink">Your Bank Accounts</Text>
            {accounts.length < 3 ? (
              <Pressable onPress={() => setStep("add-bank")} className="flex-row items-center gap-1">
                <Ionicons name="add" size={16} color={colors.primary} />
                <Text className="text-sm font-semibold text-primary">Add New</Text>
              </Pressable>
            ) : null}
          </View>

          <View className="mt-3 gap-3">
            {accounts.map((acc) => (
              <AccountRow
                key={acc.id}
                acc={acc}
                verifying={verifyBank.isPending}
                onMakePrimary={async () => {
                  await setPrimary.mutateAsync(acc.id);
                  await refetchAccounts();
                }}
                onVerify={async () => {
                  try {
                    const v = await verifyBank.mutateAsync(acc.id);
                    await refetchAccounts();
                    if (v.verified) {
                      Alert.alert(
                        "Bank verified ✅",
                        v.nameAtBank ? `Account holder: ${v.nameAtBank}` : "Your bank account is verified."
                      );
                    } else {
                      Alert.alert("Not verified", v.error ?? "We couldn't verify this account. Please check the details.");
                    }
                  } catch (e: any) {
                    Alert.alert("Verification failed", e.message ?? "Please try again.");
                  }
                }}
              />
            ))}
          </View>

          <InfoNote icon="information-circle-outline">
            You can add up to 2–3 bank accounts. One account must be set as primary — that's where
            your payouts are sent.
          </InfoNote>

          <View className="mt-6">
            <Button label="Done" variant="dark" fullWidth onPress={() => router.back()} />
          </View>
        </View>
      )}
    </ScrollView>
  );
}

// Masks all but the last `visible` characters of an ID/account number, e.g.
// "XXXX XXXX 1234" — enough for the user to recognise it without exposing it.
function maskId(value: string, visible = 4): string {
  const clean = value.replace(/\s+/g, "");
  if (clean.length <= visible) return clean;
  const shown = clean.slice(-visible);
  const masked = "•".repeat(Math.max(0, clean.length - visible));
  return (masked + shown).replace(/(.{4})/g, "$1 ").trim();
}

function IntroCard({
  icon,
  title,
  sub,
  verified,
  details,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub: string;
  verified?: boolean;
  details?: { label: string; value: string }[];
}) {
  return (
    <View className="mb-3 rounded-2xl border border-primary-100 bg-white p-4">
      <View className="flex-row items-center gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-full bg-primary-100">
          <Ionicons name={icon} size={20} color={colors.primary} />
        </View>
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-sm font-bold text-ink">{title}</Text>
            {verified ? (
              <View className="flex-row items-center gap-1 rounded-full bg-green-100 px-2 py-0.5">
                <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                <Text className="text-[10px] font-bold text-success">Verified</Text>
              </View>
            ) : null}
          </View>
          <Text className="text-xs text-ink-muted">
            {verified && details && details.length ? "Verified — your details below." : sub}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
      </View>

      {verified && details && details.length ? (
        <View className="mt-3 gap-1.5 rounded-xl bg-primary-50 p-3">
          {details.map((d) => (
            <View key={d.label} className="flex-row justify-between gap-3">
              <Text className="text-xs text-ink-muted">{d.label}</Text>
              <Text className="flex-1 text-right text-xs font-semibold text-ink" numberOfLines={1}>
                {d.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function AccountRow({
  acc,
  verifying,
  onMakePrimary,
  onVerify,
}: {
  acc: BankAccount;
  verifying: boolean;
  onMakePrimary: () => void;
  onVerify: () => void;
}) {
  const masked = "XXXX " + acc.account_number.slice(-4);
  return (
    <View className="rounded-2xl border border-primary-100 bg-white p-4">
      <View className="mb-2 flex-row items-center gap-2">
        {acc.is_primary ? (
          <View className="self-start rounded-full bg-primary-100 px-2.5 py-0.5">
            <Text className="text-[10px] font-bold text-primary">Primary</Text>
          </View>
        ) : null}
        {acc.verified ? (
          <View className="flex-row items-center gap-1 self-start rounded-full bg-green-50 px-2.5 py-0.5">
            <Ionicons name="shield-checkmark" size={11} color={colors.success} />
            <Text className="text-[10px] font-bold text-success">Verified</Text>
          </View>
        ) : (
          <View className="self-start rounded-full bg-amber-50 px-2.5 py-0.5">
            <Text className="text-[10px] font-bold text-amber-700">Not verified</Text>
          </View>
        )}
      </View>
      <View className="flex-row items-center gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-full bg-primary-50">
          <Ionicons name="business-outline" size={20} color={colors.primary} />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-bold text-ink">{acc.bank_name}</Text>
          <Text className="text-xs text-ink-muted">{masked}</Text>
          {acc.verified && acc.verified_name ? (
            <Text className="text-xs text-ink-soft">{acc.verified_name}</Text>
          ) : null}
        </View>
        {acc.is_primary ? (
          <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
        ) : (
          <Pressable onPress={onMakePrimary} hitSlop={8} className="rounded-full border border-primary-200 px-3 py-1.5">
            <Text className="text-xs font-semibold text-primary">Set primary</Text>
          </Pressable>
        )}
      </View>
      {!acc.verified ? (
        <Pressable
          onPress={onVerify}
          disabled={verifying}
          className="mt-3 items-center rounded-xl border border-primary-200 py-2"
        >
          <Text className="text-xs font-semibold text-primary">{verifying ? "Verifying…" : "Verify account"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
