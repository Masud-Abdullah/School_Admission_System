import React, { useState } from 'react';
import { validateClassInput, type ClassSummaryDto } from '../utils/admissionLogic';

interface AdminClassCreateSectionProps {
  classes: ClassSummaryDto[];
  creating: boolean;
  onCreateClass: (name: string, totalSeats: number) => Promise<boolean>;
}

export const AdminClassCreateSection: React.FC<AdminClassCreateSectionProps> = ({
  classes,
  creating,
  onCreateClass,
}) => {
  const [name, setName] = useState<string>('');
  const [totalSeatsText, setTotalSeatsText] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const parsedSeats = Number(totalSeatsText);
    const val = validateClassInput(name, parsedSeats);
    if (!val.valid) {
      setFormError(val.error!);
      return;
    }

    const ok = await onCreateClass(val.normalizedName || name.trim(), parsedSeats);
    if (ok) {
      setName('');
      setTotalSeatsText('');
    }
  };

  const safeClasses = Array.isArray(classes) ? classes : [];
  const totalConfirmedAll = safeClasses.reduce((sum, c) => sum + c.confirmedSeats, 0);
  const totalHeldAll = safeClasses.reduce((sum, c) => sum + c.heldSeats, 0);

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Class তৈরি (School Admin)</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            প্রতিটি ক্লাসের প্রতিটি শিফট আলাদা ক্লাস হিসেবে যুক্ত করুন এবং আসন সংখ্যা পর্যবেক্ষণ করুন।
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-600 font-medium">
          <span>
            মোট ক্লাস: <strong className="font-mono text-slate-900">{safeClasses.length}</strong>
          </span>
          <span>
            চলমান Hold: <strong className="font-mono text-amber-700">{totalHeldAll}</strong>
          </span>
          <span>
            মোট নিশ্চিত ভর্তি: <strong className="font-mono text-emerald-700">{totalConfirmedAll}</strong>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-6">
          <h2 className="text-base font-bold text-slate-900 mb-4">
            নতুন Class যোগ করুন
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="class-name-input"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Class ও Shift-এর নাম
              </label>
              <input
                id="class-name-input"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setFormError(null);
                }}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15 focus:border-slate-900"
              />
              <p className="text-xs text-slate-500 mt-1">
                অনুমোদিত ফরম্যাট: <span className="font-mono text-slate-600">Class [1–12] - [Morning/Day] Shift</span>
              </p>
            </div>

            <div>
              <label
                htmlFor="class-seats-input"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                মোট আসন সংখ্যা
              </label>
              <input
                id="class-seats-input"
                type="number"
                min={1}
                max={100000}
                value={totalSeatsText}
                onChange={(e) => {
                  setTotalSeatsText(e.target.value);
                  setFormError(null);
                }}
                className="w-full px-3.5 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15 focus:border-slate-900"
              />
              <p className="text-xs text-slate-500 mt-1">
                ধনাত্মক পূর্ণসংখ্যা
              </p>
            </div>

            {formError && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium"
              >
                {formError}
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={creating}
                className={`px-5 py-2.5 text-xs font-semibold rounded-lg text-white transition-colors whitespace-nowrap shrink-0 ${
                  creating
                    ? 'bg-slate-600 cursor-wait'
                    : 'bg-slate-900 hover:bg-slate-800'
                }`}
              >
                {creating ? 'তৈরি হচ্ছে...' : 'Class তৈরি করুন'}
              </button>
            </div>
          </form>
        </div>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-base font-bold text-slate-900">
              সকল Class ও ভর্তির বর্তমান অবস্থা
            </h2>
          </div>
          {safeClasses.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              এখনও কোনো ক্লাস তৈরি করা হয়নি।
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Class-এর নাম</th>
                    <th className="py-3 px-3 text-right">মোট আসন</th>
                    <th className="py-3 px-3 text-right">Hold</th>
                    <th className="py-3 px-3 text-right">নিশ্চিত</th>
                    <th className="py-3 px-4 text-right">খালি</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {safeClasses.map((cls) => (
                    <tr key={cls.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {cls.name}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                        {cls.totalSeats}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-amber-700 font-semibold">
                        {cls.heldSeats}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-700 font-semibold">
                        {cls.confirmedSeats}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-900">
                        {cls.availableSeats}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
