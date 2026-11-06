// Reprend la section "planète" du template : un objet central qui respire,
// des étiquettes qui flottent autour, puis trois arguments en grille.

const tags = [
  { text: "Lucas — DÉPART ✓", pos: "-left-28 top-10", delay: "0s", op: "opacity-90" },
  { text: "01:01.89", pos: "left-56 -top-2", delay: "1s", op: "opacity-50" },
  { text: "+0:00.32", pos: "-left-16 bottom-20", delay: "2s", op: "opacity-40" },
  { text: "Emma — ARRIVÉE ✓", pos: "left-64 bottom-6", delay: "3s", op: "opacity-70" },
];

const features = [
  {
    k: ".00",
    title: "Précis au centième",
    text: "Le temps est pris quand le doigt touche l'écran, pas quand il se relève.",
  },
  {
    k: "1",
    title: "Une seule main",
    text: "Toutes les actions sont sous le pouce. L'autre main reste libre.",
  },
  {
    k: "0 G",
    title: "Même sans réseau",
    text: "En rivière ou au fond du bassin, la séance continue et reste sur le téléphone.",
  },
];

export default function FeaturesTap() {
  return (
    <section className="relative border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="py-16 md:py-24">
          {/* Section header */}
          <div className="mx-auto max-w-3xl pb-16 text-center md:pb-20">
            <h2 className="text-5xl leading-[0.95] font-black tracking-[-0.03em] md:text-6xl">
              TAP, puis qui ?
            </h2>
            <p className="mt-4 text-lg text-muted">
              Un tap capture l'heure. Tu choisis l'athlète après, sans stress.
            </p>
          </div>

          {/* Le TAP qui respire */}
          <div className="pb-16 md:pb-20" data-aos="zoom-y-out">
            <div className="text-center">
              <div className="relative inline-flex">
                <div className="flex h-72 w-72 animate-[breath_6s_ease-in-out_infinite] items-center justify-center rounded-full border border-line md:h-80 md:w-80">
                  <div className="flex h-60 w-60 items-center justify-center rounded-full border-4 border-ink bg-ink text-6xl font-black text-ground md:h-64 md:w-64">
                    TAP
                  </div>
                </div>
                <div className="pointer-events-none max-md:hidden" aria-hidden="true">
                  {tags.map((t) => (
                    <span
                      key={t.text}
                      className={`absolute z-10 ${t.pos} ${t.op} animate-[float_4s_ease-in-out_infinite_both] rounded-xl border border-line bg-ground px-4 py-3 font-mono text-sm font-bold whitespace-nowrap text-ink`}
                      style={{ animationDelay: t.delay }}
                    >
                      {t.text}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Grille */}
          <div className="grid overflow-hidden border-y border-line sm:grid-cols-3 [&>*]:relative [&>*]:p-6 md:[&>*]:p-10 [&>*]:before:absolute [&>*]:before:bg-line [&>*]:before:[block-size:100vh] [&>*]:before:[inline-size:1px] [&>*]:before:[inset-block-start:0] [&>*]:before:[inset-inline-start:-1px]">
            {features.map((f, i) => (
              <article key={f.title} data-aos="zoom-y-out" data-aos-delay={i * 120}>
                <span className="font-mono text-4xl font-extrabold tracking-[-0.03em]">{f.k}</span>
                <h3 className="mt-3 text-xl font-extrabold">{f.title}</h3>
                <p className="mt-2 text-base text-muted">{f.text}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
