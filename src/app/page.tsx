import Dashboard from "@/components/Dashboard";
import Header from "@/components/Header";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950">
      <Header />

      <main className="px-4 py-8 sm:px-6">
        <Dashboard />
      </main>
    </div>
  );
}
