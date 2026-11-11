import React from 'react';
import { validateStudentId } from '../utils/admissionLogic';

interface StudentIdentityBarProps {
  studentId: string;
  onChangeStudentId: (newId: string) => void;
  activeHoldCount: number;
  confirmedCount: number;
}

export const StudentIdentityBar: React.FC<StudentIdentityBarProps> = ({
  studentId,
  onChangeStudentId,
  activeHoldCount,
  confirmedCount,
}) => {
  const validation = validateStudentId(studentId);
  const digitsCount = studentId.trim().length;

  return (
    <section
      aria-label="Student Identification"
      className="bg-white border-b border-slate-200 px-6 py-4"
    >
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex-1 max-w-xl">
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="student-birth-reg-input"
              className="text-sm font-semibold text-slate-900"
            >
              শিক্ষার্থীর জন্ম নিবন্ধন নম্বর
            </label>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {digitsCount}/17
            </span>
          </div>

          <input
            id="student-birth-reg-input"
            type="text"
            inputMode="numeric"
            maxLength={17}
            value={studentId}
            onChange={(e) => onChangeStudentId(e.target.value.replace(/\s+/g, ''))}
            className={`w-full px-3.5 py-2 text-sm font-mono tabular-nums rounded-lg border transition-colors focus:outline-none focus:ring-2 ${
              studentId.trim() === '' || validation.valid
                ? 'border-slate-300 bg-white text-slate-900 focus:ring-slate-900/15 focus:border-slate-900'
                : 'border-red-300 bg-red-50/30 text-red-900 focus:ring-red-500/20 focus:border-red-500'
            }`}
          />

          {!validation.valid && studentId.trim() !== '' ? (
            <p role="alert" className="mt-1.5 text-xs text-red-600 font-medium">
              {validation.error}
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-slate-500">
              ১৭ অঙ্কের ইংরেজি সংখ্যা
            </p>
          )}
        </div>

        <div className="flex items-center gap-6 text-xs text-slate-600 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
          <div className="tabular-nums">
            <span className="text-slate-500">চলমান আবেদন: </span>
            <span className="font-mono font-semibold text-slate-900">{activeHoldCount}</span>
          </div>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <div className="tabular-nums">
            <span className="text-slate-500">নিশ্চিত ভর্তি: </span>
            <span className="font-mono font-semibold text-emerald-700">{confirmedCount}</span>
          </div>
        </div>
      </div>
    </section>
  );
};
