import { Router, type IRouter } from "express";
import { requireAuth, requireRole, getSessionUser } from "../lib/session";
import { getOpenAI } from "../lib/openai";
import { consultationsTable, patientsTable, medicationsTable, prescriptionItemsTable, prescriptionsTable } from "@workspace/db";
import { getDb } from "../lib/tenant";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

function requireAI(req: any, res: any, next: any) {
  const user = getSessionUser(req);
  if (!user?.aiAssistantEnabled) {
    res.status(403).json({ error: "AI Assistant is not enabled for your account. Please contact your administrator." });
    return;
  }
  next();
}

const DiagnoseBody = z.object({
  chiefComplaint: z.string(),
  vitals: z.string().optional(),
  patientAge: z.number().optional(),
  patientGender: z.string().optional(),
  patientAllergies: z.string().optional(),
  longTermConditions: z.string().optional(),
  currentMedications: z.string().optional(),
  notes: z.string().optional(),
});

router.post("/ai/diagnose", requireAuth, requireRole("doctor"), requireAI, async (req, res): Promise<void> => {
  const parsed = DiagnoseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const d = parsed.data;
  const prompt = `You are a clinical decision support AI assisting a licensed physician. Analyze the following patient presentation and provide structured clinical guidance.

Patient Information:
- Age: ${d.patientAge ?? "Unknown"}
- Gender: ${d.patientGender ?? "Unknown"}
- Known Allergies: ${d.patientAllergies || "None reported"}
- Long-term Conditions: ${d.longTermConditions || "None reported"}
- Current Medications: ${d.currentMedications || "None"}

Chief Complaint: ${d.chiefComplaint}
Vitals: ${d.vitals || "Not provided"}
Additional Notes: ${d.notes || "None"}

Provide a structured response in JSON with these fields:
{
  "possibleDiagnoses": [
    { "name": string, "icdCode": string, "likelihood": "high|medium|low", "reasoning": string }
  ],
  "recommendedTests": [
    { "type": "lab|xray|ct|mri|ultrasound|ecg|mammogram|other", "name": string, "reason": string, "priority": "stat|urgent|routine" }
  ],
  "clinicalPearls": [string],
  "redFlags": [string],
  "confidenceLevel": "high|medium|low",
  "disclaimer": "Clinical decision support only. Always apply professional judgment."
}

If the presentation is clear, provide 2-3 ranked diagnoses. If unclear, provide 3-5 and emphasize recommended tests. Always include relevant red flags.`;

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      max_tokens: 2000,
      messages: [
        { role: "system", content: "You are a clinical decision support system. Always respond with valid JSON only, no markdown fences." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content ?? "{}";
    const result = JSON.parse(content);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: "AI analysis failed", detail: err.message });
  }
});

const PrescriptionAssistBody = z.object({
  consultationId: z.number().optional(),
  diagnosis: z.string(),
  chiefComplaint: z.string().optional(),
  patientAge: z.number().optional(),
  patientGender: z.string().optional(),
  patientAllergies: z.string().optional(),
  longTermConditions: z.string().optional(),
  currentMedications: z.string().optional(),
  currentRxItems: z.array(z.object({
    name: z.string(),
    dosage: z.string().optional(),
    frequency: z.string().optional(),
    duration: z.string().optional(),
  })).optional(),
});

router.post("/ai/prescription-assist", requireAuth, requireRole("doctor"), requireAI, async (req, res): Promise<void> => {
  const parsed = PrescriptionAssistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const d = parsed.data;
  const currentRxText = d.currentRxItems?.length
    ? d.currentRxItems.map((item) => `- ${item.name} ${item.dosage ?? ""} ${item.frequency ?? ""} ${item.duration ?? ""}`).join("\n")
    : "None";

  const prompt = `You are a clinical pharmacology AI assisting a licensed physician with prescription decisions.

Patient:
- Age: ${d.patientAge ?? "Unknown"}
- Gender: ${d.patientGender ?? "Unknown"}
- Allergies: ${d.patientAllergies || "None"}
- Long-term conditions: ${d.longTermConditions || "None"}
- Current regular medications: ${d.currentMedications || "None"}

Diagnosis: ${d.diagnosis}
Chief Complaint: ${d.chiefComplaint || "Not specified"}

Current prescription being prepared:
${currentRxText}

Provide structured prescription assistance as JSON:
{
  "suggestedMedications": [
    {
      "name": string,
      "genericName": string,
      "dosage": string,
      "frequency": string,
      "duration": string,
      "route": string,
      "reason": string,
      "priority": "essential|recommended|optional"
    }
  ],
  "modifications": [
    {
      "currentMed": string,
      "suggestion": string,
      "reason": string,
      "type": "adjust_dose|change_frequency|replace|remove"
    }
  ],
  "interactions": [
    {
      "drugs": [string],
      "severity": "major|moderate|minor",
      "description": string,
      "recommendation": string
    }
  ],
  "allergyAlerts": [string],
  "generalAdvice": string,
  "disclaimer": "For physician review only. Apply clinical judgment."
}`;

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      max_tokens: 2000,
      messages: [
        { role: "system", content: "You are a clinical pharmacology decision support system. Always respond with valid JSON only, no markdown fences." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content ?? "{}";
    const result = JSON.parse(content);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: "AI analysis failed", detail: err.message });
  }
});

export default router;
