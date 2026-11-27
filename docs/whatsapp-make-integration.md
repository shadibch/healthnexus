# HealthNexus WhatsApp and Make.com API

The integration extends the existing HealthNexus API. It does not expose database credentials to Make.com, and all patient/appointment operations use the clinic's tenant schema.

## 1. Apply database migrations

Run migrations against the HealthNexus PostgreSQL database before using the API:

```bash
pnpm --filter @workspace/db db:migrate
```

Migrations `0006_whatsapp_integrations.sql` and `0007_clinic_scheduling.sql` add revocable clinic-scoped credentials, audit/event records, conversation state, schedule rules, unavailable periods, appointment duration/source, and appointment history. Existing tenant schemas are upgraded, and new tenant schemas clone the added tenant tables.

## 2. Set clinic timezone and working hours

These setup routes require an authenticated clinic admin session, not an integration token.

Set the clinic IANA timezone:

```http
PATCH /api/whatsapp/time-zone
Content-Type: application/json
Cookie: <HealthNexus session cookie>
```

```json
{ "time_zone": "Asia/Qatar" }
```

Other examples include `Asia/Dubai`, `Asia/Riyadh`, and `Asia/Kuwait`. The server validates timezone names. A timezone change is rejected while active future appointments exist.

Add recurring local working hours for a doctor. Multiple separated periods can be entered to represent breaks:

```http
POST /api/whatsapp/schedule-rules
Content-Type: application/json
Cookie: <HealthNexus session cookie>
```

```json
{
  "doctor_id": 12,
  "day_of_week": 0,
  "start_time": "09:00",
  "end_time": "13:00",
  "slot_duration_minutes": 30,
  "effective_from": "2026-12-01",
  "effective_until": "2027-12-31"
}
```

`day_of_week` is 0 for Sunday through 6 for Saturday. Effective dates are inclusive and optional. Slot length is set per rule. The admin routes are:

- `GET /api/whatsapp/schedule-rules?doctor_id=12`
- `POST /api/whatsapp/schedule-rules`
- `PATCH /api/whatsapp/schedule-rules/{rule_id}` (send a complete replacement rule)
- `DELETE /api/whatsapp/schedule-rules/{rule_id}` (blocked while active future appointments exist for that doctor)

Add a doctor's leave, break, holiday, or a clinic-wide closure:

```http
POST /api/whatsapp/unavailable-periods
```

```json
{
  "doctor_id": 12,
  "kind": "leave",
  "starts_at": "2026-12-10T09:00:00+03:00",
  "ends_at": "2026-12-12T17:00:00+03:00",
  "reason": "Annual leave"
}
```

Omit or set `doctor_id` to `null` for a clinic-wide closure. `kind` may be `break`, `leave`, `holiday`, or `clinic_closure`. Admin management routes also include `GET /api/whatsapp/unavailable-periods` and `DELETE /api/whatsapp/unavailable-periods/{period_id}`. New periods must start in the future. Use schedule windows split around recurring breaks.

## 3. Create an integration credential

While signed in as a clinic admin, create a token:

```http
POST /api/whatsapp/credentials
Content-Type: application/json
Cookie: <HealthNexus session cookie>
```

```json
{ "name": "Make.com WhatsApp", "expires_at": "2027-12-01T00:00:00Z" }
```

Expiration is optional. Copy the returned `token` directly into a Make.com encrypted connection/secret. HealthNexus stores only its SHA-256 hash; the token is shown once. Manage tokens using:

- `GET /api/whatsapp/credentials` (safe metadata only)
- `DELETE /api/whatsapp/credentials/{credential_id}` (revoke immediately)

Integration calls use these headers:

```http
Authorization: Bearer hnwa_<token>
Content-Type: application/json
```

The credential is scoped to its clinic. The API rejects a different `medical_center_id` and selects the clinic tenant schema from the credential, not the request body. Never put the token in query parameters, prompts, scenario logs, or messages.

## 4. Base URL and endpoints

Use the deployed HealthNexus API origin followed by `/api/whatsapp`. For example, if the API origin is `https://healthnexus-api.onrender.com`, the base is `https://healthnexus-api.onrender.com/api/whatsapp`.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/patients/lookup` | Look up a patient by phone. |
| POST | `/patients` | Register a patient after user confirmation and duplicate check. |
| GET | `/doctors` | Find available doctors by specialization/category/ID. |
| GET | `/availability` | Return real slots computed from schedules, duration, bookings, leave/closures, and clinic timezone. |
| POST | `/appointments` | Create an appointment transactionally; requires idempotency key. |
| GET | `/appointments` | List a patient’s appointments after phone verification. |
| POST | `/appointments/{id}/cancel` | Cancel after patient-number validation and explicit confirmation. |
| PATCH | `/appointments/{id}/reschedule` | Move an appointment transactionally; requires idempotency key. |
| POST | `/conversations/message` | Deduplicate and initialize/update WhatsApp conversation context. |
| PATCH | `/conversations/{id}/state` | Save standardized AI intent/stage/context. |

Credential and schedule setup routes are described above. They use the admin session, not the integration bearer token.

## 5. Patient management

Phone lookup requires the clinic ID and a number beginning with `+` or `00`, including its country code. Spaces, parentheses, and hyphens are normalized:

```http
GET /api/whatsapp/patients/lookup?medical_center_id=1&phone=%2B97450123456
```

Success response (sensitive medical data is not returned):

```json
{
  "success": true,
  "data": {
    "patient": { "id": 123, "first_name": "Aisha", "last_name": "Ali" },
    "registered": true
  },
  "message": "Operation completed successfully"
}
```

Register a new patient only after collecting their name and consent:

```json
{
  "medical_center_id": 1,
  "first_name": "Aisha",
  "last_name": "Ali",
  "phone": "+974 5012 3456",
  "email": "aisha@example.qa",
  "consent": true
}
```

The API normalizes formatting to `+` and digits, validates 7–15 international digits, serializes concurrent registrations for the same number, and returns `409 PATIENT_ALREADY_REGISTERED` for a duplicate. Only the patient ID is returned from registration.

## 6. Doctors and availability

Examples:

```http
GET /api/whatsapp/doctors?medical_center_id=1&specialization=cardiology
GET /api/whatsapp/doctors?medical_center_id=1&specialization=general_practice
GET /api/whatsapp/availability?medical_center_id=1&specialization=cardiology&date=2026-12-10
```

Doctor results include only `is_available` doctors. GP searches also match general-practice category names; a specialist request is never silently changed to a GP. Availability returns clinic-local date/time context and absolute timestamps:

```json
{
  "success": true,
  "data": {
    "date": "2026-12-10",
    "timezone": "Asia/Qatar",
    "available_slots": [
      {
        "doctor_id": 12,
        "doctor_name": "Dr. Ahmed Ali",
        "start": "2026-12-10T06:00:00.000Z",
        "end": "2026-12-10T06:30:00.000Z"
      }
    ]
  },
  "message": "Operation completed successfully"
}
```

Slots are generated only from a matching configured weekly rule. The service excludes past times, overlapping active appointments (including their durations), doctor leave/breaks, clinic closures, and holidays. It handles clinic-local timezone and daylight-saving gaps. An absent timezone or schedule returns `SCHEDULING_NOT_CONFIGURED` or an empty slot list; it does not invent hours.

## 7. Appointment booking and rescheduling

Book only a slot returned by `/availability`, after the user explicitly confirms it:

```http
POST /api/whatsapp/appointments
```

```json
{
  "medical_center_id": 1,
  "patient_id": 123,
  "doctor_id": 12,
  "scheduled_at": "2026-12-10T09:00:00+03:00",
  "type": "routine",
  "source": "whatsapp",
  "whatsapp_number": "+97450123456",
  "idempotency_key": "wamid.booking-request-0001",
  "confirmed": true
}
```

The operation checks patient/phone and doctor/clinic ownership, revalidates the configured schedule and availability inside a transaction, obtains a tenant/doctor advisory lock, checks duration overlap, creates the appointment and history record, and stores the idempotency key in the same transaction. A retry with the same key and same payload returns the original result. Reusing the key with different input returns `409 IDEMPOTENCY_KEY_REUSED`. An already taken slot returns `409 SLOT_UNAVAILABLE`.

Reschedule request:

```http
PATCH /api/whatsapp/appointments/456/reschedule
```

```json
{
  "medical_center_id": 1,
  "patient_id": 123,
  "whatsapp_number": "+97450123456",
  "new_doctor_id": 12,
  "new_scheduled_at": "2026-12-11T10:00:00+03:00",
  "idempotency_key": "wamid.reschedule-request-0001",
  "confirmed": true
}
```

The original appointment is row-locked and preserved unless the new slot is validated and committed. Successful changes are written to `appointment_history`. HealthNexus's existing patient, staff, and WhatsApp booking writers use the same scheduling validation and per-doctor lock.

## 8. Listing and cancellation

List appointments only after matching both patient ID and WhatsApp sender:

```http
GET /api/whatsapp/appointments?medical_center_id=1&patient_id=123&whatsapp_number=%2B97450123456&from_date=2026-12-01T00:00:00Z
```

The response includes appointment ID, time, status, type, and doctor name; it excludes clinical notes and histories.

Cancellation requires a separate affirmative confirmation from the user:

```http
POST /api/whatsapp/appointments/456/cancel
```

```json
{
  "medical_center_id": 1,
  "patient_id": 123,
  "whatsapp_number": "+97450123456",
  "confirm": true
}
```

Only future `scheduled` or `confirmed` appointments can be cancelled. Repeated cancellation returns `409 ALREADY_CANCELLED`. The status update and history row are transactional.

## 9. WhatsApp messages and conversation state

Forward incoming WhatsApp events to:

```http
POST /api/whatsapp/conversations/message
```

```json
{
  "medical_center_id": 1,
  "whatsapp_number": "+97450123456",
  "message_id": "wamid.example-0001",
  "message": "أريد موعداً غداً",
  "language": "ar"
}
```

Supported languages are `ar`, `en`, and `ur`. The response returns the incoming message for the AI step, conversation ID, current state, linked patient/appointment IDs, and expiration. The message text is not stored in the integration event table. A duplicate or out-of-order `message_id` returns `duplicate: true` and is not reprocessed. Conversation records expire after 24 hours by default. Set `WHATSAPP_CONVERSATION_TTL_HOURS` to a value from 1 to 168 to adjust the expiry.

After AI classification, persist standardized state. Receiving a message or updating state never creates an appointment:

```http
PATCH /api/whatsapp/conversations/42/state
```

```json
{
  "medical_center_id": 1,
  "language": "ar",
  "intent": "book_appointment",
  "stage": "awaiting_specialty",
  "state": { "requested_specialty": "cardiology", "preferred_time": "morning" }
}
```

Supported intents: `book_appointment`, `cancel_appointment`, `reschedule_appointment`, `check_appointments`, `other`. Stages include `new_conversation`, `identifying_intent`, `awaiting_specialty`, `awaiting_date`, `checking_availability`, `awaiting_slot_selection`, `awaiting_patient_name`, `awaiting_patient_confirmation`, `booking_in_progress`, `booking_completed`, `awaiting_cancellation_confirmation`, `awaiting_reschedule_date`, `awaiting_reschedule_slot`, `human_handover`, and `completed`. State is limited to 8 KB. Patient and appointment links are validated against the tenant and sender number.

## 10. Make.com scenario outline

1. Configure a WhatsApp provider webhook and capture the provider message ID and sender number.
2. Add an HTTP module to `POST /conversations/message`; stop if `data.duplicate` is true.
3. Call patient lookup. If no patient exists, ask for name and consent, then register them.
4. Send the message plus minimal conversation context to OpenAI. Do not send medical history or credentials.
5. Persist standardized intent/stage/state with `PATCH /conversations/{id}/state`.
6. For booking, call doctor search, then availability, present a returned slot and get explicit confirmation, then call booking with a stable idempotency key.
7. For cancellation, list appointments, identify one to the patient, obtain explicit confirmation, then call cancel.
8. For rescheduling, show new slots and confirm before calling reschedule; the old appointment remains if the new slot cannot be secured.
9. Send localized provider messages for success/errors; hand off ambiguous identity and failed actions to clinic staff.

In Make.com's HTTP module, set method/path, `Content-Type: application/json`, and `Authorization: Bearer {{encrypted credential}}`. Do not map the bearer value into logs or OpenAI prompts. Production requests must use HTTPS. The in-process rate limit is 120 requests per minute per credential; with multiple API replicas, configure a shared edge rate limit as well.

## 11. Error responses

```json
{
  "success": false,
  "error": { "code": "SLOT_UNAVAILABLE", "message": "The requested slot overlaps an existing appointment" }
}
```

Common statuses/codes: `400 INVALID_REQUEST` or `INVALID_PHONE`, `401 INVALID_INTEGRATION_CREDENTIAL`, `403 TENANT_MISMATCH` or `PATIENT_IDENTITY_MISMATCH`, `404 APPOINTMENT_NOT_FOUND`, `409 SLOT_UNAVAILABLE`/`PATIENT_ALREADY_REGISTERED`/`ALREADY_CANCELLED`/`IDEMPOTENCY_KEY_REUSED`, `429 RATE_LIMITED` (respect `Retry-After`), and `501 SCHEDULING_NOT_CONFIGURED`.

## 12. Security and data handling

- Use one revocable token per clinic and store it in Make.com's encrypted secrets.
- Tenant ID comes from the credential; request IDs are checked against that clinic.
- SQL values are parameterized through Drizzle. Booking is transactional and serialized per doctor.
- Logs omit request bodies, query strings, phone numbers, and messages. Audit rows store operation/entity IDs only.
- Patient lookup/appointment responses omit national ID, diagnoses, prescriptions, notes, and history.
- Raw WhatsApp message text is returned to Make for the current AI turn but is not persisted by this API.
- HTTPS is required in production.
