import { Image } from "react-native";

interface CampaignImageProps {
  uri?: string | null;
  className?: string;
  resizeMode?: "cover" | "contain" | "center" | "stretch";
  iconSize?: number;
}

/**
 * Renders a campaign's image, or nothing at all when none is set.
 * Replaces the old `picsum.photos` fallback, which fetched a *random* photo
 * each time and made image-less campaigns look like they had a real (wrong)
 * picture. `iconSize` is accepted for call-site compatibility but unused.
 */
export function CampaignImage({ uri, className, resizeMode = "cover" }: CampaignImageProps) {
  if (!uri) return null;
  return <Image source={{ uri }} className={className} resizeMode={resizeMode} />;
}
