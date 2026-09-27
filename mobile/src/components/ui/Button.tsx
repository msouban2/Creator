import { forwardRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type PressableProps,
} from "react-native";

type Variant = "primary" | "dark" | "outline" | "soft" | "ghost";

interface ButtonProps extends PressableProps {
  label: string;
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
  rightIcon?: React.ReactNode;
  leftIcon?: React.ReactNode;
}

const container: Record<Variant, string> = {
  primary: "bg-ink",
  dark: "bg-ink",
  outline: "bg-white border border-ink",
  soft: "bg-primary-100",
  ghost: "bg-transparent",
};

const text: Record<Variant, string> = {
  primary: "text-white",
  dark: "text-white",
  outline: "text-ink",
  soft: "text-primary",
  ghost: "text-primary",
};

export const Button = forwardRef<View, ButtonProps>(function Button(
  { label, variant = "primary", loading, fullWidth, rightIcon, leftIcon, disabled, ...props },
  ref
) {
  return (
    <Pressable
      ref={ref}
      disabled={disabled || loading}
      className={`h-14 flex-row items-center justify-center gap-2 rounded-2xl px-5 active:opacity-90 ${
        container[variant]
      } ${fullWidth ? "w-full" : ""} ${disabled ? "opacity-50" : ""}`}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" || variant === "dark" ? "#fff" : "#E36E86"} />
      ) : (
        <>
          {leftIcon}
          <Text className={`text-base font-semibold ${text[variant]}`}>{label}</Text>
          {rightIcon}
        </>
      )}
    </Pressable>
  );
});
