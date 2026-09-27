import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/auth";
import type { BankAccount } from "../lib/types";

export function useBankAccounts() {
  const userId = useAuthStore((s) => s.session?.user?.id);
  return useQuery({
    queryKey: ["bank_accounts", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("*")
        .eq("user_id", userId as string)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BankAccount[];
    },
  });
}

export interface NewBankAccount {
  account_holder_name: string;
  bank_name: string;
  account_number: string;
  ifsc_code: string;
  is_primary: boolean;
}

export function useAddBankAccount() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user?.id);
  return useMutation({
    mutationFn: async (input: NewBankAccount) => {
      // If this is the user's first account, force it primary.
      const { count } = await supabase
        .from("bank_accounts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId as string);
      const makePrimary = input.is_primary || (count ?? 0) === 0;

      // Clear any existing primary first to satisfy the one-primary index.
      if (makePrimary) {
        await supabase
          .from("bank_accounts")
          .update({ is_primary: false })
          .eq("user_id", userId as string)
          .eq("is_primary", true);
      }

      const { data, error } = await supabase
        .from("bank_accounts")
        .insert({
          user_id: userId,
          account_holder_name: input.account_holder_name,
          bank_name: input.bank_name,
          account_number: input.account_number,
          ifsc_code: input.ifsc_code.toUpperCase(),
          is_primary: makePrimary,
        })
        .select()
        .single();
      if (error) throw error;
      return data as BankAccount;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank_accounts"] });
    },
  });
}

export function useSetPrimaryBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (accountId: string) => {
      const { error } = await supabase.rpc("set_primary_bank_account", { p_account: accountId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank_accounts"] });
    },
  });
}

export function useDeleteBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (accountId: string) => {
      const { error } = await supabase.from("bank_accounts").delete().eq("id", accountId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank_accounts"] });
    },
  });
}
