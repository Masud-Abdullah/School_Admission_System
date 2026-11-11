import React from 'react';
import type { ClassSummaryDto, StudentHoldDto } from '../utils/admissionLogic';

interface ClassListSectionProps {
  classes: ClassSummaryDto[];
  myHolds: StudentHoldDto[];
  loading: boolean;
  applyingClassId: string | null;
  onApply: (classId: string) => void;
  onSelectHold: (holdId: string) => void;
}

export const ClassListSection: React.FC<ClassListSectionProps> = ({
  classes,
  myHolds,
  loading,
  applyingClassId,
  onApply,
  onSelectHold,
}) => {
  const safeClasses = Array.isArray(classes) ? classes : [];
  const safeHolds = Array.isArray(myHolds) ? myHolds : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Class তালিকা</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            সকল ক্লাসের মোট আসন এবং বর্তমান খালি আসনের তালিকা।
          </p>
        </div>
      </div>

      {loading && safeClasses.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-sm text-slate-500">
          লোড হচ্ছে...
        </div>
      ) : safeClasses.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-10 text-center space-y-2">
          <p className="text-base font-semibold text-slate-900">
            বর্তমানে ভর্তির জন্য কোনো ক্লাস খোলা নেই
          </p>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            স্কুল কর্তৃপক্ষ (School Admin) ক্লাস ও আসন সংখ্যা যুক্ত করলে এখানে তালিকা দেখা যাবে।
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                  <th className="py-3.5 px-5">Class-এর নাম</th>
                  <th className="py-3.5 px-4 text-right">মোট আসন</th>
                  <th className="py-3.5 px-4 text-right">Hold আসন</th>
                  <th className="py-3.5 px-4 text-right">নিশ্চিত আসন</th>
                  <th className="py-3.5 px-4 text-right">খালি আসন</th>
                  <th className="py-3.5 px-5 text-center w-48">আবেদন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {safeClasses.map((cls) => {
                  const myActiveRecord = safeHolds.find(
                    (h) =>
                      h.classId === cls.id &&
                      (h.status === 'HELD' || h.status === 'CONFIRMED')
                  );
                  const isApplying = applyingClassId === cls.id;
                  const noSeats = cls.availableSeats <= 0;

                  return (
                    <tr
                      key={cls.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-4 px-5">
                        <div className="font-semibold text-slate-900">{cls.name}</div>
                      </td>

                      <td className="py-4 px-4 text-right font-mono tabular-nums text-slate-700 font-medium">
                        {cls.totalSeats}
                      </td>

                      <td className="py-4 px-4 text-right font-mono tabular-nums text-amber-700 font-medium">
                        {cls.heldSeats}
                      </td>

                      <td className="py-4 px-4 text-right font-mono tabular-nums text-emerald-700 font-medium">
                        {cls.confirmedSeats}
                      </td>

                      <td className="py-4 px-4 text-right font-mono tabular-nums">
                        <span
                          className={`font-bold ${
                            noSeats ? 'text-red-600' : 'text-slate-900'
                          }`}
                        >
                          {cls.availableSeats}
                        </span>
                      </td>

                      <td className="py-4 px-5 text-center">
                        {myActiveRecord ? (
                          <button
                            type="button"
                            onClick={() => onSelectHold(myActiveRecord.holdId)}
                            className={`w-40 px-4 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 inline-flex items-center justify-center gap-1.5 ${
                              myActiveRecord.status === 'CONFIRMED'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                            }`}
                          >
                            <span className="font-mono font-bold">
                              {myActiveRecord.status === 'CONFIRMED' ? 'CONFIRMED' : 'HELD'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>বিস্তারিত</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isApplying || noSeats}
                            onClick={() => onApply(cls.id)}
                            className={`w-40 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 inline-flex items-center justify-center ${
                              noSeats
                                ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                                : 'bg-slate-900 text-white hover:bg-slate-800'
                            }`}
                          >
                            {noSeats ? 'আসন খালি নেই' : 'আবেদন করুন'}
                          </button>
                        )}
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
