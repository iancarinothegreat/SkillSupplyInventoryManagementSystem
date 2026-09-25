import "./globals.css";
import AppShell from "../components/AppShell";

export const metadata = {
  title: "MMTVTC",
  description: "Mandaluyong Manpower Technical-Vocational Training Center",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body suppressHydrationWarning className="min-h-full flex flex-col">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
