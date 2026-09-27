// Brand typography: DM Sans for body, Poppins for headings — applied globally.
//
// We load the needed weights and patch React Native's <Text> so the correct
// font family is chosen from each element's fontWeight. This gives the whole
// app the brand type system without editing every screen:
//   • 600      -> Poppins SemiBold        (headings)
//   • 700/800/900/"bold" -> Poppins Bold  (headings/emphasis)
//   • 500      -> DM Sans Medium           (body strong)
//   • else     -> DM Sans Regular          (body)
import { Text as RNText, StyleSheet } from "react-native";
import {
  useFonts,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import { DMSans_400Regular, DMSans_500Medium } from "@expo-google-fonts/dm-sans";

function familyForWeight(weight: string | number | undefined): string {
  const w = String(weight ?? "400");
  if (w === "600") return "Poppins_600SemiBold";
  if (w === "700" || w === "800" || w === "900" || w === "bold") return "Poppins_700Bold";
  if (w === "500") return "DMSans_500Medium";
  return "DMSans_400Regular";
}

let patched = false;
function patchTextFont() {
  if (patched) return;
  patched = true;
  const proto = RNText as unknown as { render?: (...args: unknown[]) => any };
  const original = proto.render;
  if (typeof original !== "function") return;
  proto.render = function patchedRender(...args: unknown[]) {
    const el = original.apply(this, args);
    if (!el) return el;
    const flat = (StyleSheet.flatten(el.props?.style) ?? {}) as { fontFamily?: string; fontWeight?: string | number };
    if (flat.fontFamily) return el; // respect explicitly-set fonts
    const fontFamily = familyForWeight(flat.fontWeight);
    return {
      ...el,
      props: {
        ...el.props,
        // font family first, then original styles, then force family so weight
        // never causes RN to fall back to a synthesized/incorrect face.
        style: [{ fontFamily }, el.props?.style, { fontFamily }],
      },
    };
  };
}

// Load fonts + apply the global patch. Returns true once fonts are ready.
export function useAppFonts(): boolean {
  const [loaded] = useFonts({
    Poppins_600SemiBold,
    Poppins_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
  });
  if (loaded) patchTextFont();
  return loaded;
}
