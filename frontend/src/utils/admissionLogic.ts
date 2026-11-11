export type HoldStatus = 'HELD' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';

export interface ClassSummaryDto {
  id: string;
  name: string;
  totalSeats: number;
  heldSeats: number;
  confirmedSeats: number;
  availableSeats: number;
}

export interface HoldResponseDto {
  holdId: string;
  classId: string;
  studentId: string;
  status: HoldStatus;
  expiresAt: string;
}

export interface HoldStatusDto {
  holdId: string;
  classId: string;
  status: HoldStatus;
  expiresAt: string;
}

export interface StudentHoldDto {
  holdId: string;
  classId: string;
  className: string;
  status: HoldStatus;
  expiresAt: string;
}

export function validateStudentId(studentId: string | undefined | null): { valid: boolean; error?: string } {
  if (!studentId || typeof studentId !== 'string' || studentId.trim() === '') {
    return {
      valid: false,
      error: '১৭ সংখ্যার জন্ম নিবন্ধন নম্বর দেওয়া আবশ্যক।',
    };
  }
  const trimmed = studentId.trim();
  if (!/^\d{17}$/.test(trimmed)) {
    return {
      valid: false,
      error: 'জন্ম নিবন্ধন নম্বর অবশ্যই ১৭ সংখ্যার হতে হবে।',
    };
  }
  return { valid: true };
}

const CLASS_NAME_PATTERN = /^class\s+([1-9]|1[0-2])\s*-\s*(morning|day)\s+shift$/i;

export function normalizeClassName(name: string): string | null {
  const match = name.trim().match(CLASS_NAME_PATTERN);
  if (!match) {
    return null;
  }
  const classNumber = match[1];
  const shiftFormatted = match[2].toLowerCase() === 'morning' ? 'Morning' : 'Day';
  return `Class ${classNumber} - ${shiftFormatted} Shift`;
}

export function validateClassInput(
  name: unknown,
  totalSeats: unknown
): { valid: boolean; normalizedName?: string; error?: string } {
  if (typeof name !== 'string' || name.trim().length === 0) {
    return {
      valid: false,
      error: 'সঠিক ফরম্যাটে ক্লাসের নাম লিখুন (যেমন: Class 6 - Morning Shift বা Class 6 - Day Shift)।',
    };
  }
  const normalizedName = normalizeClassName(name);
  if (!normalizedName) {
    return {
      valid: false,
      error: 'Class 1 থেকে Class 12 এবং Morning Shift বা Day Shift ফরম্যাটে নাম লিখুন (যেমন: Class 6 - Morning Shift)।',
    };
  }
  if (
    typeof totalSeats !== 'number' ||
    !Number.isInteger(totalSeats) ||
    totalSeats <= 0 ||
    totalSeats > 100000
  ) {
    return {
      valid: false,
      error: 'আসন সংখ্যা ১ বা তার বেশি পূর্ণসংখ্যা হতে হবে।',
    };
  }
  return { valid: true, normalizedName };
}

export function formatRemainingTime(expiresAtIso: string, nowMs: number = Date.now()): {
  remainingSeconds: number;
  formatted: string;
  isExpired: boolean;
} {
  const diffMs = new Date(expiresAtIso).getTime() - nowMs;
  if (diffMs <= 0) {
    return { remainingSeconds: 0, formatted: '00:00', isExpired: true };
  }
  const totalSeconds = Math.ceil(diffMs / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return { remainingSeconds: totalSeconds, formatted, isExpired: false };
}
