import { Image, Text, View } from "react-native";
import { initials } from "../lib/format";

export function Avatar({
  uri,
  name,
  size = 56,
}: {
  uri?: string | null;
  name?: string | null;
  size?: number;
}) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }
  return (
    <View
      className="items-center justify-center rounded-full bg-primary-100"
      style={{ width: size, height: size }}
    >
      <Text className="font-bold text-primary" style={{ fontSize: size * 0.36 }}>
        {initials(name)}
      </Text>
    </View>
  );
}
