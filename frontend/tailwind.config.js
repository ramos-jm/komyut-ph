export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Plus Jakarta Sans", "ui-sans-serif", "sans-serif"],
        display: ["Space Grotesk", "ui-sans-serif", "sans-serif"]
      },
      colors: {
        ink: "#0f172a",
        sea: "#0ea5e9",
        sun: "#f59e0b",
        rice: "#f8fafc",
        leaf: "#16a34a"
      },
      boxShadow: {
        card: "0 24px 48px rgba(15, 23, 42, 0.10)",
        "route-active": "0 22px 48px rgba(6, 182, 212, 0.24)"
      }
    }
  },
  plugins: []
};
