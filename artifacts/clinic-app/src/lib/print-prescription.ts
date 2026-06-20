export interface PrintRxItem {
  medicationName: string | null;
  dosage: string;
  frequency: string;
  duration: string | null;
  quantity: number;
  instructions: string | null;
}

export interface PrintRxData {
  id: number;
  patientName: string | null;
  doctorName: string | null;
  issuedAt: string;
  notes: string | null;
  items: PrintRxItem[];
}

export interface PrintClinicInfo {
  clinicName: string;
  logoBase64: string | null;
}

export function printPrescription(rx: PrintRxData, clinic: PrintClinicInfo): void {
  const win = window.open("", "_blank", "width=860,height=700");
  if (!win) {
    alert("Pop-up blocked. Please allow pop-ups for this site and try again.");
    return;
  }

  const date = new Date(rx.issuedAt).toLocaleDateString("en-AE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const logoHtml = clinic.logoBase64
    ? `<img src="${clinic.logoBase64}" alt="Logo" style="height:64px;object-fit:contain;" />`
    : `<div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#059669,#0d9488);display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;font-weight:700;font-family:serif;">
        ${clinic.clinicName.charAt(0).toUpperCase()}
       </div>`;

  const rowsHtml = rx.items
    .map(
      (item, i) => `
      <tr style="background:${i % 2 === 0 ? "#f9fafb" : "#fff"};">
        <td style="padding:10px 12px;font-weight:600;color:#111;">${item.medicationName ?? "—"}</td>
        <td style="padding:10px 12px;color:#374151;">${item.dosage}</td>
        <td style="padding:10px 12px;color:#374151;">${item.frequency}</td>
        <td style="padding:10px 12px;color:#374151;">${item.duration ?? "—"}</td>
        <td style="padding:10px 12px;text-align:center;color:#374151;">${item.quantity}</td>
        <td style="padding:10px 12px;color:#6b7280;font-style:italic;">${item.instructions ?? ""}</td>
      </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Prescription Rx #${rx.id} — ${clinic.clinicName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 13px;
      color: #111827;
      background: #fff;
      padding: 0;
    }
    .page {
      max-width: 800px;
      margin: 0 auto;
      padding: 32px 40px 40px;
    }

    /* ── Header ── */
    .header {
      display: flex;
      align-items: center;
      gap: 18px;
      padding-bottom: 20px;
      border-bottom: 2.5px solid #059669;
      margin-bottom: 22px;
    }
    .header-text { flex: 1; }
    .clinic-name {
      font-size: 22px;
      font-weight: 700;
      color: #065f46;
      line-height: 1.2;
    }
    .clinic-sub {
      font-size: 11px;
      color: #6b7280;
      margin-top: 3px;
      text-transform: uppercase;
      letter-spacing: .05em;
    }
    .rx-meta {
      text-align: right;
      font-size: 11px;
      color: #6b7280;
      line-height: 1.7;
    }
    .rx-meta strong { color: #111827; font-size: 13px; }

    /* ── Info grid ── */
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-bottom: 24px;
    }
    .info-box {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 8px;
      padding: 12px 14px;
    }
    .info-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .06em;
      color: #059669;
      margin-bottom: 3px;
    }
    .info-value {
      font-size: 14px;
      font-weight: 600;
      color: #111827;
    }

    /* ── Rx symbol ── */
    .rx-heading {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }
    .rx-symbol {
      font-size: 28px;
      font-weight: 700;
      color: #059669;
      font-family: serif;
      line-height: 1;
    }
    .rx-title {
      font-size: 13px;
      font-weight: 600;
      color: #374151;
      text-transform: uppercase;
      letter-spacing: .06em;
    }

    /* ── Table ── */
    table {
      width: 100%;
      border-collapse: collapse;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #d1fae5;
      margin-bottom: 22px;
    }
    thead tr {
      background: #059669;
      color: #fff;
    }
    thead th {
      padding: 9px 12px;
      text-align: left;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .05em;
    }
    thead th:last-child { color: #d1fae5; }

    /* ── Notes ── */
    .notes-box {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 8px;
      padding: 10px 14px;
      margin-bottom: 28px;
      font-size: 12px;
      color: #92400e;
    }
    .notes-label { font-weight: 600; margin-bottom: 2px; }

    /* ── Footer ── */
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-top: 1px solid #e5e7eb;
      padding-top: 20px;
      margin-top: 8px;
    }
    .sig-block { text-align: center; }
    .sig-line {
      width: 180px;
      border-bottom: 1.5px solid #374151;
      height: 36px;
      margin-bottom: 6px;
    }
    .sig-label { font-size: 11px; color: #6b7280; }
    .footer-note {
      font-size: 10px;
      color: #9ca3af;
      text-align: right;
      max-width: 240px;
      line-height: 1.5;
    }

    /* ── Print ── */
    @media print {
      body { padding: 0; }
      .page { padding: 18px 28px 28px; }
      @page { margin: 1cm; size: A4; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    ${logoHtml}
    <div class="header-text">
      <div class="clinic-name">${clinic.clinicName}</div>
      <div class="clinic-sub">Medical Prescription</div>
    </div>
    <div class="rx-meta">
      <strong>Rx #${rx.id}</strong><br/>
      ${date}<br/>
      ${rx.doctorName ? `Dr. ${rx.doctorName}` : ""}
    </div>
  </div>

  <!-- Patient & Doctor info -->
  <div class="info-grid">
    <div class="info-box">
      <div class="info-label">Patient</div>
      <div class="info-value">${rx.patientName ?? "—"}</div>
    </div>
    <div class="info-box">
      <div class="info-label">Prescribing Physician</div>
      <div class="info-value">${rx.doctorName ? `Dr. ${rx.doctorName}` : "—"}</div>
    </div>
  </div>

  <!-- Rx heading -->
  <div class="rx-heading">
    <span class="rx-symbol">℞</span>
    <span class="rx-title">Prescribed Medications — ${rx.items.length} item${rx.items.length !== 1 ? "s" : ""}</span>
  </div>

  <!-- Medications table -->
  <table>
    <thead>
      <tr>
        <th>Medication</th>
        <th>Dosage</th>
        <th>Frequency</th>
        <th>Duration</th>
        <th style="text-align:center;">Qty</th>
        <th>Instructions</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  ${
    rx.notes
      ? `<div class="notes-box"><div class="notes-label">Clinical Notes</div>${rx.notes}</div>`
      : ""
  }

  <!-- Footer -->
  <div class="footer">
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-label">${rx.doctorName ? `Dr. ${rx.doctorName}` : "Physician Signature"}</div>
    </div>
    <div class="footer-note">
      This prescription is valid for 30 days from the issue date.<br/>
      Issued by ${clinic.clinicName}.
    </div>
  </div>

</div>
<script>
  window.onload = function () {
    window.print();
  };
</script>
</body>
</html>`;

  win.document.write(html);
  win.document.close();
}
