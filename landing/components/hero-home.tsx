import LiveChrono from "@/components/live-chrono";
import { APP_URL } from "@/components/config";

const line = "[border-image:linear-gradient(to_right,transparent,var(--color-line),transparent)1]";

export default function HeroHome() {
  return (
    <section className="relative">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Hero content */}
        <div className="pt-32 pb-12 md:pt-40 md:pb-20">
          {/* Section header */}
          <div className="pb-12 text-center md:pb-16">
            <div className={`mb-6 border-y py-3 ${line}`} data-aos="zoom-y-out">
              <span className="text-xs font-bold tracking-[0.16em] text-muted uppercase">
                Le chrono des coachs de canoë-kayak
              </span>
            </div>
            <h1
              className={`mb-6 border-y text-6xl leading-[0.9] font-black tracking-[-0.045em] md:text-8xl ${line}`}
              data-aos="zoom-y-out"
              data-aos-delay={150}
            >
              Un tap. Un temps.
            </h1>
            <div className="mx-auto max-w-3xl">
              <p className="mb-8 text-lg text-muted md:text-xl" data-aos="zoom-y-out" data-aos-delay={300}>
                Une seule main, lisible en plein soleil, précis au centième.
                Tous tes athlètes dans un seul écran.
              </p>
              <div className={`relative before:absolute before:inset-0 before:border-y before:[border-image:linear-gradient(to_right,transparent,var(--color-line),transparent)1]`}>
                <div
                  className="mx-auto max-w-xs sm:flex sm:max-w-none sm:justify-center"
                  data-aos="zoom-y-out"
                  data-aos-delay={450}
                >
                  <a className="btn group mb-4 w-full bg-ink text-ground hover:bg-ink/90 sm:mb-0 sm:w-auto" href={APP_URL}>
                    <span className="relative inline-flex items-center">
                      Installer l'app{" "}
                      <span className="ml-2 tracking-normal transition-transform group-hover:translate-x-0.5">-&gt;</span>
                    </span>
                  </a>
                  <a className="btn w-full border-2 border-ink text-ink hover:bg-ink hover:text-ground sm:ml-4 sm:w-auto" href="#course">
                    Voir une course
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Le chrono en direct */}
          <div className="mx-auto max-w-3xl" data-aos="zoom-y-out" data-aos-delay={600}>
            <LiveChrono />
          </div>
        </div>
      </div>
    </section>
  );
}
