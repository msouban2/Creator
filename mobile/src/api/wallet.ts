import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/auth";
import type { Transaction, Wallet, Withdrawal, WithdrawalMethod } from "../lib/types";

export function useWallet() {
  const userId = useAuthStore((s) => s.session?.user?.id);
  return useQuery({
    queryKey: ["wallet", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", userId as string)
        .single();
      if (error) throw error;
      return data as Wallet;
    },
  });
}

export function useTransactions() {
  const userId = useAuthStore((s) => s.session?.user?.id);
  return useQuery({
    queryKey: ["transactions", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", userId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Transaction[];
    },
  });
}

export function useWithdrawals() {
  const userId = useAuthStore((s) => s.session?.user?.id);
  return useQuery({
    queryKey: ["withdrawals", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("withdrawals")
        .select("*")
        .eq("user_id", userId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Withdrawal[];
    },
  });
}

export interface WithdrawalInput {
  amount: number;
  method: WithdrawalMethod;
  upi?: string;
  bankAccount?: string;
  ifsc?: string;
  accountName?: string;
}

export function useRequestWithdrawal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: WithdrawalInput) => {
      const { error } = await supabase.rpc("request_withdrawal", {
        p_amount: input.amount,
        p_method: input.method,
        p_upi: input.upi ?? null,
        p_bank_account: input.bankAccount ?? null,
        p_ifsc: input.ifsc ?? null,
        p_account_name: input.accountName ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["withdrawals"] });
    },
  });
}
