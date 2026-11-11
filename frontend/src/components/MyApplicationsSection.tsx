import React, { useEffect, useState } from 'react';
import {
  formatRemainingTime,
  type HoldStatus,
  type StudentHoldDto,
} from '../utils/admissionLogic';

interface MyApplicationsSectionProps {
  holds: StudentHoldDto[];
  studentId: string;
  studentIdValid: boolean;
  onSelectHold: (holdId: string) => void;
  onOpenClassList: () => void;
}

export const MyApplicationsSection: React.FC<MyApplicationsSectionProps> = ({
  holds,
  studentId,
  studentIdValid,
  onSelectHold,
  onOpenClassList,
}) => {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!studentIdValid) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-10 text-center space-y-3">
        <h2 className="text-lg font-bold text-slate-900">
          জন্ম নিবন্ধন নম্বর প্রয়োজন
        </h2>
        <p className="text-sm text-slate-600 max-w-md mx-auto">
          আপনার আবেদনগুলো দেখতে উপরে ১৭ সংখ্যার সঠিক জন্ম নিবন্ধন নম্বর লিখুন।
        </p>
      </div>
    );
  }

  const safeHolds = Array.isArray(holds) ? holds : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900">আমার আবেদন</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            জন্ম নিবন্ধন নম্বর: <span className="font-mono font-semibold text-slate-900">{studentId}</span>
          </p>
        </div>
      </div>

      {safeHolds.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-10 text-center space-y-3">
          <p className="text-base font-semibold text-slate-900">
            কোনো আবেদন পাওয়া যায়নি
          </p>
          <button
            type="button"
            onClick={onOpenClassList}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            Class তালিকা দেখুন
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                  <th className="py-3.5 px-5">Hold ID</th>
                  <th className="py-3.5 px-4">Class-এর নাম</th>
                  <th className="py-3.5 px-4">অবস্থা</th>
                  <th className="py-3.5 px-4 text-right">বাকি সময়</th>
                  <th className="py-3.5 px-5 text-right">পদক্ষেপ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {safeHolds.map((h) => {
                  const countdown = formatRemainingTime(h.expiresAt, nowMs);
                  const effectiveStatus: HoldStatus =
                    h.status === 'HELD' && countdown.isExpired ? 'EXPIRED' : h.status;
                  const isHeld = effectiveStatus === 'HELD';

                  return (
                    <tr key={h.holdId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-4 px-5 font-mono tabular-nums font-semibold text-slate-900">
                        {h.holdId}
                      </td>
                      <td className="py-4 px-4">
                        <div className="font-semibold text-slate-900">{h.className}</div>
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={`font-mono text-xs font-bold ${
                            effectiveStatus === 'CONFIRMED'
                              ? 'text-emerald-700'
                              : effectiveStatus === 'HELD'
                              ? 'text-amber-700'
                              : effectiveStatus === 'EXPIRED'
                              ? 'text-red-600'
                              : 'text-slate-500'
                          }`}
                        >
                          {effectiveStatus}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right font-mono tabular-nums text-slate-700">
                        {isHeld ? countdown.formatted : '—'}
                      </td>
                      <td className="py-4 px-5 text-right">
                        <button
                          type="button"
                          onClick={() => onSelectHold(h.holdId)}
                          className="px-4 py-2 text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
                        >
                          বিস্তারিত
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
