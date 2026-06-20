import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./lib/logger";

export async function runStartupSeed(): Promise<void> {
  logger.info("Running startup seed checks…");
  await seedHaadCatalogue();
  await seedMedications();
  await seedPharmacies();
  await seedDoctorCoords();
  await seedFeeSchedule();
  logger.info("Startup seed complete.");
}

// ── HAAD / CPT Activity Catalogue ─────────────────────────────────────────────
async function seedHaadCatalogue(): Promise<void> {
  const res1 = await db.execute<{ count: string }>(
    sql`SELECT count(*)::text AS count FROM haad_activity_catalogue`
  );
  if (parseInt(res1.rows[0].count) >= 100) {
    logger.info("HAAD catalogue already seeded, skipping.");
    return;
  }
  logger.info("Seeding HAAD activity catalogue…");
  await db.execute(sql`
    INSERT INTO haad_activity_catalogue (id, code, description, description_ar, category, unit_price) VALUES
    (1,'99201','Office visit, new patient, straightforward','زيارة مكتب، مريض جديد، مستوى بسيط','consultation','150.00'),
    (2,'99202','Office visit, new patient, low complexity','زيارة مكتب، مريض جديد، تعقيد منخفض','consultation','200.00'),
    (3,'99203','Office visit, new patient, moderate complexity','زيارة مكتب، مريض جديد، تعقيد متوسط','consultation','280.00'),
    (4,'99204','Office visit, new patient, moderate-high complexity','زيارة مكتب، مريض جديد، تعقيد مرتفع متوسط','consultation','380.00'),
    (5,'99205','Office visit, new patient, high complexity','زيارة مكتب، مريض جديد، تعقيد عالي','consultation','480.00'),
    (6,'99211','Office visit, established patient, minimal','زيارة متابعة، مستوى أدنى','consultation','80.00'),
    (7,'99212','Office visit, established patient, straightforward','زيارة متابعة، مستوى بسيط','consultation','130.00'),
    (8,'99213','Office visit, established patient, low complexity','زيارة متابعة، تعقيد منخفض','consultation','180.00'),
    (9,'99214','Office visit, established patient, moderate complexity','زيارة متابعة، تعقيد متوسط','consultation','260.00'),
    (10,'99215','Office visit, established patient, high complexity','زيارة متابعة، تعقيد عالي','consultation','380.00'),
    (11,'99221','Hospital admission, low severity','دخول المستشفى، شدة منخفضة','consultation','500.00'),
    (12,'99222','Hospital admission, moderate severity','دخول المستشفى، شدة متوسطة','consultation','700.00'),
    (13,'99223','Hospital admission, high severity','دخول المستشفى، شدة عالية','consultation','950.00'),
    (14,'99231','Subsequent hospital care, low complexity','متابعة مستشفى، تعقيد منخفض','consultation','280.00'),
    (15,'99232','Subsequent hospital care, moderate complexity','متابعة مستشفى، تعقيد متوسط','consultation','380.00'),
    (16,'99233','Subsequent hospital care, high complexity','متابعة مستشفى، تعقيد عالي','consultation','500.00'),
    (17,'99243','Office consultation, low complexity','استشارة مكتبية، تعقيد منخفض','consultation','350.00'),
    (18,'99244','Office consultation, moderate complexity','استشارة مكتبية، تعقيد متوسط','consultation','500.00'),
    (19,'99245','Office consultation, high complexity','استشارة مكتبية، تعقيد عالي','consultation','680.00'),
    (20,'93000','ECG routine with at least 12 leads, with interpretation','تخطيط القلب الكهربائي مع التفسير','procedure','120.00'),
    (21,'93005','ECG tracing only','تخطيط القلب — رسم فقط','procedure','60.00'),
    (22,'93010','ECG interpretation and report only','تفسير تخطيط القلب فقط','procedure','70.00'),
    (23,'93306','Echocardiography with spectral & color Doppler','تخطيط صدى القلب مع دوبلر ملون','procedure','650.00'),
    (24,'93320','Doppler echocardiography study','تخطيط صدى القلب بالدوبلر','procedure','400.00'),
    (25,'93015','Cardiovascular stress test (exercise)','اختبار الجهد القلبي','procedure','450.00'),
    (26,'93040','Rhythm ECG 1-3 leads with interpretation','رسم إيقاع قلبي 1-3 مشتقات','procedure','80.00'),
    (27,'93224','Holter monitoring, up to 48 hours','مراقبة هولتر حتى 48 ساعة','procedure','380.00'),
    (28,'93880','Carotid duplex scan, bilateral','فحص دوبلكس الشريان السباتي','procedure','500.00'),
    (29,'36415','Routine venipuncture (blood draw)','أخذ عينة دم وريدي','procedure','30.00'),
    (30,'94760','Pulse oximetry, single determination','قياس تشبع الأكسجين','procedure','25.00'),
    (31,'94761','Pulse oximetry, multiple determinations','قياس تشبع الأكسجين — متعدد','procedure','45.00'),
    (32,'94010','Spirometry (breathing test)','اختبار وظائف الرئة (سبيرومتري)','procedure','180.00'),
    (33,'94640','Inhalation treatment (nebulization)','علاج استنشاقي (بخاخ)','procedure','90.00'),
    (34,'10060','Incision & drainage of abscess, simple','شق وصرف خراج بسيط','procedure','350.00'),
    (35,'12001','Simple wound repair up to 2.5 cm','إصلاح جرح بسيط حتى 2.5 سم','procedure','250.00'),
    (36,'12002','Simple wound repair 2.6-7.5 cm','إصلاح جرح بسيط 2.6-7.5 سم','procedure','350.00'),
    (37,'69210','Removal of impacted cerumen (ear wax), one ear','إزالة شمع الأذن المتراكم','procedure','120.00'),
    (38,'90471','Immunization administration (injection)','إعطاء التطعيم (حقن)','procedure','50.00'),
    (39,'96372','Therapeutic injection, subcutaneous/intramuscular','حقن علاجي تحت الجلد أو عضلي','procedure','60.00'),
    (40,'96374','Intravenous push injection','حقن وريدي مباشر','procedure','80.00'),
    (41,'96365','IV infusion, initial up to 1 hour','تسريب وريدي، ساعة أولى','procedure','150.00'),
    (42,'96366','IV infusion, each additional hour','تسريب وريدي، كل ساعة إضافية','procedure','80.00'),
    (43,'97010','Hot or cold pack application','تطبيق الحرارة أو البرودة','procedure','40.00'),
    (44,'85025','Complete blood count (CBC) with differential','صورة دم كاملة مع التفريق','laboratory','50.00'),
    (45,'85027','Complete blood count (CBC) without differential','صورة دم كاملة بدون تفريق','laboratory','40.00'),
    (46,'80053','Comprehensive metabolic panel (CMP)','لوحة الكيمياء الحيوية الشاملة','laboratory','120.00'),
    (47,'80048','Basic metabolic panel (BMP)','لوحة الكيمياء الحيوية الأساسية','laboratory','80.00'),
    (48,'80061','Lipid panel (cholesterol, HDL, LDL, triglycerides)','لوحة الدهون (كوليسترول وشحوم)','laboratory','90.00'),
    (49,'82947','Glucose, quantitative','سكر الدم الكمي','laboratory','25.00'),
    (50,'82950','Glucose post-glucose dose','سكر الدم بعد الجلوكوز','laboratory','30.00'),
    (51,'83036','Hemoglobin A1c (HbA1c)','السكر التراكمي (HbA1c)','laboratory','55.00'),
    (52,'84443','Thyroid stimulating hormone (TSH)','هرمون تحفيز الغدة الدرقية (TSH)','laboratory','70.00'),
    (53,'84480','Triiodothyronine (T3), total','هرمون الغدة الدرقية T3','laboratory','65.00'),
    (54,'84436','Thyroxine (T4), total','هرمون الغدة الدرقية T4','laboratory','65.00'),
    (55,'82728','Ferritin','الفيريتين (مخزون الحديد)','laboratory','60.00'),
    (56,'82310','Calcium, total','الكالسيوم الكلي','laboratory','30.00'),
    (57,'84100','Phosphorus','الفسفور','laboratory','30.00'),
    (58,'82570','Creatinine, urine','كرياتينين البول','laboratory','30.00'),
    (59,'82565','Creatinine, blood','كرياتينين الدم','laboratory','35.00'),
    (60,'84520','Urea nitrogen (BUN), quantitative','اليوريا (BUN)','laboratory','30.00'),
    (61,'84550','Uric acid, blood','حمض البوليك (الجاوت)','laboratory','35.00'),
    (62,'86140','C-reactive protein (CRP)','بروتين سي التفاعلي (CRP)','laboratory','45.00'),
    (63,'86200','CCP antibody (rheumatoid arthritis)','أجسام CCP (الروماتويد)','laboratory','120.00'),
    (64,'86431','Rheumatoid factor (RF), quantitative','عامل الروماتويد الكمي','laboratory','50.00'),
    (65,'85610','Prothrombin time (PT/INR)','وقت البروثرومبين (PT/INR)','laboratory','45.00'),
    (66,'85730','Thromboplastin time, partial (APTT)','وقت الثرومبوبلاستين الجزئي (APTT)','laboratory','45.00'),
    (67,'86592','Syphilis test, qualitative (RPR/VDRL)','اختبار الزهري النوعي','laboratory','40.00'),
    (68,'86703','HIV-1 and HIV-2, single result','فيروس نقص المناعة HIV-1 و HIV-2','laboratory','70.00'),
    (69,'87491','Chlamydia trachomatis, nucleic acid amplification','كلاميديا، تضخيم الحمض النووي','laboratory','150.00'),
    (70,'81001','Urinalysis with microscopy','تحليل البول مع المجهر','laboratory','45.00'),
    (71,'81003','Urinalysis, automated without microscopy','تحليل البول الآلي','laboratory','30.00'),
    (72,'87086','Urine culture','زراعة البول','laboratory','80.00'),
    (73,'87070','Culture, bacterial, any source','زراعة جرثومية','laboratory','90.00'),
    (74,'83735','Magnesium','المغنيسيوم','laboratory','35.00'),
    (75,'82607','Vitamin B12 (Cobalamin)','فيتامين B12','laboratory','65.00'),
    (76,'82306','Vitamin D (25-hydroxyvitamin D)','فيتامين د (25-هيدروكسي)','laboratory','75.00'),
    (77,'84702','Gonadotropin, chorionic (HCG), quantitative','هرمون الحمل الكمي (HCG)','laboratory','60.00'),
    (78,'82105','Alpha-fetoprotein (AFP)','بروتين ألفا الجنيني (AFP)','laboratory','80.00'),
    (79,'86316A','CA 19-9 (tumour marker)','علامة الورم CA 19-9','laboratory','120.00'),
    (80,'86300','CA 125 (ovarian tumour marker)','علامة ورم المبيض CA 125','laboratory','120.00'),
    (81,'86316B','CA 15-3 (breast tumour marker)','علامة سرطان الثدي CA 15-3','laboratory','120.00'),
    (82,'86316C','PSA, total (prostate specific antigen)','مستضد البروستاتا النوعي الكلي (PSA)','laboratory','85.00'),
    (83,'80076','Hepatic function panel (LFTs)','وظائف الكبد','laboratory','90.00'),
    (84,'86803','Hepatitis C antibody (HCV Ab)','أجسام فيروس الكبد C','laboratory','80.00'),
    (85,'87340','Hepatitis B surface antigen (HBsAg)','مستضد فيروس الكبد B السطحي','laboratory','60.00'),
    (86,'86706','Hepatitis B surface antibody (HBsAb)','أجسام فيروس الكبد B السطحية','laboratory','60.00'),
    (87,'84153','PSA free','مستضد البروستاتا الحر (PSA Free)','laboratory','85.00'),
    (88,'82043','Albumin, urine (microalbumin)','الألبومين في البول (بروتين دقيق)','laboratory','55.00'),
    (89,'83021','Hemoglobin electrophoresis','رحلان الهيموغلوبين','laboratory','120.00'),
    (90,'71046','X-ray, chest, 2 views (PA and lateral)','أشعة الصدر، وضعيتان','radiology','150.00'),
    (91,'71045','X-ray, chest, 1 view','أشعة الصدر، وضعية واحدة','radiology','100.00'),
    (92,'72040','X-ray, cervical spine, 2-3 views','أشعة العمود الفقري العنقي','radiology','150.00'),
    (93,'72110','X-ray, lumbar spine, minimum 4 views','أشعة العمود الفقري القطني','radiology','160.00'),
    (94,'73030','X-ray, shoulder, minimum 2 views','أشعة الكتف','radiology','130.00'),
    (95,'73100','X-ray, wrist, minimum 2 views','أشعة الرسغ','radiology','130.00'),
    (96,'73560','X-ray, knee, 2 views','أشعة الركبة','radiology','130.00'),
    (97,'73600','X-ray, ankle, minimum 2 views','أشعة الكاحل','radiology','130.00'),
    (98,'73650','X-ray, calcaneus (heel), minimum 2 views','أشعة عظمة الكعب','radiology','120.00'),
    (99,'73031','X-ray, hand, minimum 3 views','أشعة اليد','radiology','120.00'),
    (100,'74177','CT abdomen and pelvis with contrast','أشعة مقطعية بطن وحوض مع صبغة','radiology','900.00'),
    (101,'74178','CT abdomen and pelvis without and with contrast','أشعة مقطعية بطن مع وبدون صبغة','radiology','1100.00'),
    (102,'71250','CT thorax (chest) without contrast','أشعة مقطعية صدر بدون صبغة','radiology','700.00'),
    (103,'71260','CT thorax (chest) with contrast','أشعة مقطعية صدر مع صبغة','radiology','900.00'),
    (104,'70450','CT head/brain without contrast','أشعة مقطعية الدماغ بدون صبغة','radiology','600.00'),
    (105,'70460','CT head/brain with contrast','أشعة مقطعية الدماغ مع صبغة','radiology','800.00'),
    (106,'70553','MRI brain without and with contrast','رنين مغناطيسي الدماغ مع وبدون صبغة','radiology','1400.00'),
    (107,'72148','MRI lumbar spine without contrast','رنين مغناطيسي العمود الفقري القطني','radiology','1200.00'),
    (108,'72141','MRI cervical spine without contrast','رنين مغناطيسي العمود الفقري العنقي','radiology','1200.00'),
    (109,'73721','MRI knee joint without contrast','رنين مغناطيسي الركبة','radiology','1100.00'),
    (110,'76700','Ultrasound abdomen, complete','سونار البطن الكامل','radiology','350.00'),
    (111,'76705','Ultrasound abdomen, limited','سونار البطن المحدود','radiology','220.00'),
    (112,'76536','Ultrasound soft tissue neck (thyroid)','سونار الغدة الدرقية','radiology','280.00'),
    (113,'76770','Ultrasound retroperitoneal (kidneys/aorta)','سونار الكلى والأورطي','radiology','300.00'),
    (114,'76856','Ultrasound pelvis, complete','سونار الحوض الكامل','radiology','300.00'),
    (115,'76870','Ultrasound scrotum','سونار كيس الصفن','radiology','280.00'),
    (116,'93881','Duplex scan of extracranial arteries, bilateral','فحص دوبلكس الشرايين خارج الجمجمة','radiology','500.00'),
    (117,'93971','Duplex scan lower extremity veins, unilateral','فحص دوبلكس أوردة الأطراف السفلية','radiology','450.00'),
    (118,'N99211','Nurse visit / triage assessment','زيارة تمريضية / تقييم الفرز','nursing','60.00'),
    (119,'A4550','Dressing change, simple','تغيير ضمادة بسيطة','nursing','50.00'),
    (120,'A6216','Gauze dressing, sterile, application','تطبيق ضمادة شاش معقمة','nursing','40.00'),
    (121,'99000','Handling/conveyance of specimen','تحضير ونقل العينة','nursing','20.00'),
    (122,'G0008','Influenza vaccine administration','إعطاء لقاح الإنفلونزا','nursing','45.00'),
    (123,'G0009','Pneumococcal vaccine administration','إعطاء لقاح المكورات الرئوية','nursing','45.00'),
    (124,'97001','Physical therapy evaluation','تقييم العلاج الطبيعي','physiotherapy','250.00'),
    (125,'97014','Electrical stimulation (e-stim)','تحفيز كهربائي','physiotherapy','120.00'),
    (126,'97018','Paraffin bath','حمام شمع البارافين','physiotherapy','80.00'),
    (127,'97022','Whirlpool therapy','العلاج بالدوامة المائية','physiotherapy','100.00'),
    (128,'97032','Application of modality — electrical stimulation','العلاج بالتيار الكهربائي','physiotherapy','100.00'),
    (129,'97110','Therapeutic exercises','تمارين علاجية','physiotherapy','150.00'),
    (130,'97112','Neuromuscular reeducation','إعادة التعليم العصبي العضلي','physiotherapy','150.00'),
    (131,'97116','Gait training','تدريب المشية','physiotherapy','130.00'),
    (132,'97140','Manual therapy techniques','تقنيات العلاج اليدوي','physiotherapy','180.00'),
    (133,'97150','Therapeutic procedure group','إجراء علاجي جماعي','physiotherapy','80.00')
    ON CONFLICT (id) DO NOTHING
  `);
  logger.info("HAAD catalogue seeded (133 rows).");
  await db.execute(sql`SELECT setval('haad_activity_catalogue_id_seq', 133, true)`);
}

// ── Medications ───────────────────────────────────────────────────────────────
async function seedMedications(): Promise<void> {
  const res2 = await db.execute<{ count: string }>(
    sql`SELECT count(*)::text AS count FROM medications`
  );
  if (parseInt(res2.rows[0].count) >= 70) {
    logger.info("Medications already seeded, skipping.");
    return;
  }
  logger.info("Seeding medications…");
  await db.execute(sql`
    INSERT INTO medications (id, name, generic_name, category, dosage_form, strength, manufacturer, description, requires_prescription) VALUES
    (1,'Panadol','Paracetamol','Analgesic','Tablet','500mg','GlaxoSmithKline','Pain reliever and fever reducer',false),
    (2,'Augmentin','Amoxicillin/Clavulanate','Antibiotic','Tablet','625mg','GlaxoSmithKline','Broad-spectrum antibiotic',true),
    (3,'Amlodipine','Amlodipine Besylate','Antihypertensive','Tablet','5mg','Pfizer','Calcium channel blocker for hypertension',true),
    (4,'Metformin','Metformin Hydrochloride','Antidiabetic','Tablet','500mg','Merck','First-line medication for type 2 diabetes',true),
    (5,'Omeprazole','Omeprazole','Antacid','Capsule','20mg','AstraZeneca','Proton pump inhibitor for acid reflux',true),
    (6,'Salbutamol','Salbutamol Sulfate','Bronchodilator','Inhaler','100mcg/dose','GSK','Quick-relief inhaler for asthma',true),
    (7,'Ibuprofen','Ibuprofen','NSAID','Tablet','400mg','Reckitt','Anti-inflammatory pain reliever',false),
    (8,'Atorvastatin','Atorvastatin Calcium','Statin','Tablet','20mg','Pfizer','Cholesterol-lowering medication',true),
    (9,'Concor','Bisoprolol Fumarate','Beta-blocker','Tablet','5mg',NULL,NULL,true),
    (10,'Ramipril','Ramipril','ACE Inhibitor','Capsule','5mg',NULL,NULL,true),
    (11,'Losartan','Losartan Potassium','ARB','Tablet','50mg',NULL,NULL,true),
    (12,'Lasix','Furosemide','Loop Diuretic','Tablet','40mg',NULL,NULL,true),
    (13,'Aspirin','Acetylsalicylic Acid','Antiplatelet','Tablet','75mg',NULL,NULL,false),
    (14,'Plavix','Clopidogrel','Antiplatelet','Tablet','75mg',NULL,NULL,true),
    (15,'Warfarin','Warfarin Sodium','Anticoagulant','Tablet','5mg',NULL,NULL,true),
    (16,'Digoxin','Digoxin','Cardiac Glycoside','Tablet','0.25mg',NULL,NULL,true),
    (17,'Diltiazem','Diltiazem Hydrochloride','Calcium Channel Blocker','Tablet','60mg',NULL,NULL,true),
    (18,'Amoxil','Amoxicillin','Antibiotic','Capsule','500mg',NULL,NULL,true),
    (19,'Azithromycin','Azithromycin','Antibiotic','Tablet','500mg',NULL,NULL,true),
    (20,'Ciprofloxacin','Ciprofloxacin Hydrochloride','Antibiotic','Tablet','500mg',NULL,NULL,true),
    (21,'Doxycycline','Doxycycline Hyclate','Antibiotic','Capsule','100mg',NULL,NULL,true),
    (22,'Metronidazole','Metronidazole','Antibiotic/Antiprotozoal','Tablet','400mg',NULL,NULL,true),
    (23,'Cefuroxime','Cefuroxime Axetil','Antibiotic','Tablet','500mg',NULL,NULL,true),
    (24,'Levofloxacin','Levofloxacin','Antibiotic','Tablet','500mg',NULL,NULL,true),
    (25,'Januvia','Sitagliptin','Antidiabetic (DPP-4)','Tablet','100mg',NULL,NULL,true),
    (26,'Glucophage','Metformin Hydrochloride','Antidiabetic','Tablet','1000mg',NULL,NULL,true),
    (27,'Lantus','Insulin Glargine','Insulin','Injection','100 IU/mL',NULL,NULL,true),
    (28,'Victoza','Liraglutide','GLP-1 Agonist','Injection','1.2mg',NULL,NULL,true),
    (29,'Daonil','Glibenclamide','Antidiabetic (Sulfonylurea)','Tablet','5mg',NULL,NULL,true),
    (30,'Jardiance','Empagliflozin','SGLT-2 Inhibitor','Tablet','10mg',NULL,NULL,true),
    (31,'Crestor','Rosuvastatin Calcium','Statin','Tablet','10mg',NULL,NULL,true),
    (32,'Zocor','Simvastatin','Statin','Tablet','20mg',NULL,NULL,true),
    (33,'Fenofibrate','Fenofibrate','Fibrate','Tablet','145mg',NULL,NULL,true),
    (34,'Seretide','Salmeterol/Fluticasone','Inhaled Corticosteroid + LABA','Inhaler','25/250mcg',NULL,NULL,true),
    (35,'Spiriva','Tiotropium Bromide','Anticholinergic Bronchodilator','Inhaler','18mcg',NULL,NULL,true),
    (36,'Prednisone','Prednisone','Corticosteroid','Tablet','20mg',NULL,NULL,true),
    (37,'Montelukast','Montelukast Sodium','Leukotriene Antagonist','Tablet','10mg',NULL,NULL,true),
    (38,'Fexofenadine','Fexofenadine Hydrochloride','Antihistamine','Tablet','120mg',NULL,NULL,false),
    (39,'Loratadine','Loratadine','Antihistamine','Tablet','10mg',NULL,NULL,false),
    (40,'Cetirizine','Cetirizine Dihydrochloride','Antihistamine','Tablet','10mg',NULL,NULL,false),
    (41,'Nexium','Esomeprazole Magnesium','PPI','Capsule','40mg',NULL,NULL,true),
    (42,'Pantoprazole','Pantoprazole Sodium','PPI','Tablet','40mg',NULL,NULL,true),
    (43,'Motilium','Domperidone','Prokinetic','Tablet','10mg',NULL,NULL,true),
    (44,'Ondansetron','Ondansetron Hydrochloride','Antiemetic','Tablet','8mg',NULL,NULL,true),
    (45,'Loperamide','Loperamide Hydrochloride','Antidiarrheal','Capsule','2mg',NULL,NULL,false),
    (46,'Lactulose','Lactulose','Laxative','Solution','10g/15mL',NULL,NULL,false),
    (47,'Diazepam','Diazepam','Benzodiazepine','Tablet','5mg',NULL,NULL,true),
    (48,'Amitriptyline','Amitriptyline Hydrochloride','Tricyclic Antidepressant','Tablet','25mg',NULL,NULL,true),
    (49,'Sertraline','Sertraline Hydrochloride','SSRI','Tablet','50mg',NULL,NULL,true),
    (50,'Pregabalin','Pregabalin','Anticonvulsant/Analgesic','Capsule','75mg',NULL,NULL,true),
    (51,'Tramadol','Tramadol Hydrochloride','Opioid Analgesic','Capsule','50mg',NULL,NULL,true),
    (52,'Eltroxin','Levothyroxine Sodium','Thyroid Hormone','Tablet','100mcg',NULL,NULL,true),
    (53,'Ferrous Sulfate','Ferrous Sulfate','Iron Supplement','Tablet','200mg',NULL,NULL,false),
    (54,'Vitamin D3','Cholecalciferol','Vitamin Supplement','Capsule','1000 IU',NULL,NULL,false),
    (55,'Folic Acid','Folic Acid','Vitamin Supplement','Tablet','5mg',NULL,NULL,false),
    (56,'Calcium Carbonate','Calcium Carbonate','Mineral Supplement','Tablet','500mg',NULL,NULL,false),
    (57,'Betamethasone','Betamethasone Valerate','Topical Corticosteroid','Cream','0.1%',NULL,NULL,true),
    (58,'Mupirocin','Mupirocin','Topical Antibiotic','Ointment','2%',NULL,NULL,true),
    (59,'Strepsils','Dichlorobenzyl Alcohol + Amylmetacresol','Throat Antiseptic','Lozenge','1.2mg/0.6mg',NULL,'Antiseptic throat lozenge for sore throat and mouth infections',false),
    (60,'Difflam','Benzydamine Hydrochloride','Throat Anti-inflammatory','Spray/Gargle','0.15%',NULL,'Anti-inflammatory analgesic for throat and mouth pain',false),
    (61,'Clarithromycin','Clarithromycin','Antibiotic','Tablet','500mg',NULL,'Macrolide antibiotic for throat, chest and skin infections',true),
    (62,'Penicillin V','Phenoxymethylpenicillin','Antibiotic','Tablet','250mg / 500mg',NULL,'First-line antibiotic for streptococcal throat infections',true),
    (63,'Erythromycin','Erythromycin Stearate','Antibiotic','Tablet','250mg / 500mg',NULL,'Macrolide antibiotic, alternative for penicillin-allergic patients',true),
    (64,'Septrin','Trimethoprim + Sulfamethoxazole','Antibiotic','Tablet','80mg/400mg',NULL,'Sulfonamide combination antibiotic for respiratory and urinary infections',true),
    (65,'Ceftriaxone','Ceftriaxone Sodium','Antibiotic','Injection','1g / 2g',NULL,'Third-generation cephalosporin for severe bacterial infections',true),
    (66,'Gentamicin','Gentamicin Sulfate','Antibiotic','Injection','80mg/2ml',NULL,'Aminoglycoside antibiotic for serious gram-negative infections',true),
    (67,'Flucloxacillin','Flucloxacillin Sodium','Antibiotic','Capsule','250mg / 500mg',NULL,'Beta-lactam antibiotic for staphylococcal infections',true),
    (68,'Valsartan','Valsartan','ARB','Tablet','80mg / 160mg',NULL,'Angiotensin II receptor blocker for hypertension and heart failure',true),
    (69,'Lisinopril','Lisinopril','ACE Inhibitor','Tablet','5mg / 10mg',NULL,'ACE inhibitor for hypertension, heart failure and diabetic nephropathy',true),
    (70,'Hydrochlorothiazide','Hydrochlorothiazide','Thiazide Diuretic','Tablet','25mg / 50mg',NULL,'Thiazide diuretic for hypertension and oedema',true),
    (71,'Nifedipine','Nifedipine','Calcium Channel Blocker','Tablet','10mg / 30mg',NULL,'Calcium channel blocker for hypertension and angina',true),
    (72,'Nebivolol','Nebivolol Hydrochloride','Beta-blocker','Tablet','5mg',NULL,'Selective beta-1 blocker with vasodilatory properties',true),
    (73,'Indapamide','Indapamide','Thiazide-like Diuretic','Tablet','1.5mg / 2.5mg',NULL,'Thiazide-like diuretic for hypertension',true),
    (74,'Telmisartan','Telmisartan','ARB','Tablet','40mg / 80mg',NULL,'Long-acting ARB for hypertension and cardiovascular protection',true),
    (75,'Aspirin EC','Acetylsalicylic Acid','Antiplatelet','Tablet','100mg (EC)',NULL,'Enteric-coated low-dose aspirin for antiplatelet therapy',true),
    (76,'Aspirin 500mg','Acetylsalicylic Acid','Analgesic/Antipyretic','Tablet','500mg',NULL,'Full-dose aspirin for pain relief and fever',false)
    ON CONFLICT (id) DO NOTHING
  `);
  logger.info("Medications seeded (76 rows).");
  await db.execute(sql`SELECT setval('medications_id_seq', 76, true)`);
}

// ── Pharmacies ────────────────────────────────────────────────────────────────
async function seedPharmacies(): Promise<void> {
  const res3 = await db.execute<{ count: string }>(
    sql`SELECT count(*)::text AS count FROM pharmacies`
  );
  if (parseInt(res3.rows[0].count) >= 5) {
    logger.info("Pharmacies already seeded, skipping.");
    return;
  }
  logger.info("Seeding pharmacies…");
  await db.execute(sql`
    INSERT INTO pharmacies (name, address, phone, latitude, longitude, is_open_24h) VALUES
    ('Al Ain Pharmacy','Al Nahyan Camp, Abu Dhabi','+971-2-441-1234',24.450000,54.370000,false),
    ('Medcare Pharmacy','Corniche Road, Abu Dhabi','+971-2-626-5678',24.465000,54.385000,true),
    ('Life Pharmacy','Khalidiyah Mall, Abu Dhabi','+971-2-665-9012',24.440000,54.360000,false),
    ('NMC Royal Pharmacy','Khalifa City A, Abu Dhabi','+971-2-819-3456',24.475000,54.395000,true),
    ('Aster Pharmacy','Mussafah Industrial, Abu Dhabi','+971-2-555-7890',24.430000,54.410000,false),
    ('Boots Pharmacy','Marina Mall, Abu Dhabi','+971-2-681-2345',24.460000,54.340000,false),
    ('Al Nahdi Pharmacy','Al Muroor Road, Abu Dhabi','+971-2-443-6789',24.480000,54.370000,true),
    ('Bin Sina Pharmacy','Tourist Club Area, Abu Dhabi','+971-2-672-0123',24.420000,54.380000,false),
    ('Care Pharmacy','Airport Road, Abu Dhabi','+971-2-449-4567',24.470000,54.420000,false),
    ('Gulf Drug Store','Al Khalidiyah, Abu Dhabi','+971-2-666-8901',24.445000,54.350000,false)
  `);
  logger.info("Pharmacies seeded (10 rows).");

  logger.info("Seeding pharmacy inventory…");
  await db.execute(sql`
    INSERT INTO pharmacy_inventory (pharmacy_id, medication_id, in_stock, quantity)
    SELECT p.id, m.id, true, (50 + (m.id * 7 + p.id * 13) % 150)
    FROM pharmacies p CROSS JOIN medications m
    WHERE m.id BETWEEN 1 AND 58
    ON CONFLICT (pharmacy_id, medication_id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO pharmacy_inventory (pharmacy_id, medication_id, in_stock, quantity)
    SELECT p.id, m.id, true, (20 + (m.id * 5 + p.id * 11) % 80)
    FROM pharmacies p CROSS JOIN medications m
    WHERE m.id BETWEEN 59 AND 76
    ON CONFLICT (pharmacy_id, medication_id) DO NOTHING
  `);
  logger.info("Pharmacy inventory seeded.");
}

// ── Doctor coordinates ────────────────────────────────────────────────────────
async function seedDoctorCoords(): Promise<void> {
  const res4 = await db.execute<{ count: string }>(
    sql`SELECT count(*)::text AS count FROM doctors WHERE latitude IS NOT NULL`
  );
  if (parseInt(res4.rows[0].count) >= 3) {
    logger.info("Doctor coordinates already seeded, skipping.");
    return;
  }
  logger.info("Seeding doctor coordinates…");
  await db.execute(sql`
    UPDATE doctors SET
      latitude = CASE id
        WHEN 1 THEN 24.4539
        WHEN 2 THEN 24.4688
        WHEN 3 THEN 24.4400
        WHEN 4 THEN 24.4750
        WHEN 5 THEN 24.4600
        ELSE latitude
      END,
      longitude = CASE id
        WHEN 1 THEN 54.3773
        WHEN 2 THEN 54.3645
        WHEN 3 THEN 54.3900
        WHEN 4 THEN 54.3500
        WHEN 5 THEN 54.4000
        ELSE longitude
      END,
      clinic_address = CASE id
        WHEN 1 THEN 'Al Khalidiyah Medical Centre, Abu Dhabi'
        WHEN 2 THEN 'Corniche Hospital, Abu Dhabi'
        WHEN 3 THEN 'Al Ain Road Clinic, Abu Dhabi'
        WHEN 4 THEN 'Khalifa City Medical Centre, Abu Dhabi'
        WHEN 5 THEN 'Airport Road Specialist Clinic, Abu Dhabi'
        ELSE clinic_address
      END
    WHERE id BETWEEN 1 AND 5 AND latitude IS NULL
  `);
  logger.info("Doctor coordinates seeded.");
}

// ── Default Doctor Fee Schedule ────────────────────────────────────────────────
async function seedFeeSchedule(): Promise<void> {
  const res = await db.execute<{ count: string }>(
    sql`SELECT count(*)::text AS count FROM doctor_categories`
  );
  if (parseInt(res.rows[0].count) > 0) {
    logger.info("Fee schedule already seeded, skipping.");
    return;
  }
  logger.info("Seeding default doctor fee schedule…");
  await db.execute(sql`
    INSERT INTO doctor_categories (name, description, consultation_fee, sort_order, is_active) VALUES
    ('General Practitioner', 'GP — primary care consultations', '100.00', 1, true),
    ('Specialist', 'Specialist-level consultations', '200.00', 2, true),
    ('Senior Specialist', 'Senior specialist with advanced expertise', '350.00', 3, true),
    ('Consultant', 'Consultant-grade — highest clinical tier', '500.00', 4, true)
    ON CONFLICT DO NOTHING
  `);
  logger.info("Default fee schedule seeded.");
}
