import type {
  ClassSummaryDto,
  HoldResponseDto,
  HoldStatusDto,
  StudentHoldDto,
} from '../utils/admissionLogic';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080').replace(/\/$/, '');

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function formatUserErrorMessage(rawMessage: string | undefined, status: number): string {
  if (!rawMessage) {
    return `অনুরোধ সম্পন্ন করা যায়নি (HTTP ${status})। দয়া করে আবার চেষ্টা করুন।`;
  }

  const lower = rawMessage.toLowerCase();

  if (lower.includes('no available seats')) {
    return 'দুঃখিত, এই ক্লাসে বর্তমানে কোনো খালি আসন নেই। কোনো আসনের মেয়াদ শেষ হলে আবার চেষ্টা করুন।';
  }
  if (lower.includes('already has a confirmed admission')) {
    const match = rawMessage.match(/confirmed admission in (.+?)\.?$/i);
    if (match && match[1] && match[1].toLowerCase() !== 'this class') {
      return `আপনার ভর্তি ইতিমধ্যে "${match[1]}"-এ নিশ্চিত (CONFIRMED) হয়েছে। একজন শিক্ষার্থী একাধিক ক্লাসে ভর্তি হতে পারবে না।`;
    }
    return 'আপনার ভর্তি ইতিমধ্যে একটি ক্লাসে নিশ্চিত (CONFIRMED) হয়েছে। একজন শিক্ষার্থী একাধিক ক্লাসে ভর্তি হতে পারবে না।';
  }
  if (lower.includes('already has an active hold')) {
    const match = rawMessage.match(/active hold in (.+?)(?:\.|$)/i);
    if (match && match[1] && match[1].toLowerCase() !== 'this class') {
      return `আপনার ইতিমধ্যে "${match[1]}"-এ একটি চলমান আবেদন (HELD) রয়েছে। অন্য ক্লাসে আবেদন করতে চাইলে আগে চলমান আবেদনটি বাতিল করুন।`;
    }
    return 'আপনার ইতিমধ্যে একটি চলমান আবেদন (HELD) রয়েছে। অন্য ক্লাসে আবেদন করতে চাইলে আগে চলমান আবেদনটি বাতিল করুন।';
  }
  if (lower.includes('already exists')) {
    return 'এই নামের ক্লাস ও শিফট ইতিমধ্যে তৈরি করা হয়েছে।';
  }
  if (lower.includes('expired')) {
    return 'নির্ধারিত সময়ের মধ্যে ফি জমা না দেওয়ায় আবেদনের মেয়াদ শেষ (EXPIRED) হয়ে গেছে।';
  }
  if (lower.includes('cancelled hold cannot be confirmed')) {
    return 'বাতিলকৃত আবেদন নিশ্চিত করা সম্ভব নয়।';
  }
  if (lower.includes('confirmed admission cannot be cancelled')) {
    return 'নিশ্চিতকৃত ভর্তি বাতিল করা যাবে না।';
  }
  if (lower.includes('only confirm your own') || lower.includes('only cancel your own')) {
    return 'শুধুমাত্র নিজের জন্ম নিবন্ধন নম্বর দিয়ে করা আবেদন পরিবর্তন করা যাবে।';
  }
  if (lower.includes('x-student-id')) {
    return '১৭ সংখ্যার সঠিক জন্ম নিবন্ধন নম্বর প্রদান করুন।';
  }
  if (lower.includes('class name is required') || lower.includes('class name must follow')) {
    return 'Class 1 থেকে Class 12 এবং Morning Shift বা Day Shift ফরম্যাটে নাম লিখুন (যেমন: Class 6 - Morning Shift)।';
  }
  if (lower.includes('totalseats must be')) {
    return 'আসন সংখ্যা ১ বা তার বেশি পূর্ণসংখ্যা হতে হবে।';
  }
  if (lower.includes('class not found')) {
    return 'নির্ধারিত ক্লাসটি খুঁজে পাওয়া যায়নি।';
  }
  if (lower.includes('hold not found')) {
    return 'আবেদনটি খুঁজে পাওয়া যায়নি।';
  }

  return rawMessage;
}

async function requestJson<T>(
  endpoint: string,
  options: RequestInit = {},
  studentId?: string,
  attempt: number = 0
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (studentId && studentId.trim() !== '') {
    headers.set('X-Student-Id', studentId.trim());
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });
  } catch {
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 500));
      return requestJson<T>(endpoint, options, studentId, attempt + 1);
    }
    throw new ApiError(
      'সার্ভারের সাথে সংযোগ স্থাপন করা যাচ্ছে না। দয়া করে সার্ভার চালু আছে কিনা চেক করুন।',
      0
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const rawText = await response.text();
  let bodyData: { message?: string; error?: string; title?: string } | null = null;
  let parsedOk = false;

  if (rawText.trim() !== '') {
    try {
      bodyData = JSON.parse(rawText);
      parsedOk = true;
    } catch {
      bodyData = null;
    }
  }

  if (!response.ok) {
    if ((response.status === 502 || response.status === 503 || response.status === 504) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 500));
      return requestJson<T>(endpoint, options, studentId, attempt + 1);
    }
    const rawMsg = bodyData?.message || bodyData?.error || bodyData?.title;
    throw new ApiError(formatUserErrorMessage(rawMsg, response.status), response.status);
  }

  if (rawText.trim() === '') {
    return undefined as T;
  }

  if (!parsedOk || bodyData === null) {
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 500));
      return requestJson<T>(endpoint, options, studentId, attempt + 1);
    }
    throw new ApiError(
      'সার্ভার থেকে সঠিক তথ্য পাওয়া যায়নি। দয়া করে কিছুক্ষণ পর আবার চেষ্টা করুন।',
      response.status
    );
  }

  return bodyData as T;
}

export const admissionApi = {
  createClass(name: string, totalSeats: number): Promise<{ id: string; name: string; totalSeats: number }> {
    return requestJson('/classes', {
      method: 'POST',
      body: JSON.stringify({ name, totalSeats }),
    });
  },

  async getClasses(): Promise<ClassSummaryDto[]> {
    const res = await requestJson<ClassSummaryDto[]>('/classes', { method: 'GET' });
    return Array.isArray(res) ? res : [];
  },

  getClassById(classId: string): Promise<ClassSummaryDto> {
    return requestJson(`/classes/${encodeURIComponent(classId)}`, { method: 'GET' });
  },

  createHold(classId: string, studentId: string): Promise<HoldResponseDto> {
    return requestJson(
      `/classes/${encodeURIComponent(classId)}/holds`,
      { method: 'POST' },
      studentId
    );
  },

  getHoldById(holdId: string): Promise<HoldStatusDto> {
    return requestJson(`/holds/${encodeURIComponent(holdId)}`, { method: 'GET' });
  },

  confirmHold(holdId: string, studentId: string): Promise<{ holdId: string; status: string }> {
    return requestJson(
      `/holds/${encodeURIComponent(holdId)}/confirm`,
      { method: 'POST' },
      studentId
    );
  },

  cancelHold(holdId: string, studentId: string): Promise<void> {
    return requestJson(
      `/holds/${encodeURIComponent(holdId)}`,
      { method: 'DELETE' },
      studentId
    );
  },

  async getMyHolds(studentId: string): Promise<StudentHoldDto[]> {
    const res = await requestJson<StudentHoldDto[]>('/me/holds', { method: 'GET' }, studentId);
    return Array.isArray(res) ? res : [];
  },
};
