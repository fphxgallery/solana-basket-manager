/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ["var(--font-mono)"],
      },
      colors: {
        card: "var(--card-bg)",
        cardline: "var(--card-line)",
        divider: "var(--divider)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        dim: "var(--dim)",
        cyan: {
          DEFAULT: "var(--cyan)",
          deep: "var(--cyan-deep)",
          bg: "var(--cyan-bg)",
          line: "var(--cyan-line)",
        },
        good: "var(--good)",
        bad: "var(--bad)",
        warn: "var(--warn)",
      },
      borderRadius: {
        card: "11px",
      },
    },
  },
  plugins: [],
};
