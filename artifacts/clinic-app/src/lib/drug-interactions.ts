import type { MedicationOption } from "@/components/MedicationAutocomplete";

export interface DrugAlert {
  severity: "danger" | "warning";
  message: string;
  messageAr: string;
  drugs: string[];
}

function hit(med: MedicationOption, pattern: string): boolean {
  const p = pattern.toLowerCase();
  return (
    med.name.toLowerCase().includes(p) ||
    (med.genericName?.toLowerCase().includes(p) ?? false) ||
    (med.category?.toLowerCase().includes(p) ?? false)
  );
}

// ── Interaction pairs ────────────────────────────────────────────────────────
interface Pair {
  a: string;
  b: string;
  severity: "danger" | "warning";
  message: string;
  messageAr: string;
}

const PAIRS: Pair[] = [
  // Warfarin + bleeding-risk drugs
  {
    a: "warfarin", b: "aspirin",
    severity: "danger",
    message: "Warfarin + Aspirin: significantly increased bleeding risk. Monitor INR closely.",
    messageAr: "وارفارين + أسبرين: خطر نزيف مرتفع جداً. راقب INR بعناية.",
  },
  {
    a: "warfarin", b: "ibuprofen",
    severity: "danger",
    message: "Warfarin + Ibuprofen (NSAID): increased bleeding risk and potential GI ulceration.",
    messageAr: "وارفارين + إيبوبروفين: خطر نزيف وقرحة معدية.",
  },
  {
    a: "warfarin", b: "clopidogrel",
    severity: "danger",
    message: "Warfarin + Clopidogrel: dual antiplatelet/anticoagulant — major bleeding risk.",
    messageAr: "وارفارين + كلوبيدوغريل: مضاعفة مضادات التجلط، خطر نزيف شديد.",
  },
  {
    a: "warfarin", b: "ciprofloxacin",
    severity: "danger",
    message: "Warfarin + Ciprofloxacin: fluoroquinolones inhibit warfarin metabolism — INR may rise sharply.",
    messageAr: "وارفارين + سيبروفلوكساسين: ارتفاع خطير في INR.",
  },
  {
    a: "warfarin", b: "levofloxacin",
    severity: "danger",
    message: "Warfarin + Levofloxacin: fluoroquinolones inhibit warfarin metabolism — INR may rise sharply.",
    messageAr: "وارفارين + ليفوفلوكساسين: ارتفاع خطير في INR.",
  },
  {
    a: "warfarin", b: "azithromycin",
    severity: "danger",
    message: "Warfarin + Azithromycin: macrolides significantly increase INR.",
    messageAr: "وارفارين + أزيثروميسين: ارتفاع ملحوظ في INR.",
  },
  {
    a: "warfarin", b: "clarithromycin",
    severity: "danger",
    message: "Warfarin + Clarithromycin: CYP2C9 inhibition — INR may rise sharply.",
    messageAr: "وارفارين + كلاريثروميسين: ارتفاع خطير في INR.",
  },
  {
    a: "warfarin", b: "metronidazole",
    severity: "danger",
    message: "Warfarin + Metronidazole: inhibits warfarin metabolism — serious bleeding risk.",
    messageAr: "وارفارين + ميترونيدازول: تثبيط أيض الوارفارين، خطر نزيف.",
  },
  // ACE Inhibitor + ARB (dual RAAS blockade)
  {
    a: "lisinopril", b: "losartan",
    severity: "danger",
    message: "ACE Inhibitor + ARB (dual RAAS blockade): dangerous hypotension and acute kidney injury.",
    messageAr: "مثبط ACE + ARB: انخفاض خطير في الضغط واحتمال فشل كلوي.",
  },
  {
    a: "lisinopril", b: "valsartan",
    severity: "danger",
    message: "ACE Inhibitor + ARB (dual RAAS blockade): dangerous hypotension and acute kidney injury.",
    messageAr: "مثبط ACE + ARB: انخفاض خطير في الضغط واحتمال فشل كلوي.",
  },
  {
    a: "lisinopril", b: "telmisartan",
    severity: "danger",
    message: "ACE Inhibitor + ARB (dual RAAS blockade): dangerous hypotension and acute kidney injury.",
    messageAr: "مثبط ACE + ARB: انخفاض خطير في الضغط واحتمال فشل كلوي.",
  },
  {
    a: "ramipril", b: "losartan",
    severity: "danger",
    message: "ACE Inhibitor + ARB (dual RAAS blockade): dangerous hypotension and acute kidney injury.",
    messageAr: "مثبط ACE + ARB: انخفاض خطير في الضغط واحتمال فشل كلوي.",
  },
  {
    a: "ramipril", b: "valsartan",
    severity: "danger",
    message: "ACE Inhibitor + ARB (dual RAAS blockade): dangerous hypotension and acute kidney injury.",
    messageAr: "مثبط ACE + ARB: انخفاض خطير في الضغط واحتمال فشل كلوي.",
  },
  {
    a: "ramipril", b: "telmisartan",
    severity: "danger",
    message: "ACE Inhibitor + ARB (dual RAAS blockade): dangerous hypotension and acute kidney injury.",
    messageAr: "مثبط ACE + ARB: انخفاض خطير في الضغط واحتمال فشل كلوي.",
  },
  // Serotonin syndrome
  {
    a: "sertraline", b: "tramadol",
    severity: "danger",
    message: "SSRI + Tramadol: high risk of serotonin syndrome (agitation, hyperthermia, tachycardia).",
    messageAr: "SSRI + ترامادول: خطر مرتفع لمتلازمة السيروتونين.",
  },
  {
    a: "amitriptyline", b: "tramadol",
    severity: "danger",
    message: "Tricyclic antidepressant + Tramadol: serotonin syndrome risk.",
    messageAr: "مضاد اكتئاب ثلاثي الحلقة + ترامادول: خطر متلازمة السيروتونين.",
  },
  // CNS/respiratory depression
  {
    a: "diazepam", b: "tramadol",
    severity: "danger",
    message: "Benzodiazepine + Tramadol: severe CNS and respiratory depression — life-threatening.",
    messageAr: "بنزوديازيبين + ترامادول: اكتئاب تنفسي وعصبي شديد، قد يكون مميتاً.",
  },
  {
    a: "diazepam", b: "pregabalin",
    severity: "danger",
    message: "Benzodiazepine + Pregabalin: combined CNS depression — risk of respiratory failure.",
    messageAr: "بنزوديازيبين + بريغابالين: خطر فشل تنفسي.",
  },
  // Beta-blocker + rate-limiting CCB
  {
    a: "bisoprolol", b: "diltiazem",
    severity: "danger",
    message: "Beta-blocker + Diltiazem: risk of severe bradycardia and heart block.",
    messageAr: "بيتا بلوكر + ديلتيازيم: خطر بطء القلب وحصار قلبي.",
  },
  {
    a: "nebivolol", b: "diltiazem",
    severity: "danger",
    message: "Beta-blocker + Diltiazem: risk of severe bradycardia and heart block.",
    messageAr: "بيتا بلوكر + ديلتيازيم: خطر بطء القلب وحصار قلبي.",
  },
  // Digoxin toxicity
  {
    a: "digoxin", b: "diltiazem",
    severity: "danger",
    message: "Digoxin + Diltiazem: diltiazem raises digoxin plasma levels — toxicity risk (nausea, arrhythmias).",
    messageAr: "ديجوكسين + ديلتيازيم: ارتفاع مستوى ديجوكسين، خطر التسمم.",
  },
  // NSAIDs + steroids → GI bleeding
  {
    a: "ibuprofen", b: "prednisone",
    severity: "danger",
    message: "NSAID + Corticosteroid: significantly increased risk of GI bleeding and peptic ulcer.",
    messageAr: "مضاد التهاب + كورتيزون: خطر مرتفع لنزيف معدي وقرحة.",
  },
  // NSAIDs reducing antihypertensive effect / renal
  {
    a: "ibuprofen", b: "lisinopril",
    severity: "warning",
    message: "NSAID + ACE Inhibitor: NSAIDs reduce antihypertensive effect and may worsen renal function.",
    messageAr: "مضاد التهاب + مثبط ACE: تقليل فاعلية خافض الضغط وتأثير على الكلى.",
  },
  {
    a: "ibuprofen", b: "ramipril",
    severity: "warning",
    message: "NSAID + ACE Inhibitor: NSAIDs reduce antihypertensive effect and may worsen renal function.",
    messageAr: "مضاد التهاب + مثبط ACE: تقليل فاعلية خافض الضغط وتأثير على الكلى.",
  },
  // Steroids elevating blood sugar
  {
    a: "metformin", b: "prednisone",
    severity: "warning",
    message: "Metformin + Corticosteroid: steroids cause hyperglycemia — blood sugar control may deteriorate significantly.",
    messageAr: "ميتفورمين + كورتيزون: الكورتيزون يرفع السكر، مراقبة الغلوكوز ضرورية.",
  },
  {
    a: "metformin", b: "prednisolone",
    severity: "warning",
    message: "Metformin + Corticosteroid: steroids cause hyperglycemia.",
    messageAr: "ميتفورمين + كورتيزون: الكورتيزون يرفع السكر.",
  },
  // Fluoroquinolone + antacid/PPI
  {
    a: "ciprofloxacin", b: "omeprazole",
    severity: "warning",
    message: "Ciprofloxacin + PPI: absorption of ciprofloxacin may be reduced — take 2 hours apart.",
    messageAr: "سيبروفلوكساسين + أوميبرازول: تناولهما بفارق ساعتين.",
  },
  // Duplicate therapy flags
  {
    a: "ace inhibitor", b: "ace inhibitor",
    severity: "warning",
    message: "Two ACE Inhibitors prescribed — possible duplicate therapy.",
    messageAr: "دواءان من مجموعة مثبطات ACE — تحقق من عدم التكرار.",
  },
];

// ── Pregnancy contraindications ───────────────────────────────────────────────
interface PregEntry {
  pattern: string;
  severity: "danger" | "warning";
  message: string;
  messageAr: string;
}

const PREGNANCY: PregEntry[] = [
  {
    pattern: "warfarin",
    severity: "danger",
    message: "Warfarin is CONTRAINDICATED in pregnancy — teratogenic, causes fetal hemorrhage. Use LMWH instead.",
    messageAr: "الوارفارين ممنوع في الحمل — يسبب نزيف جنيني وتشوهات. استخدم هيبارين منخفض الوزن الجزيئي.",
  },
  {
    pattern: "lisinopril",
    severity: "danger",
    message: "ACE Inhibitors (Lisinopril) are CONTRAINDICATED in pregnancy — cause fetal renal failure and death.",
    messageAr: "مثبطات ACE (ليزينوبريل) ممنوعة في الحمل — تسبب فشل كلوي للجنين.",
  },
  {
    pattern: "ramipril",
    severity: "danger",
    message: "ACE Inhibitors (Ramipril) are CONTRAINDICATED in pregnancy — cause fetal renal failure.",
    messageAr: "مثبطات ACE (راميبريل) ممنوعة في الحمل — تسبب فشل كلوي للجنين.",
  },
  {
    pattern: "losartan",
    severity: "danger",
    message: "ARBs (Losartan) are CONTRAINDICATED in pregnancy — cause fetal renal failure and oligohydramnios.",
    messageAr: "مضادات ARB (لوزارتان) ممنوعة في الحمل.",
  },
  {
    pattern: "valsartan",
    severity: "danger",
    message: "ARBs (Valsartan) are CONTRAINDICATED in pregnancy — cause fetal renal failure.",
    messageAr: "مضادات ARB (فالسارتان) ممنوعة في الحمل.",
  },
  {
    pattern: "telmisartan",
    severity: "danger",
    message: "ARBs (Telmisartan) are CONTRAINDICATED in pregnancy — cause fetal renal failure.",
    messageAr: "مضادات ARB (تيلميسارتان) ممنوعة في الحمل.",
  },
  {
    pattern: "atorvastatin",
    severity: "danger",
    message: "Statins (Atorvastatin) are CONTRAINDICATED in pregnancy — inhibit fetal cholesterol synthesis.",
    messageAr: "الستاتينات (أتورفاستاتين) ممنوعة في الحمل — تعيق تطور الجنين.",
  },
  {
    pattern: "rosuvastatin",
    severity: "danger",
    message: "Statins (Rosuvastatin) are CONTRAINDICATED in pregnancy.",
    messageAr: "الستاتينات (روسوفاستاتين) ممنوعة في الحمل.",
  },
  {
    pattern: "simvastatin",
    severity: "danger",
    message: "Statins (Simvastatin) are CONTRAINDICATED in pregnancy.",
    messageAr: "الستاتينات (سيمفاستاتين) ممنوعة في الحمل.",
  },
  {
    pattern: "doxycycline",
    severity: "danger",
    message: "Doxycycline is CONTRAINDICATED in pregnancy — impairs fetal bone and tooth development.",
    messageAr: "دوكسيسيكلين ممنوع في الحمل — يؤثر على عظام وأسنان الجنين.",
  },
  {
    pattern: "ciprofloxacin",
    severity: "danger",
    message: "Ciprofloxacin (fluoroquinolone) should be avoided in pregnancy — potential fetal cartilage damage.",
    messageAr: "سيبروفلوكساسين: تجنب في الحمل — ضرر محتمل لغضاريف الجنين.",
  },
  {
    pattern: "levofloxacin",
    severity: "danger",
    message: "Levofloxacin (fluoroquinolone) should be avoided in pregnancy.",
    messageAr: "ليفوفلوكساسين: تجنب في الحمل.",
  },
  {
    pattern: "tramadol",
    severity: "danger",
    message: "Tramadol in pregnancy can cause neonatal withdrawal syndrome and respiratory depression at delivery.",
    messageAr: "الترامادول في الحمل يسبب أعراض انسحاب عند الوليد.",
  },
  {
    pattern: "ibuprofen",
    severity: "danger",
    message: "Ibuprofen (NSAID) should be avoided in pregnancy — causes premature ductus arteriosus closure in 3rd trimester.",
    messageAr: "الإيبوبروفين ممنوع خاصة في الثلث الأخير من الحمل — يغلق قناة الشريان المبكرة.",
  },
  {
    pattern: "pregabalin",
    severity: "danger",
    message: "Pregabalin: evidence of fetal harm — avoid throughout pregnancy.",
    messageAr: "بريغابالين: دليل على ضرر للجنين، تجنب في الحمل.",
  },
  {
    pattern: "fenofibrate",
    severity: "danger",
    message: "Fenofibrate is CONTRAINDICATED in pregnancy.",
    messageAr: "الفينوفيبرات ممنوع في الحمل.",
  },
  {
    pattern: "diazepam",
    severity: "warning",
    message: "Diazepam in pregnancy may cause neonatal sedation and withdrawal — use with caution, consult specialist.",
    messageAr: "الديازيبام في الحمل يسبب تخدير وأعراض انسحاب عند الوليد — استشارة متخصص.",
  },
  {
    pattern: "metronidazole",
    severity: "warning",
    message: "Metronidazole: avoid in first trimester — use with caution throughout pregnancy.",
    messageAr: "الميترونيدازول: تجنب في الثلث الأول، حذر في باقي فترة الحمل.",
  },
  {
    pattern: "amitriptyline",
    severity: "warning",
    message: "Amitriptyline: caution in pregnancy — neonatal symptoms reported. Consult specialist.",
    messageAr: "أميتريبتيلين: حذر في الحمل — استشارة متخصص ضرورية.",
  },
  {
    pattern: "sertraline",
    severity: "warning",
    message: "Sertraline (SSRI): caution in pregnancy — may cause neonatal adaptation syndrome. Discuss risk/benefit.",
    messageAr: "سيرترالين (SSRI): حذر في الحمل — متلازمة تكيف الوليد. ناقش المخاطر والفوائد.",
  },
];

// ── Allergy conflict check ────────────────────────────────────────────────────
export function checkAllergyAlert(
  med: MedicationOption,
  allergies: string | null
): DrugAlert | null {
  if (!allergies || allergies.toLowerCase() === "none" || !allergies.trim()) return null;
  const terms = allergies
    .toLowerCase()
    .split(/[,;/\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4);
  const medName = med.name.toLowerCase();
  const genName = (med.genericName ?? "").toLowerCase();
  for (const term of terms) {
    if (medName.includes(term) || genName.includes(term)) {
      return {
        severity: "danger",
        message: `Allergy conflict: patient has documented allergy "${allergies}" — verify safety of ${med.genericName ?? med.name}.`,
        messageAr: `تعارض مع الحساسية المسجلة: "${allergies}" — تحقق من سلامة ${med.genericName ?? med.name}.`,
        drugs: [med.name],
      };
    }
  }
  return null;
}

// ── Interaction check between all medications in the list ────────────────────
export function checkInteractions(meds: MedicationOption[]): DrugAlert[] {
  const alerts: DrugAlert[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < meds.length; i++) {
    for (let j = i + 1; j < meds.length; j++) {
      const a = meds[i];
      const b = meds[j];
      for (const pair of PAIRS) {
        const key = `${pair.a}|${pair.b}`;
        if (seen.has(key)) continue;
        if (
          (hit(a, pair.a) && hit(b, pair.b)) ||
          (hit(a, pair.b) && hit(b, pair.a))
        ) {
          seen.add(key);
          alerts.push({
            severity: pair.severity,
            message: pair.message,
            messageAr: pair.messageAr,
            drugs: [a.name, b.name],
          });
        }
      }
    }
  }
  return alerts;
}

// ── Pregnancy contraindication check ─────────────────────────────────────────
export function checkPregnancyAlerts(meds: MedicationOption[]): DrugAlert[] {
  const alerts: DrugAlert[] = [];
  for (const med of meds) {
    for (const entry of PREGNANCY) {
      if (hit(med, entry.pattern)) {
        alerts.push({
          severity: entry.severity,
          message: entry.message,
          messageAr: entry.messageAr,
          drugs: [med.name],
        });
        break;
      }
    }
  }
  return alerts;
}
