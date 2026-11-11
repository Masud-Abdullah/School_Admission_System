import React, { useEffect, useState } from 'react';
import {
  formatRemainingTime,
  type ClassSummaryDto,
  type HoldStatus,
  type HoldStatusDto,
  type StudentHoldDto,
} from '../utils/admissionLogic';
import { admissionApi } from '../services/admissionApi';

interface ActiveHoldSectionProps {
  hold: StudentHoldDto | null;
  studentId: string;
  studentIdValid: boolean;
  confirming: boolean;
  cancelling: boolean;
  onConfirm: (holdId: string) => void;
  onCancel: (holdId: string) => void;
  onExpireDetected: () => void;
  onBackToClassList: () => void;
}

export const ActiveHoldSection: React.FC<ActiveHoldSectionProps> = ({
  hold,
  studentId,
  studentIdValid,
  confirming,
  cancelling,
  onConfirm,
  onCancel,
  onExpireDetected,
  onBackToClassList,
}) => {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [liveHoldDetail, setLiveHoldDetail] = useState<HoldStatusDto | null>(null);
  const [liveClassDetail, setLiveClassDetail] = useState<ClassSummaryDto | null>(null);

  useEffect(() => {
    setLiveHoldDetail(null);
    setLiveClassDetail(null);
    setNowMs(Date.now());

    if (!hold) {
      return;
    }

    let cancelled = false;
    const loadDetails = async () => {
      try {
        const [holdRes, classRes] = await Promise.all([
          admissionApi.getHoldById(hold.holdId),
          admissionApi.getClassById(hold.classId),
        ]);
        if (!cancelled) {
          setLiveHoldDetail(holdRes);
          setLiveClassDetail(classRes);
        }
      } catch {
        return;
      }
    };

    loadDetails();
    const poll = setInterval(loadDetails, 2500);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [hold?.holdId, hold?.classId, hold?.status]);

  const activeExpiresAt = liveHoldDetail?.expiresAt || hold?.expiresAt || '';
  const baseStatus: HoldStatus =
    hold && hold.status !== 'HELD'
      ? hold.status
      : liveHoldDetail?.status || hold?.status || 'HELD';

  useEffect(() => {
    if (!hold || baseStatus !== 'HELD') {
      return;
    }

    const timer = setInterval(() => {
      const current = Date.now();
      setNowMs(current);
      const expMs = new Date(activeExpiresAt).getTime();
      if (current >= expMs) {
        onExpireDetected();
      }
    }, 500);
    return () => clearInterval(timer);
  }, [hold, baseStatus, activeExpiresAt, onExpireDetected]);

  if (!studentIdValid) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-10 text-center space-y-3">
        <h2 className="text-lg font-bold text-slate-900">
          জন্ম নিবন্ধন নম্বর প্রয়োজন
        </h2>
        <p className="text-sm text-slate-600 max-w-md mx-auto">
          আপনার আবেদনের তথ্য দেখতে উপরে ১৭ সংখ্যার সঠিক জন্ম নিবন্ধন নম্বর লিখুন।
        </p>
      </div>
    );
  }

  if (!hold) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-10 text-center space-y-4">
        <h2 className="text-lg font-bold text-slate-900">
          কোনো আবেদন নির্বাচন করা হয়নি
        </h2>
        <p className="text-sm text-slate-600 max-w-md mx-auto">
          Class তালিকা থেকে যেকোনো ক্লাসে আবেদন করুন অথবা আমার আবেদন তালিকা থেকে একটি আবেদন বেছে নিন।
        </p>
        <button
          type="button"
          onClick={onBackToClassList}
          className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          Class তালিকা দেখুন
        </button>
      </div>
    );
  }

  const countdown = formatRemainingTime(activeExpiresAt, nowMs);
  const effectiveStatus: HoldStatus =
    baseStatus === 'HELD' && countdown.isExpired ? 'EXPIRED' : baseStatus;

  const isHeldAndValid = effectiveStatus === 'HELD' && !countdown.isExpired;

  const statusColorMap: Record<HoldStatus, string> = {
    HELD: 'text-amber-700',
    CONFIRMED: 'text-emerald-700',
    EXPIRED: 'text-red-600',
    CANCELLED: 'text-slate-600',
  };

  const timerDisplayText =
    effectiveStatus === 'CONFIRMED'
      ? 'CONFIRMED'
      : effectiveStatus === 'CANCELLED'
      ? 'CANCELLED'
      : effectiveStatus === 'EXPIRED'
      ? '00:00'
      : countdown.formatted;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900">আবেদন</h1>
        </div>
        <button
          type="button"
          onClick={onBackToClassList}
          className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          Class তালিকা
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-6 md:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 pb-6 border-b border-slate-200">
          <div className="space-y-1.5">
            <div className="text-xs text-slate-500 font-mono tabular-nums">
              Hold ID: {hold.holdId} · Student ID: {studentId}
            </div>
            <h2 className="text-2xl font-bold text-slate-900">
              {liveClassDetail?.name || hold.className}
            </h2>
            <p className={`text-sm font-semibold ${statusColorMap[effectiveStatus]}`}>
              অবস্থা: {effectiveStatus}
            </p>
            {liveClassDetail && (
              <p className="text-xs text-slate-500 font-mono tabular-nums">
                মোট আসন: {liveClassDetail.totalSeats} · Hold: {liveClassDetail.heldSeats} · নিশ্চিত: {liveClassDetail.confirmedSeats} · খালি: {liveClassDetail.availableSeats}
              </p>
            )}
          </div>

          <div className="bg-slate-900 text-white rounded-lg px-6 py-4 min-w-[200px] text-center shrink-0">
            <div className="text-xs text-slate-300 mb-1">{effectiveStatus === "HELD" || effectiveStatus === "EXPIRED" ? "বাকি সময়" : "চূড়ান্ত অবস্থা"}</div>
            <div
              data-testid="hold-countdown"
              className={`text-3xl font-mono font-bold tabular-nums tracking-tight ${
                effectiveStatus === 'CONFIRMED'
                  ? 'text-emerald-400'
                  : effectiveStatus === 'EXPIRED'
                  ? 'text-red-400'
                  : effectiveStatus === 'CANCELLED'
                  ? 'text-slate-400'
                  : countdown.remainingSeconds <= 30
                  ? 'text-amber-400'
                  : 'text-white'
              }`}
            >
              {timerDisplayText}
            </div>
          </div>
        </div>

        {effectiveStatus === 'EXPIRED' && (
          <div
            role="alert"
            className="bg-red-50 border border-red-200 text-red-900 px-4 py-3 rounded-lg text-sm font-medium"
          >
            নির্ধারিত সময়ের মধ্যে ভর্তি ফি জমা না দেওয়ায় এই আবেদনের মেয়াদ শেষ (EXPIRED) হয়ে গেছে এবং আসনটি অন্যদের জন্য খুলে দেওয়া হয়েছে।
          </div>
        )}

        {effectiveStatus === 'CONFIRMED' && (
          <div
            role="status"
            className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-lg text-sm font-medium"
          >
            ভর্তি ফি জমা সফল হয়েছে এবং এই ক্লাসে আপনার ভর্তি নিশ্চিত (CONFIRMED) হয়েছে।
          </div>
        )}

        {effectiveStatus === 'CANCELLED' && (
          <div
            role="status"
            className="bg-slate-100 border border-slate-200 text-slate-800 px-4 py-3 rounded-lg text-sm font-medium"
          >
            এই আবেদনটি বাতিল (CANCELLED) করা হয়েছে।
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={!isHeldAndValid || confirming || cancelling}
            onClick={() => onConfirm(hold.holdId)}
            className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              isHeldAndValid && !confirming
                ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
            }`}
          >
            {confirming ? 'নিশ্চিত হচ্ছে...' : 'ভর্তি ফি দিন'}
          </button>

          <button
            type="button"
            disabled={!isHeldAndValid || confirming || cancelling}
            onClick={() => onCancel(hold.holdId)}
            className={`px-5 py-2.5 text-sm font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              isHeldAndValid && !cancelling
                ? 'bg-white text-red-700 border-red-300 hover:bg-red-50'
                : 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
            }`}
          >
            {cancelling ? 'বাতিল হচ্ছে...' : 'বাতিল'}
          </button>
        </div>
      </div>
    </div>
  );
};
