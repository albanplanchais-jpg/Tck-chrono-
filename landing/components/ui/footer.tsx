import Logo from "./logo";

export default function Footer({ border = false }: { border?: boolean }) {
  return (
    <footer>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div
          className={`flex flex-wrap items-center justify-between gap-6 py-8 md:py-12 ${border ? "border-t border-line" : ""}`}
        >
          <div className="flex flex-col gap-2">
            <Logo />
            <span className="text-sm text-muted">Torcy Canoë-Kayak</span>
          </div>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold">
            <li>
              <a className="text-muted transition hover:text-ink" href="#0">
                Contact
              </a>
            </li>
            <li>
              <a className="text-muted transition hover:text-ink" href="#0">
                Mentions légales
              </a>
            </li>
            <li>
              <a className="text-muted transition hover:text-ink" href="#0">
                Confidentialité
              </a>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
