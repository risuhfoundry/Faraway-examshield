import { Navbar } from "@/components/layout/Navbar";
import { Hero } from "@/components/sections/Hero";

export default function Home() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <Hero />
      {/* We can add more sections like Features, Security Architecture later if time permits.
          Focusing heavily on dashboard right now. */}
    </main>
  );
}
