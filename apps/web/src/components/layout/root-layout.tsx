import { Outlet } from "react-router-dom";
import { Header } from "./header";

export function RootLayout() {
  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-6 max-w-5xl w-full pt-[calc(3.5rem+1.5rem)]">
        <Outlet />
      </main>
      <footer className="border-t py-4 text-center text-xs text-muted-foreground print:hidden">
        Desenvolvido por{" "}
        <a
          href="https://www.blumenauti.com.br"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline font-medium"
        >
          Blumenau TI
        </a>
      </footer>
    </div>
  );
}
