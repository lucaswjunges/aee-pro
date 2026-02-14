import { Outlet } from "react-router-dom";
import { Header } from "./header";

export function RootLayout() {
  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-6 max-w-5xl w-full">
        <Outlet />
      </main>
    </div>
  );
}
