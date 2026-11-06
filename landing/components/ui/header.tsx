import Logo from "./logo";
import { APP_URL } from "@/components/config";

export default function Header() {
  return (
    <header className="fixed top-2 z-30 w-full md:top-6">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="relative flex h-16 items-center justify-between gap-3 rounded-2xl border border-line bg-ground/90 px-4 backdrop-blur-xs">
          {/* Marque */}
          <div className="flex flex-1 items-center">
            <Logo />
          </div>

          {/* Liens */}
          <ul className="flex flex-1 items-center justify-end gap-6">
            <li className="max-sm:hidden">
              <a href="#course" className="text-sm font-bold text-ink transition hover:text-muted">
                La course
              </a>
            </li>
            <li className="max-sm:hidden">
              <a href="#installer" className="text-sm font-bold text-ink transition hover:text-muted">
                Installer
              </a>
            </li>
            <li>
              <a href={APP_URL} className="btn-sm border-2 border-ink text-ink hover:bg-ink hover:text-ground">
                Ouvrir l'app
              </a>
            </li>
          </ul>
        </div>
      </div>
    </header>
  );
}
