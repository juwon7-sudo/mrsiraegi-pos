import "./globals.css";
import PwaRegister from "@/components/PwaRegister";

export const metadata = {
  title: "미스터시래기 롯데몰 수원점 주문",
  description: "미스터시래기 매장 주문 POS",
  manifest: "/manifest.webmanifest",
  applicationName: "미스터시래기",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "미스터시래기" },
  icons: {
    icon: [{ url: "/app-icon.png", type: "image/png", sizes: "512x512" }],
    apple: [{ url: "/app-icon.png" }],
  },
};

export const viewport = {
  themeColor: "#1A1A1A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
