import { ImageResponse } from "next/og";

// iOS home-screen icon (Safari does not use SVG touch icons).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0b0b0d",
      }}
    >
      <svg width="112" height="112" viewBox="0 0 64 64">
        <g fill="none" stroke="#f4f4f5" strokeWidth="3.5" strokeLinecap="round">
          <path d="M32 14a18 18 0 1 0 18 18" />
          <path d="M32 22a10 10 0 1 0 10 10" />
          <path d="M32 32 46 18" />
        </g>
        <circle cx="32" cy="32" r="3.5" fill="#f4f4f5" />
      </svg>
    </div>,
    size,
  );
}
