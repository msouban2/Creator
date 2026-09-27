import { useState } from "react";
import { Pressable, Text, TextInput, View, type TextInputProps } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../lib/theme";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  secure?: boolean;
}

export function Input({ label, error, icon, secure, multiline, style, ...props }: InputProps) {
  const [hidden, setHidden] = useState(!!secure);
  return (
    <View className="gap-2">
      {label ? <Text className="text-sm font-semibold text-ink">{label}</Text> : null}
      <View
        className={`flex-row rounded-2xl border bg-white px-4 ${
          multiline ? "items-start py-3" : "h-14 items-center"
        } ${error ? "border-primary" : "border-primary-100"}`}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={20}
            color={colors.primary}
            style={{ marginRight: 10, marginTop: multiline ? 2 : 0 }}
          />
        ) : null}
        <TextInput
          className="flex-1 text-base text-ink"
          placeholderTextColor={colors.inkMuted}
          secureTextEntry={hidden}
          multiline={multiline}
          style={[multiline ? { minHeight: 96, textAlignVertical: "top" } : null, style]}
          {...props}
        />
        {secure ? (
          <Pressable onPress={() => setHidden((v) => !v)} hitSlop={10}>
            <Ionicons
              name={hidden ? "eye-outline" : "eye-off-outline"}
              size={20}
              color={colors.inkMuted}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text className="text-xs text-primary">{error}</Text> : null}
    </View>
  );
}
