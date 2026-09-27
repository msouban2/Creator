/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#E36E86",
          50: "#FCF1F3",
          100: "#FADFE5",
          200: "#F5C9D2",
          300: "#F6B6C1",
          400: "#EC9AAB",
          500: "#E36E86",
          600: "#D0546E",
          700: "#B23F5A",
        },
        ink: {
          DEFAULT: "#0D0D0D",
          soft: "#4B4B4B",
          muted: "#8A8A8A",
        },
        blush: {
          DEFAULT: "#F6B6C1",
          soft: "#FBD3DA",
          tint: "#FDEBEE",
        },
        canvas: "#FFF6F7",
        card: "#FFFFFF",
        success: "#1BA672",
        warning: "#E4870B",
        info: "#5B6EF5",
      },
      borderRadius: {
        xl: "18px",
        "2xl": "24px",
        "3xl": "28px",
      },
      fontFamily: {
        sans: ["System"],
      },
    },
  },
  plugins: [],
};
