// components/flow/SplashScreen.js — full-screen brand loader (the app's
// AuthLoadingScreen / SplashScreen role).
import Image from "next/image";
import Spinner from "@/components/ui/Spinner";

export default function SplashScreen({ children }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-4">
      <div className="flex items-center gap-2.5">
        <Image src="/logo.png" alt="" width={36} height={36} priority />
        <span className="text-[26px] font-black tracking-[3px] text-primary">SYSFI</span>
      </div>
      {children ?? <Spinner size={24} />}
    </div>
  );
}
