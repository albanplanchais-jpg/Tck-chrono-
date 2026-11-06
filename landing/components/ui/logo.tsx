import Link from "next/link";
import Image from "next/image";
import ClubLogo from "@/public/images/club-logo.png";

export default function Logo() {
  return (
    <Link href="/" className="inline-flex items-center gap-3" aria-label="Chrono — accueil">
      <Image src={ClubLogo} width={36} height={34} alt="" priority />
      <span className="text-xl font-black tracking-[-0.02em]">CHRONO</span>
    </Link>
  );
}
