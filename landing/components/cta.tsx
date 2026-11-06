import { APP_URL } from "@/components/config";

export default function Cta() {
  return (
    <section id="installer" className="py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-2xl bg-ink text-center text-ground" data-aos="zoom-y-out">
          {/* Anneau du cadran en filigrane */}
          <div
            className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2"
            aria-hidden="true"
          >
            <div className="h-[480px] w-[480px] animate-[breath_8s_ease-in-out_infinite] rounded-full border-[18px] border-ground/5" />
          </div>
          <div className="relative px-4 py-14 md:px-12 md:py-20">
            <h2 className="mb-6 text-4xl leading-[0.95] font-black tracking-[-0.03em] md:text-6xl">
              Prêt pour la prochaine séance ?
            </h2>
            <p className="mx-auto mb-10 max-w-xl text-base text-line md:text-lg">
              iPhone : Safari → Partager → Sur l'écran d'accueil
              <br />
              Android : Chrome → ⋮ → Installer l'application
            </p>
            <a className="btn group bg-ground text-ink hover:bg-ground/90" href={APP_URL}>
              <span className="relative inline-flex items-center">
                Ouvrir l'app{" "}
                <span className="ml-2 tracking-normal transition-transform group-hover:translate-x-0.5">-&gt;</span>
              </span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
