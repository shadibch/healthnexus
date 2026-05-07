import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type Lang = "en" | "ar";

export const translations = {
  en: {
    // Nav / Layout
    appName: "ClinicFlow",
    version: "ClinicFlow v1.0 · MEA Edition",
    doctorView: "Doctor View",
    patientView: "Patient View",
    pharmacyView: "Pharmacy View",
    dashboard: "Dashboard",
    patients: "Patients",
    todaysQueue: "Today's Queue",
    consultations: "Consultations",
    prescriptions: "Prescriptions",
    myAppointments: "My Appointments",
    myPrescriptions: "My Prescriptions",
    pendingRx: "Pending Rx",
    stock: "Stock",
    billing: "Billing",
    findNearby: "Find Nearby",
    logout: "Logout",

    // Auth
    signIn: "Sign in to ClinicFlow",
    signInSubtitle: "Enter your credentials to continue",
    emailAddress: "Email Address",
    password: "Password",
    signingIn: "Signing in...",
    invalidCredentials: "Invalid email or password",
    demoCredentials: "Demo Credentials",
    doctor: "Doctor",
    patient: "Patient",
    pharmacy: "Pharmacy",
    useThisAccount: "Use this account",
    welcomeBack: "Welcome back",
    signedInAs: "Signed in as",

    // Dashboard
    totalPatients: "Total Patients",
    doctors: "Doctors",
    appointmentsToday: "Today's Appointments",
    completedToday: "Completed Today",
    pending: "Pending",
    pendingRxCount: "Pending Rx",
    lowStockAlerts: "Low Stock Alerts",
    consultationsMonth: "Consultations/Month",
    appointmentsByStatus: "Today's Appointments by Status",
    topSpecializations: "Top Specializations",
    recentActivity: "Recent Activity",
    noRecentActivity: "No recent activity",
    appts: "appts",
    doctorsCount: "doctors",

    // Patients
    registeredPatients: "registered patients",
    registerPatient: "Register Patient",
    searchPatients: "Search by name, phone, or ID...",
    noPatients: "No patients found",
    selectPatientHistory: "Select a patient to view their history",
    visitHistory: "Visit History",
    appointments: "appointments",
    recentPrescriptions: "Recent Prescriptions",
    medications: "medications",
    allergies: "Allergies",
    medicalNotes: "Medical Notes",
    registerNewPatient: "Register New Patient",
    firstName: "First Name",
    lastName: "Last Name",
    phone: "Phone",
    email: "Email",
    gender: "Gender",
    male: "Male",
    female: "Female",
    select: "Select",
    bloodType: "Blood Type",
    dateOfBirth: "Date of Birth",
    nationalId: "National ID",
    knownAllergies: "Known Allergies",
    allergiesPlaceholder: "e.g. Penicillin, None",
    address: "Address",
    registering: "Registering...",
    patientRegistered: "Patient registered successfully",
    age: "y",

    // Queue
    activeQueue: "Active Queue",
    completed: "Completed",
    waiting: "Waiting",
    inProgress: "In Progress",
    queueEmpty: "Queue is empty",
    confirm: "Confirm",
    start: "Start",
    complete: "Complete",
    queueUpdated: "Queue updated",

    // Status labels
    scheduled: "Waiting",
    confirmed: "Confirmed",
    in_progress: "In Progress",
    completedStatus: "Completed",
    cancelled: "Cancelled",
    no_show: "No Show",

    // Appointment types
    routine: "Routine",
    follow_up: "Follow-up",
    consultation: "Consultation",
    emergency: "Emergency",

    // Consultations
    noConsultations: "No consultations yet",
    chiefComplaint: "Chief Complaint",
    diagnosis: "Diagnosis",
    treatmentPlan: "Treatment Plan",
    records: "records",

    // Prescriptions
    pendingDispensing: "pending dispensing",
    allPrescriptions: "All prescriptions",
    noPrescriptions: "No prescriptions found",
    dispense: "Dispense",
    dispensed: "Dispensed",
    dispensedSuccessfully: "Prescription dispensed successfully",
    items: "items",
    qty: "Qty",
    note: "Note",

    // Stock
    pharmacyStock: "Pharmacy Stock",
    medicationsTracked: "medications tracked",
    lowStockItems: "Low Stock Items",
    expiringSoon: "Expiring Soon",
    allStock: "All Stock",
    lowStockOnly: "Low Stock Only",
    noStockItems: "No stock items found",
    updateStock: "Update Stock",
    currentQuantity: "Current Quantity",
    minimumQuantity: "Minimum Quantity",
    saving: "Saving...",
    stockUpdated: "Stock updated",
    expiry: "Exp",
    low: "Low Stock",

    // Appointments page
    noAppointments: "No appointments found",

    // Receptionist
    receptionView: "Reception",
    receptionDashboard: "Reception Dashboard",
    todayOverview: "Today's Overview",
    checkIn: "Check In",
    noShow: "No Show",
    bookForPatient: "Book for Patient",
    selectPatient: "Select Patient",
    searchPatientName: "Search by name or ID...",
    patientNotFound: "No patient found",
    upcomingToday: "Upcoming Today",
    checkedIn: "Checked In",
    newPatientsToday: "New Today",
    walkIns: "Walk-ins",
    receptionActions: "Quick Actions",
    allAppointmentsToday: "All Appointments Today",

    // General
    all: "All",
    error: "Error",
    loading: "Loading...",
    save: "Save",
    cancel: "Cancel",
    ago: "ago",
  },
  ar: {
    // Nav / Layout
    appName: "كلينيك فلو",
    version: "كلينيك فلو v1.0 · نسخة الشرق الأوسط وأفريقيا",
    doctorView: "عرض الطبيب",
    patientView: "عرض المريض",
    pharmacyView: "عرض الصيدلية",
    dashboard: "لوحة التحكم",
    patients: "المرضى",
    todaysQueue: "طابور اليوم",
    consultations: "الاستشارات",
    prescriptions: "الوصفات الطبية",
    myAppointments: "مواعيدي",
    myPrescriptions: "وصفاتي الطبية",
    pendingRx: "وصفات معلقة",
    stock: "المخزون",
    billing: "الفوترة",
    findNearby: "ابحث بالقرب",
    logout: "تسجيل الخروج",

    // Auth
    signIn: "تسجيل الدخول إلى كلينيك فلو",
    signInSubtitle: "أدخل بيانات اعتمادك للمتابعة",
    emailAddress: "البريد الإلكتروني",
    password: "كلمة المرور",
    signingIn: "جارٍ تسجيل الدخول...",
    invalidCredentials: "البريد الإلكتروني أو كلمة المرور غير صحيحة",
    demoCredentials: "بيانات اعتماد تجريبية",
    doctor: "طبيب",
    patient: "مريض",
    pharmacy: "صيدلية",
    useThisAccount: "استخدم هذا الحساب",
    welcomeBack: "مرحباً بعودتك",
    signedInAs: "مسجّل الدخول كـ",

    // Dashboard
    totalPatients: "إجمالي المرضى",
    doctors: "الأطباء",
    appointmentsToday: "مواعيد اليوم",
    completedToday: "مكتملة اليوم",
    pending: "قيد الانتظار",
    pendingRxCount: "وصفات معلقة",
    lowStockAlerts: "تنبيهات نقص المخزون",
    consultationsMonth: "استشارات / الشهر",
    appointmentsByStatus: "مواعيد اليوم حسب الحالة",
    topSpecializations: "أبرز التخصصات",
    recentActivity: "النشاط الأخير",
    noRecentActivity: "لا يوجد نشاط حديث",
    appts: "مواعيد",
    doctorsCount: "أطباء",

    // Patients
    registeredPatients: "مريض مسجّل",
    registerPatient: "تسجيل مريض",
    searchPatients: "ابحث بالاسم أو الهاتف أو الرقم الوطني...",
    noPatients: "لم يتم العثور على مرضى",
    selectPatientHistory: "اختر مريضاً لعرض سجله",
    visitHistory: "سجل الزيارات",
    appointments: "مواعيد",
    recentPrescriptions: "الوصفات الأخيرة",
    medications: "أدوية",
    allergies: "الحساسية",
    medicalNotes: "ملاحظات طبية",
    registerNewPatient: "تسجيل مريض جديد",
    firstName: "الاسم الأول",
    lastName: "اسم العائلة",
    phone: "الهاتف",
    email: "البريد الإلكتروني",
    gender: "الجنس",
    male: "ذكر",
    female: "أنثى",
    select: "اختر",
    bloodType: "فصيلة الدم",
    dateOfBirth: "تاريخ الميلاد",
    nationalId: "الرقم الوطني",
    knownAllergies: "الحساسية المعروفة",
    allergiesPlaceholder: "مثال: البنسلين، لا يوجد",
    address: "العنوان",
    registering: "جارٍ التسجيل...",
    patientRegistered: "تم تسجيل المريض بنجاح",
    age: "سنة",

    // Queue
    activeQueue: "الطابور النشط",
    completed: "مكتمل",
    waiting: "قيد الانتظار",
    inProgress: "جارٍ",
    queueEmpty: "الطابور فارغ",
    confirm: "تأكيد",
    start: "بدء",
    complete: "إتمام",
    queueUpdated: "تم تحديث الطابور",

    // Status labels
    scheduled: "قيد الانتظار",
    confirmed: "مؤكد",
    in_progress: "جارٍ",
    completedStatus: "مكتمل",
    cancelled: "ملغى",
    no_show: "غياب",

    // Appointment types
    routine: "روتيني",
    follow_up: "متابعة",
    consultation: "استشارة",
    emergency: "طارئ",

    // Consultations
    noConsultations: "لا توجد استشارات بعد",
    chiefComplaint: "الشكوى الرئيسية",
    diagnosis: "التشخيص",
    treatmentPlan: "خطة العلاج",
    records: "سجلات",

    // Prescriptions
    pendingDispensing: "بانتظار الصرف",
    allPrescriptions: "جميع الوصفات",
    noPrescriptions: "لم يتم العثور على وصفات",
    dispense: "صرف",
    dispensed: "تم الصرف",
    dispensedSuccessfully: "تم صرف الوصفة بنجاح",
    items: "أدوية",
    qty: "الكمية",
    note: "ملاحظة",

    // Stock
    pharmacyStock: "مخزون الصيدلية",
    medicationsTracked: "دواء مُتابَع",
    lowStockItems: "أصناف نقص المخزون",
    expiringSoon: "تنتهي قريباً",
    allStock: "كل المخزون",
    lowStockOnly: "نقص المخزون فقط",
    noStockItems: "لا توجد أصناف",
    updateStock: "تحديث المخزون",
    currentQuantity: "الكمية الحالية",
    minimumQuantity: "الحد الأدنى للكمية",
    saving: "جارٍ الحفظ...",
    stockUpdated: "تم تحديث المخزون",
    expiry: "انتهاء",
    low: "مخزون منخفض",

    // Appointments page
    noAppointments: "لم يتم العثور على مواعيد",

    // Receptionist
    receptionView: "الاستقبال",
    receptionDashboard: "لوحة الاستقبال",
    todayOverview: "نظرة عامة على اليوم",
    checkIn: "تسجيل الحضور",
    noShow: "غياب",
    bookForPatient: "حجز للمريض",
    selectPatient: "اختر المريض",
    searchPatientName: "ابحث بالاسم أو الرقم الوطني...",
    patientNotFound: "لم يتم العثور على مريض",
    upcomingToday: "القادمة اليوم",
    checkedIn: "سُجّل حضورهم",
    newPatientsToday: "جدد اليوم",
    walkIns: "بدون موعد",
    receptionActions: "إجراءات سريعة",
    allAppointmentsToday: "جميع مواعيد اليوم",

    // General
    all: "الكل",
    error: "خطأ",
    loading: "جارٍ التحميل...",
    save: "حفظ",
    cancel: "إلغاء",
    ago: "مضت",
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

type I18nContextType = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TranslationKey) => string;
  isRTL: boolean;
};

const I18nContext = createContext<I18nContextType>({
  lang: "en",
  setLang: () => {},
  t: (k) => k,
  isRTL: false,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    return (localStorage.getItem("cf-lang") as Lang) ?? "en";
  });

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem("cf-lang", l);
  };

  const isRTL = lang === "ar";

  useEffect(() => {
    document.documentElement.dir = isRTL ? "rtl" : "ltr";
    document.documentElement.lang = lang;
    if (isRTL) {
      document.documentElement.classList.add("font-arabic");
    } else {
      document.documentElement.classList.remove("font-arabic");
    }
  }, [lang, isRTL]);

  const t = (key: TranslationKey): string => translations[lang][key] ?? translations.en[key] ?? key;

  return (
    <I18nContext.Provider value={{ lang, setLang, t, isRTL }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
