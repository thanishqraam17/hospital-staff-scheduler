import "@fontsource-variable/dm-sans";
import "./globals.css";

export const metadata = {
  title: "Hospital Staff Scheduling & Burnout Risk Detector",
  description: "Hospital staff scheduling and burnout risk detection (DBMS mini project)",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
