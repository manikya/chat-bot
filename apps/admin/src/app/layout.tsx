import type { Metadata } from "next";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth/context";
import "./globals.css";

export const metadata: Metadata = {
  title: "CommerceChat Admin",
  description: "AI e-commerce chatbot for WhatsApp and web",
  icons: {
    icon: "/commercechat-logo.svg",
    shortcut: "/commercechat-logo.svg",
    apple: "/commercechat-logo.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AuthProvider>
          {children}
          <Toaster position="top-right" />
        </AuthProvider>
      </body>
    </html>
  );
}
