/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#F5385D",
          50: "#FFF1F3",
          100: "#FDE7EB",
          200: "#FBCFD8",
          500: "#F5385D",
          600: "#D92548",
        },
        ink: "#141414",
      },
      borderRadius: {
        xl: "0.9rem",
        "2xl": "1.25rem",
      },
    },
  },
  plugins: [],
};
