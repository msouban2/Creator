import { View, type ViewProps } from "react-native";

interface CardProps extends ViewProps {
  padded?: boolean;
}

export function Card({ className = "", padded = true, style, ...props }: CardProps) {
  return (
    <View
      className={`rounded-2xl bg-white ${padded ? "p-4" : ""} ${className}`}
      style={[
        {
          shadowColor: "#E36E86",
          shadowOpacity: 0.08,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
          elevation: 2,
        },
        style,
      ]}
      {...props}
    />
  );
}
