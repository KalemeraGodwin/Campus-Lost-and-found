import { Link } from 'react-router-dom';
import { FileCheck2, Lock, MapPin, MessageCircle, ShieldCheck } from 'lucide-react';

export function AboutSafetyPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="space-y-2">
        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">How CampusTrace Works</p>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
          Ownership Before Contact &amp; Campus Handover Safety
        </h1>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
          CampusTrace protects both finders and owners by keeping WhatsApp numbers completely private until ownership is proven through a 3-layer verification process.
        </p>
      </div>

      {/* 3-Layer Verification Workflow */}
      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
          01. Three-Layer Verification Workflow
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-2">
            <Lock className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              1. Private Questions
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Reporters set specific questions about hidden details (such as lockscreen wallpapers, stickers, or pouch contents). Expected answers are never visible to the public.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-2">
            <FileCheck2 className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              2. Evidence Check
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Claimants answer every question and upload proof such as a purchase receipt, IMEI/serial screenshot, photo with the item, or a redacted student ID.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-2">
            <MessageCircle className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              3. Approved Handover
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Only one claim can be approved at a time. Approving a claim unlocks the reporter&apos;s WhatsApp link strictly for that verified claimant using their Claim Code.
            </p>
          </div>
        </div>
      </section>

      {/* Handover Safety Rules */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-7 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
            02. Campus Handover Safety Guidelines
          </h2>
        </div>

        <ul className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <li className="flex items-start gap-2.5">
            <MapPin className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-1" />
            <span>
              <strong className="text-slate-900 dark:text-slate-100">Meet in busy daylight spots:</strong> Always arrange handovers at the Campus Main Security Office, Main Library Front Desk, or Faculty Reception during daytime hours.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-1" />
            <span>
              <strong className="text-slate-900 dark:text-slate-100">Bring your Student ID:</strong> Present your valid University Student ID or National ID at handover so both parties can verify identity in person.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-1" />
            <span>
              <strong className="text-slate-900 dark:text-slate-100">Redact sensitive numbers on uploads:</strong> When uploading an ID card photo as claim evidence, blur or cover your national ID number or student registration digits. Evidence files on closed notices are purged after 30 days.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <FileCheck2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-1" />
            <span>
              <strong className="text-slate-900 dark:text-slate-100">Zero payment or ransom policy:</strong> Never send mobile money or transport fees before inspecting your item in person. Report any extortion attempts immediately using the Report button.
            </span>
          </li>
        </ul>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/"
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-700 dark:bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-800 dark:hover:bg-emerald-500 inline-flex items-center"
        >
          Browse Active Notices
        </Link>
        <Link
          to="/report"
          className="min-h-[44px] px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center"
        >
          Report an Item
        </Link>
        <Link
          to="/admin"
          className="min-h-[44px] px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center"
        >
          Admin Console
        </Link>
      </div>
    </div>
  );
}
