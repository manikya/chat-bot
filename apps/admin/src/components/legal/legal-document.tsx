import Link from "next/link";

interface LegalDocumentProps {
  title: string;
  description: string;
  sections: Array<{ heading: string; body: string }>;
}

export function LegalDocument({ title, description, sections }: LegalDocumentProps) {
  return (
    <main className="min-h-screen bg-[#f6f7f9] px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <Link href="/" className="text-sm font-semibold text-teal-700 hover:underline">
          CommerceChat
        </Link>
        <div className="mt-8 border-b border-slate-200 pb-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Legal</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">{title}</h1>
          <p className="mt-4 text-base leading-7 text-slate-600">{description}</p>
          <p className="mt-4 text-sm text-slate-500">Last updated: June 22, 2026</p>
        </div>

        <div className="mt-8 space-y-8">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-xl font-bold text-slate-950">{section.heading}</h2>
              <p className="mt-3 whitespace-pre-line text-base leading-7 text-slate-700">{section.body}</p>
            </section>
          ))}
        </div>

        <div className="mt-10 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
          These pages provide product-facing terms for CommerceChat. They are not legal advice and should be reviewed
          before production use in regulated environments.
        </div>
      </div>
    </main>
  );
}
