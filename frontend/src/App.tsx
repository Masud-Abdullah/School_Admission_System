import { useCallback, useEffect, useState } from 'react';
import {
  validateStudentId,
  type ClassSummaryDto,
  type StudentHoldDto,
} from './utils/admissionLogic';
import { admissionApi, ApiError } from './services/admissionApi';
import { StudentIdentityBar } from './components/StudentIdentityBar';
import { ClassListSection } from './components/ClassListSection';
import { ActiveHoldSection } from './components/ActiveHoldSection';
import { MyApplicationsSection } from './components/MyApplicationsSection';
import { AdminClassCreateSection } from './components/AdminClassCreateSection';

type ScreenTab = 'classes' | 'active-hold' | 'my-holds' | 'admin';

const STUDENT_ID_STORAGE_KEY = 'school_admission_student_id';
const SELECTED_HOLD_STORAGE_KEY = 'school_admission_selected_hold_id';
const ACTIVE_TAB_STORAGE_KEY = 'school_admission_active_tab';

export default function App() {
  const [activeTab, setActiveTabState] = useState<ScreenTab>(() => {
    try {
      const saved = sessionStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
      if (saved === 'classes' || saved === 'active-hold' || saved === 'my-holds' || saved === 'admin') {
        return saved;
      }
      return 'classes';
    } catch {
      return 'classes';
    }
  });

  const setActiveTab = (tab: ScreenTab) => {
    setActiveTabState(tab);
    try {
      sessionStorage.setItem(ACTIVE_TAB_STORAGE_KEY, tab);
    } catch {
      return;
    }
  };

  const [studentId, setStudentId] = useState<string>(() => {
    try {
      return sessionStorage.getItem(STUDENT_ID_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });

  const [selectedHoldId, setSelectedHoldId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(SELECTED_HOLD_STORAGE_KEY) || null;
    } catch {
      return null;
    }
  });

  const [classes, setClasses] = useState<ClassSummaryDto[]>([]);
  const [myHolds, setMyHolds] = useState<StudentHoldDto[]>([]);
  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);

  const [applyingClassId, setApplyingClassId] = useState<string | null>(null);
  const [confirmingHoldId, setConfirmingHoldId] = useState<string | null>(null);
  const [cancellingHoldId, setCancellingHoldId] = useState<string | null>(null);
  const [creatingClass, setCreatingClass] = useState<boolean>(false);

  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const studentValidation = validateStudentId(studentId);

  const selectTab = (tab: ScreenTab) => {
    setErrorBanner(null);
    setSuccessBanner(null);
    setActiveTab(tab);
  };

  const handleSelectHold = (holdId: string | null) => {
    setSelectedHoldId(holdId);
    try {
      if (holdId) {
        sessionStorage.setItem(SELECTED_HOLD_STORAGE_KEY, holdId);
      } else {
        sessionStorage.removeItem(SELECTED_HOLD_STORAGE_KEY);
      }
    } catch {
      return;
    }
  };

  const handleStudentIdChange = (newVal: string) => {
    setStudentId(newVal);
    setErrorBanner(null);
    setSuccessBanner(null);
    setMyHolds([]);
    handleSelectHold(null);
    try {
      sessionStorage.setItem(STUDENT_ID_STORAGE_KEY, newVal);
    } catch {
      return;
    }
  };

  const fetchAllData = useCallback(async () => {
    try {
      const fetchedClasses = await admissionApi.getClasses();
      const safeClasses = Array.isArray(fetchedClasses) ? fetchedClasses : [];
      setClasses(safeClasses);

      if (validateStudentId(studentId).valid) {
        const fetchedHolds = await admissionApi.getMyHolds(studentId);
        const safeHolds = Array.isArray(fetchedHolds) ? fetchedHolds : [];
        setMyHolds(safeHolds);

        const existsInMyHolds =
          selectedHoldId !== null && safeHolds.some((h) => h.holdId === selectedHoldId);

        if (!existsInMyHolds) {
          const preferredHold =
            safeHolds.find((h) => h.status === 'HELD' || h.status === 'CONFIRMED') ||
            safeHolds[0] ||
            null;
          handleSelectHold(preferredHold ? preferredHold.holdId : null);
        }
      } else {
        setMyHolds([]);
        handleSelectHold(null);
      }
    } catch {
      return;
    } finally {
      setLoadingInitial(false);
    }
  }, [studentId, selectedHoldId]);

  useEffect(() => {
    fetchAllData();
    const pollTimer = setInterval(() => {
      fetchAllData();
    }, 2500);
    return () => clearInterval(pollTimer);
  }, [fetchAllData]);

  const handleApplyForClass = async (classId: string) => {
    setErrorBanner(null);
    setSuccessBanner(null);

    if (!studentValidation.valid) {
      setErrorBanner(studentValidation.error!);
      return;
    }

    const existingConfirmed = myHolds.find((h) => h.status === 'CONFIRMED');
    if (existingConfirmed) {
      setErrorBanner(
        `আপনার ভর্তি ইতিমধ্যে "${existingConfirmed.className}"-এ নিশ্চিত (CONFIRMED) হয়েছে। একজন শিক্ষার্থী একাধিক ক্লাসে ভর্তি হতে পারবে না।`
      );
      return;
    }

    const existingHeld = myHolds.find(
      (h) => h.status === 'HELD' && new Date(h.expiresAt).getTime() > Date.now()
    );
    if (existingHeld) {
      setErrorBanner(
        `আপনার ইতিমধ্যে "${existingHeld.className}"-এ একটি চলমান আবেদন (HELD) রয়েছে। অন্য ক্লাসে আবেদন করতে চাইলে আগে চলমান আবেদনটি বাতিল করুন।`
      );
      return;
    }

    setApplyingClassId(classId);
    try {
      const createdHold = await admissionApi.createHold(classId, studentId);
      const targetCls = classes.find((c) => c.id === classId);
      const optimisticHold: StudentHoldDto = {
        holdId: createdHold.holdId,
        classId: createdHold.classId,
        className: targetCls?.name || createdHold.classId,
        status: createdHold.status,
        expiresAt: createdHold.expiresAt,
      };
      setMyHolds((prev) => [optimisticHold, ...prev.filter((h) => h.holdId !== createdHold.holdId)]);
      handleSelectHold(createdHold.holdId);
      setActiveTab('active-hold');
      void fetchAllData();
    } catch (err) {
      setErrorBanner(err instanceof ApiError ? err.message : String(err));
      void fetchAllData();
    } finally {
      setApplyingClassId(null);
    }
  };

  const handleConfirmHold = async (holdId: string) => {
    setErrorBanner(null);
    setSuccessBanner(null);

    if (!studentValidation.valid) {
      setErrorBanner(studentValidation.error!);
      return;
    }

    setConfirmingHoldId(holdId);
    try {
      await admissionApi.confirmHold(holdId, studentId);
      setMyHolds((prev) =>
        prev.map((h) => (h.holdId === holdId ? { ...h, status: 'CONFIRMED' } : h))
      );
      void fetchAllData();
    } catch (err) {
      setErrorBanner(err instanceof ApiError ? err.message : String(err));
      void fetchAllData();
    } finally {
      setConfirmingHoldId(null);
    }
  };

  const handleCancelHold = async (holdId: string) => {
    setErrorBanner(null);
    setSuccessBanner(null);

    if (!studentValidation.valid) {
      setErrorBanner(studentValidation.error!);
      return;
    }

    setCancellingHoldId(holdId);
    try {
      await admissionApi.cancelHold(holdId, studentId);
      setMyHolds((prev) =>
        prev.map((h) => (h.holdId === holdId ? { ...h, status: 'CANCELLED' } : h))
      );
      void fetchAllData();
    } catch (err) {
      setErrorBanner(err instanceof ApiError ? err.message : String(err));
      void fetchAllData();
    } finally {
      setCancellingHoldId(null);
    }
  };

  const handleCreateClass = async (name: string, totalSeats: number): Promise<boolean> => {
    setErrorBanner(null);
    setSuccessBanner(null);
    setCreatingClass(true);
    try {
      await admissionApi.createClass(name, totalSeats);
      await fetchAllData();
      setSuccessBanner(`নতুন ক্লাস "${name}" (${totalSeats} আসন) সফলভাবে যুক্ত হয়েছে।`);
      return true;
    } catch (err) {
      setErrorBanner(err instanceof ApiError ? err.message : String(err));
      return false;
    } finally {
      setCreatingClass(false);
    }
  };

  const nowMs = Date.now();
  const activeHeldList = myHolds.filter(
    (h) => h.status === 'HELD' && new Date(h.expiresAt).getTime() > nowMs
  );
  const currentViewedHold: StudentHoldDto | null =
    myHolds.find((h) => h.holdId === selectedHoldId) ||
    activeHeldList[0] ||
    myHolds.find((h) => h.status === 'CONFIRMED') ||
    myHolds[0] ||
    null;

  const activeHoldCount = activeHeldList.length;
  const confirmedCount = myHolds.filter((h) => h.status === 'CONFIRMED').length;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              selectTab('classes');
            }}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            অনলাইন স্কুল ভর্তি সিস্টেম
          </a>

          <nav
            aria-label="Main Navigation"
            className="flex items-center gap-6 text-sm font-medium text-slate-600 overflow-x-auto"
          >
            <button
              type="button"
              onClick={() => selectTab('classes')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'classes'
                  ? 'border-slate-900 text-slate-900 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Class তালিকা
            </button>

            <button
              type="button"
              onClick={() => selectTab('active-hold')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'active-hold'
                  ? 'border-slate-900 text-slate-900 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              আবেদন {activeHoldCount > 0 ? `(${activeHoldCount})` : ''}
            </button>

            <button
              type="button"
              onClick={() => selectTab('my-holds')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'my-holds'
                  ? 'border-slate-900 text-slate-900 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              আমার আবেদন ({myHolds.length})
            </button>

            <button
              type="button"
              onClick={() => selectTab('admin')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'admin'
                  ? 'border-slate-900 text-slate-900 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Class তৈরি (School Admin)
            </button>
          </nav>
        </div>
      </header>

      {activeTab !== 'admin' && (
        <StudentIdentityBar
          studentId={studentId}
          onChangeStudentId={handleStudentIdChange}
          activeHoldCount={activeHoldCount}
          confirmedCount={confirmedCount}
        />
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-6">
        {errorBanner && (
          <div
            role="alert"
            className="bg-red-50 border border-red-200 text-red-900 px-4 py-3.5 rounded-lg flex items-center justify-between gap-4 text-sm"
          >
            <div className="font-medium">
              <span className="font-bold mr-1.5">ত্রুটি:</span>
              {errorBanner}
            </div>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="text-xs font-semibold text-red-700 hover:text-red-900 underline whitespace-nowrap shrink-0"
            >
              বন্ধ করুন
            </button>
          </div>
        )}

        {successBanner && (
          <div
            role="status"
            className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3.5 rounded-lg flex items-center justify-between gap-4 text-sm"
          >
            <div className="font-medium">{successBanner}</div>
            <button
              type="button"
              onClick={() => setSuccessBanner(null)}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 underline whitespace-nowrap shrink-0"
            >
              বন্ধ করুন
            </button>
          </div>
        )}

        {activeTab === 'classes' && (
          <ClassListSection
            classes={classes}
            myHolds={myHolds}
            loading={loadingInitial}
            applyingClassId={applyingClassId}
            onApply={handleApplyForClass}
            onSelectHold={(holdId) => {
              handleSelectHold(holdId);
              selectTab('active-hold');
            }}
          />
        )}

        {activeTab === 'active-hold' && (
          <ActiveHoldSection
            hold={currentViewedHold}
            studentId={studentId}
            studentIdValid={studentValidation.valid}
            confirming={confirmingHoldId === currentViewedHold?.holdId}
            cancelling={cancellingHoldId === currentViewedHold?.holdId}
            onConfirm={handleConfirmHold}
            onCancel={handleCancelHold}
            onExpireDetected={() => fetchAllData()}
            onBackToClassList={() => selectTab('classes')}
          />
        )}

        {activeTab === 'my-holds' && (
          <MyApplicationsSection
            holds={myHolds}
            studentId={studentId}
            studentIdValid={studentValidation.valid}
            onSelectHold={(holdId) => {
              handleSelectHold(holdId);
              selectTab('active-hold');
            }}
            onOpenClassList={() => selectTab('classes')}
          />
        )}

        {activeTab === 'admin' && (
          <AdminClassCreateSection
            classes={classes}
            creating={creatingClass}
            onCreateClass={handleCreateClass}
          />
        )}
      </main>
    </div>
  );
}
