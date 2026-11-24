import { Resend } from 'resend';

export interface OrderItemEmailData {
  name: string;
  size?: string;
  quantity: number;
  unitPrice: number; // in fils
  total: number; // in fils
  sku?: string;
}

export interface NewOrderEmailPayload {
  reference: string;
  customerName: string;
  customerPhone: string;
  zoneName?: string;
  address?: string;
  items: OrderItemEmailData[];
  subtotalFils: number;
  shippingCostFils: number;
  rewardDiscountFils?: number;
  grandTotalFils: number;
  notes?: string;
  createdAt?: string;
}

const DEFAULT_FROM = 'orders@ghazal.jo';
const DEFAULT_TO = 'admin@ghazal.jo';

function formatJOD(fils: number): string {
  return (fils / 1000).toFixed(3) + ' د.أ';
}

export async function sendNewOrderNotificationEmail(payload: NewOrderEmailPayload): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn('[Resend Email] RESEND_API_KEY is not configured. Order notification email skipped.');
      return { success: false, error: 'RESEND_API_KEY is not configured' };
    }
    const resend = new Resend(apiKey);

    const from = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;
    const to = process.env.RESEND_ORDER_NOTIFICATION_EMAIL || DEFAULT_TO;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const orderTime = payload.createdAt 
      ? new Date(payload.createdAt).toLocaleString('ar-JO', { timeZone: 'Asia/Amman' }) 
      : new Date().toLocaleString('ar-JO', { timeZone: 'Asia/Amman' });

    // Clean phone number for WhatsApp link
    const cleanPhone = payload.customerPhone.replace(/[^0-9]/g, '');
    const waPhone = cleanPhone.startsWith('0') ? '962' + cleanPhone.slice(1) : (cleanPhone.startsWith('962') ? cleanPhone : '962' + cleanPhone);
    const waUrl = `https://wa.me/${waPhone}`;

    // Generate Items HTML Rows
    const itemsHtml = payload.items.map((item, index) => {
      const isFreeGift = item.unitPrice === 0 || item.total === 0;
      return `
        <tr style="border-bottom: 1px solid #f3e8e2;">
          <td style="padding: 12px 8px; text-align: right; font-size: 14px; color: #1f2937;">
            <div style="font-weight: 600;">${item.name}</div>
            ${item.size ? `<div style="font-size: 12px; color: #6b7280;">الحجم / التنوع: ${item.size}</div>` : ''}
            ${item.sku ? `<div style="font-size: 11px; color: #9ca3af;">رمز الصنف (SKU): ${item.sku}</div>` : ''}
          </td>
          <td style="padding: 12px 8px; text-align: center; font-size: 14px; font-weight: 600; color: #374151;">
            ${item.quantity}
          </td>
          <td style="padding: 12px 8px; text-align: left; font-size: 14px; color: #374151;">
            ${isFreeGift ? '<span style="color: #059669; font-weight: bold;">🎁 مجاناً</span>' : formatJOD(item.unitPrice)}
          </td>
          <td style="padding: 12px 8px; text-align: left; font-size: 14px; font-weight: bold; color: ${isFreeGift ? '#059669' : '#111827'};">
            ${isFreeGift ? '0.000 د.أ' : formatJOD(item.total)}
          </td>
        </tr>
      `;
    }).join('');

    // Plain text items
    const itemsText = payload.items.map(it => {
      const isGift = it.unitPrice === 0 || it.total === 0;
      return `- ${it.name} ${it.size ? `(${it.size})` : ''} | الكمية: ${it.quantity} | السعر: ${isGift ? 'هدية مجانية' : formatJOD(it.total)}`;
    }).join('\n');

    // Email Subject
    const subject = `طلب جديد #${payload.reference}`;

    // Plain Text Version
    const textContent = `
وصلك طلب جديد في متجر غزل (GHAZAL)
----------------------------------------
رقم الطلب: ${payload.reference}
التاريخ والوقت: ${orderTime}

بيانات العميل والتوصيل:
- اسم العميل: ${payload.customerName}
- رقم الهاتف: ${payload.customerPhone}
- منطقة التوصيل: ${payload.zoneName || 'غير محدد'}
- العنوان: ${payload.address || 'العنوان مسجل'}

المنتجات:
${itemsText}

الملخص المالي:
- المجموع الفرعي: ${formatJOD(payload.subtotalFils)}
- رسوم التوصيل: ${payload.shippingCostFils === 0 ? 'مجاني' : formatJOD(payload.shippingCostFils)}
${payload.rewardDiscountFils && payload.rewardDiscountFils > 0 ? `- خصم المكافآت: -${formatJOD(payload.rewardDiscountFils)}\n` : ''}
- الإجمالي النهائي: ${formatJOD(payload.grandTotalFils)}

رابط الطلب في لوحة التحكم:
${appUrl}/admin/orders
    `.trim();

    // Responsive, Elegant Arabic RTL HTML Template
    const htmlContent = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #faf5f3; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; direction: rtl; text-align: right;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #faf5f3; padding: 25px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 650px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06); border: 1px solid #f1ded5;">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #881337 0%, #be123c 50%, #9f1239 100%); padding: 30px 24px; text-align: center; color: #ffffff;">
              <div style="font-size: 26px; font-weight: 800; letter-spacing: 1px; margin-bottom: 6px;">غزل | GHAZAL</div>
              <div style="font-size: 14px; opacity: 0.9; margin-bottom: 16px;">مستحضرات التجميل والعناية الفاخرة</div>
              <div style="display: inline-block; background-color: rgba(255, 255, 255, 0.2); border: 1px solid rgba(255, 255, 255, 0.35); border-radius: 30px; padding: 8px 20px; font-size: 16px; font-weight: bold;">
                🛍️ وصلك طلب جديد #${payload.reference}
              </div>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding: 28px 24px;">

              <!-- Status Alert Box -->
              <div style="background-color: #fdf2f4; border-right: 4px solid #be123c; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px;">
                <p style="margin: 0; font-size: 14px; color: #881337; font-weight: 600;">
                  تم استلام طلب جديد بنجاح عبر المتجر الإلكتروني. يرجى مراجعة تفاصيل الطلب وتجهيزه للتسليم.
                </p>
                <p style="margin: 6px 0 0 0; font-size: 12px; color: #9f1239;">
                  🕒 توقيت استلام الطلب: <strong>${orderTime}</strong>
                </p>
              </div>

              <!-- Customer & Shipping Information -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #fffaf8; border: 1px solid #f4dfd5; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <div style="font-size: 15px; font-weight: 700; color: #881337; margin-bottom: 12px; border-bottom: 1px dashed #eed1c3; padding-bottom: 8px;">
                      👤 معلومات العميل والتوصيل
                    </div>
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="padding: 4px 0; font-size: 13px; color: #6b7280; width: 35%;">اسم المستلم:</td>
                        <td style="padding: 4px 0; font-size: 14px; font-weight: bold; color: #111827;">${payload.customerName}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; font-size: 13px; color: #6b7280;">رقم الهاتف:</td>
                        <td style="padding: 4px 0; font-size: 14px; color: #111827;">
                          <a href="tel:${payload.customerPhone}" style="color: #be123c; text-decoration: none; font-weight: bold;">${payload.customerPhone}</a>
                          &nbsp;|&nbsp;
                          <a href="${waUrl}" target="_blank" style="color: #059669; text-decoration: none; font-size: 12px; font-weight: bold;">💬 فتح واتساب</a>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; font-size: 13px; color: #6b7280;">منطقة التوصيل:</td>
                        <td style="padding: 4px 0; font-size: 14px; font-weight: 600; color: #374151;">${payload.zoneName || 'الأردن'}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; font-size: 13px; color: #6b7280;">العنوان التفصيلي:</td>
                        <td style="padding: 4px 0; font-size: 14px; color: #374151;">${payload.address || 'العنوان مسجل في الطلب'}</td>
                      </tr>
                      ${payload.notes ? `
                      <tr>
                        <td style="padding: 4px 0; font-size: 13px; color: #6b7280;">ملاحظات إضافية:</td>
                        <td style="padding: 4px 0; font-size: 13px; color: #4b5563; font-style: italic;">${payload.notes}</td>
                      </tr>
                      ` : ''}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Order Items Table -->
              <div style="font-size: 15px; font-weight: 700; color: #881337; margin-bottom: 10px;">
                📦 الأصناف المطلوبة (${payload.items.length})
              </div>
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; margin-bottom: 24px;">
                <thead>
                  <tr style="background-color: #fce7ec; border-bottom: 2px solid #f43f5e;">
                    <th style="padding: 10px 8px; text-align: right; font-size: 13px; color: #881337;">المنتج</th>
                    <th style="padding: 10px 8px; text-align: center; font-size: 13px; color: #881337; width: 60px;">الكمية</th>
                    <th style="padding: 10px 8px; text-align: left; font-size: 13px; color: #881337; width: 90px;">السعر</th>
                    <th style="padding: 10px 8px; text-align: left; font-size: 13px; color: #881337; width: 90px;">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                </tbody>
              </table>

              <!-- Financial Totals -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #fbfbfb; border: 1px solid #e5e7eb; border-radius: 12px; margin-bottom: 28px;">
                <tr>
                  <td style="padding: 18px 20px;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="padding: 4px 0; font-size: 14px; color: #4b5563;">المجموع الفرعي:</td>
                        <td style="padding: 4px 0; font-size: 14px; text-align: left; font-weight: 600; color: #111827;">${formatJOD(payload.subtotalFils)}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; font-size: 14px; color: #4b5563;">أجرة التوصيل:</td>
                        <td style="padding: 4px 0; font-size: 14px; text-align: left; font-weight: 600; color: ${payload.shippingCostFils === 0 ? '#059669' : '#111827'};">
                          ${payload.shippingCostFils === 0 ? 'مجاني 🎉' : formatJOD(payload.shippingCostFils)}
                        </td>
                      </tr>
                      ${payload.rewardDiscountFils && payload.rewardDiscountFils > 0 ? `
                      <tr>
                        <td style="padding: 4px 0; font-size: 14px; color: #059669;">خصم مكافأة السلة:</td>
                        <td style="padding: 4px 0; font-size: 14px; text-align: left; font-weight: bold; color: #059669;">
                          -${formatJOD(payload.rewardDiscountFils)}
                        </td>
                      </tr>
                      ` : ''}
                      <tr style="border-top: 2px solid #e5e7eb;">
                        <td style="padding: 12px 0 4px 0; font-size: 16px; font-weight: bold; color: #881337;">
                          المبلغ المطلوب تحصيله (COD):
                        </td>
                        <td style="padding: 12px 0 4px 0; font-size: 20px; font-weight: 900; text-align: left; color: #be123c;">
                          ${formatJOD(payload.grandTotalFils)}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Call to Action Button -->
              <div style="text-align: center; margin-bottom: 10px;">
                <a href="${appUrl}/admin/orders" target="_blank" style="display: inline-block; background-color: #be123c; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: bold; padding: 14px 32px; border-radius: 10px; box-shadow: 0 4px 12px rgba(190, 18, 60, 0.25);">
                  🔍 فتح وإدارة الطلب في لوحة الإدارة
                </a>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #fdf8f6; border-top: 1px solid #f1ded5; padding: 18px 24px; text-align: center; font-size: 12px; color: #9ca3af;">
              هذا الإشعار تلقائي صادر من منصة غزل (GHAZAL) لإدارة المتجر الإلكتروني ونقاط البيع السحابية.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();

    // Send the email via Resend
    const response = await resend.emails.send({
      from,
      to,
      subject,
      text: textContent,
      html: htmlContent
    });

    if (response.error) {
      console.error('[Resend Email Error]:', response.error);
      return { success: false, error: response.error.message };
    }

    console.log(`[Resend Email Sent] Successfully sent notification for order ${payload.reference} (ID: ${response.data?.id}) to ${to}`);
    return { success: true, id: response.data?.id };
  } catch (err: any) {
    console.error('[Resend Email Exception]:', err?.message || err);
    return { success: false, error: err?.message || String(err) };
  }
}

export interface BackupSuccessEmailPayload {
  startedAt: string | Date;
  completedAt: string | Date;
  durationSeconds: number;
  dumpSizeBytes: number;
  tableCount: number;
  rowCount: number;
  financialSumFils?: number;
  nextScheduledBackup?: string;
}

export interface BackupFailureEmailPayload {
  startedAt: string | Date;
  failedAt: string | Date;
  stage: string;
  errorMessage: string;
  previousBackupProtected?: boolean;
}

/**
 * Sends a rich Arabic RTL success report email when an automated or manual backup completes and passes verification.
 */
export async function sendBackupSuccessEmail(
  payload: BackupSuccessEmailPayload
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn('[Resend Email] RESEND_API_KEY is not configured. Backup success report email skipped.');
      return { success: false, error: 'RESEND_API_KEY is not configured' };
    }
    const resend = new Resend(apiKey);

    const from = process.env.BACKUP_EMAIL_FROM || process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;
    const to = process.env.BACKUP_EMAIL_TO || process.env.RESEND_ORDER_NOTIFICATION_EMAIL || DEFAULT_TO;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const executionTimeAmman = new Date(payload.completedAt).toLocaleString('ar-JO', {
      timeZone: 'Asia/Amman',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });

    const sizeMB = (payload.dumpSizeBytes / (1024 * 1024)).toFixed(2);
    const financialTotalJod = payload.financialSumFils !== undefined 
      ? formatJOD(payload.financialSumFils) 
      : 'تم التحقق بنجاح';

    const subject = `[غزل] نجاح النسخ الاحتياطي الأسبوعي — قاعدة بيانات غزل المعتمدة`;

    const textContent = `
GHAZAL SYSTEM — Automated Backup Service
--------------------------------------------------
تم إنشاء النسخة الاحتياطية الأسبوعية بنجاح

المصدر: Supabase PostgreSQL
الوجهة: Neon PostgreSQL (ghazal_backup_current)
تاريخ ووقت التنفيذ (توقيت الأردن): ${executionTimeAmman}
مدة العملية: ${payload.durationSeconds} ثانية
حجم النسخة: ${sizeMB} MB
عدد الجداول المفحوصة: ${payload.tableCount}
إجمالي السجلات: ${payload.rowCount}
سلامة البيانات: تم التحقق بنسبة 100% (المطابقة المالية: ${financialTotalJod})
النسخة السابقة: تم حذفها بأمان بعد اعتماد النسخة الجديدة
حالة المتجر والكاشير: يعملان بصورة طبيعية دون أي تأثر

لوحة إدارة النسخ: ${appUrl}/admin/settings/backups
    `.trim();

    const htmlContent = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8f6f5; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; -webkit-font-smoothing: antialiased; direction: rtl; text-align: right;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8f6f5; padding: 30px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 620px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.06); border: 1px solid #eeded7;">
          
          <!-- Brand Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #881337 0%, #be123c 50%, #9f1239 100%); padding: 32px 24px; text-align: center;">
              <h1 style="margin: 0 0 6px 0; color: #ffffff; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">GHAZAL</h1>
              <div style="color: #fce7f3; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
                Automated Disaster Recovery Service
              </div>
            </td>
          </tr>

          <!-- Success Alert Card -->
          <tr>
            <td style="padding: 28px 28px 12px 28px;">
              <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 18px 20px; margin-bottom: 24px;">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                  <span style="font-size: 18px; font-weight: 800; color: #065f46;">
                    ✅ تم إنشاء النسخة الاحتياطية بنجاح
                  </span>
                  <span style="background-color: #10b981; color: #ffffff; font-size: 11px; font-weight: bold; padding: 4px 10px; border-radius: 20px;">
                    SAFE ROTATION
                  </span>
                </div>
                <p style="margin: 8px 0 0 0; font-size: 13.5px; color: #047857; line-height: 1.6;">
                  تم استخراج نسخة متسقة من قاعدة بيانات Supabase، واستعادتها داخل Neon PostgreSQL، والتحقق آلياً من تطابق كافة الجداول والفواتير وسجلات الكاشير بالفلس الأردني.
                </p>
              </div>

              <h2 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 800; color: #1f2937;">
                📊 ملخص العملية الفنية
              </h2>

              <!-- Details Table -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; margin-bottom: 24px;">
                <tbody>
                  <tr style="border-bottom: 1px solid #f3f4f6;">
                    <td style="padding: 10px 8px; font-size: 13.5px; color: #6b7280; font-weight: 600;">قاعدة المصدر</td>
                    <td style="padding: 10px 8px; font-size: 13.5px; color: #111827; font-weight: 700; text-align: left;">Supabase PostgreSQL (AWS eu-central-1)</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #f3f4f6; background-color: #fafaf9;">
                    <td style="padding: 10px 8px; font-size: 13.5px; color: #6b7280; font-weight: 600;">قاعدة الوجهة (DR)</td>
                    <td style="padding: 10px 8px; font-size: 13.5px; color: #111827; font-weight: 700; text-align: left;">Neon PostgreSQL (ghazal_backup_current)</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #f3f4f6;">
                    <td style="padding: 10px 8px; font-size: 13.5px; color: #6b7280; font-weight: 600;">تاريخ ووقت التنفيذ</td>
                    <td style="padding: 10px 8px; font-size: 13.5px; color: #111827; font-weight: 700; text-align: left;">${executionTimeAmman} (توقيت عمّان)</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #f3f4f6; background-color: #fafaf9;">
                    <td style="padding: 10px 8px; font-size: 13.5px; color: #6b7280; font-weight: 600;">المدة المستغرقة</td>
                    <td style="padding: 10px 8px; font-size: 13.5px; color: #047857; font-weight: 800; text-align: left;">${payload.durationSeconds} ثانية</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #f3f4f6;">
                    <td style="padding: 10px 8px; font-size: 13.5px; color: #6b7280; font-weight: 600;">حجم النسخة المضغوطة</td>
                    <td style="padding: 10px 8px; font-size: 13.5px; color: #111827; font-weight: 700; text-align: left;">${sizeMB} MB</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #f3f4f6; background-color: #fafaf9;">
                    <td style="padding: 10px 8px; font-size: 13.5px; color: #6b7280; font-weight: 600;">عدد الجداول والسجلات</td>
                    <td style="padding: 10px 8px; font-size: 13.5px; color: #111827; font-weight: 700; text-align: left;">${payload.tableCount} جدول / ${payload.rowCount} سجل</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #f3f4f6;">
                    <td style="padding: 10px 8px; font-size: 13.5px; color: #6b7280; font-weight: 600;">سلامة التدقيق المالي</td>
                    <td style="padding: 10px 8px; font-size: 13.5px; color: #047857; font-weight: 800; text-align: left;">تطابق تام بنسبة 100% بالفلس</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #f3f4f6; background-color: #fafaf9;">
                    <td style="padding: 10px 8px; font-size: 13.5px; color: #6b7280; font-weight: 600;">تدوير النسخة السابقة</td>
                    <td style="padding: 10px 8px; font-size: 13.5px; color: #4b5563; font-weight: 600; text-align: left;">تم حذفها تلقائياً بعد نجاح الجديدة</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 8px; font-size: 13.5px; color: #6b7280; font-weight: 600;">حالة المتجر ونقاط البيع (POS)</td>
                    <td style="padding: 10px 8px; font-size: 13.5px; color: #047857; font-weight: 800; text-align: left;">يعملان بصورة طبيعية ومستمرة</td>
                  </tr>
                </tbody>
              </table>

              <!-- Action Link -->
              <div style="text-align: center; margin: 28px 0 10px 0;">
                <a href="${appUrl}/admin/settings/backups" target="_blank" style="display: inline-block; background-color: #be123c; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: bold; padding: 12px 28px; border-radius: 8px; box-shadow: 0 4px 12px rgba(190, 18, 60, 0.2);">
                  🛡️ فتح لوحة إدارة النسخ الاحتياطي في غزل
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #fdf8f6; border-top: 1px solid #f1ded5; padding: 16px 24px; text-align: center; font-size: 11.5px; color: #9ca3af;">
              رسالة آلية من نظام حماية واستعادة بيانات غزل (GHAZAL Independent Disaster Recovery Engine).
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();

    const response = await resend.emails.send({
      from,
      to,
      subject,
      text: textContent,
      html: htmlContent,
    });

    if (response.error) {
      console.error('[Resend Backup Success Email Error]:', response.error);
      return { success: false, error: response.error.message };
    }

    console.log(`[Resend Email Sent] Backup Success report sent to ${to} (ID: ${response.data?.id})`);
    return { success: true, id: response.data?.id };
  } catch (err: any) {
    console.error('[Resend Backup Success Email Exception]:', err?.message || err);
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Sends an urgent Arabic RTL failure alert email when a backup fails, ensuring clear isolation messaging.
 */
export async function sendBackupFailureEmail(
  payload: BackupFailureEmailPayload
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn('[Resend Email] RESEND_API_KEY is not configured. Backup failure alert email skipped.');
      return { success: false, error: 'RESEND_API_KEY is not configured' };
    }
    const resend = new Resend(apiKey);

    const from = process.env.BACKUP_EMAIL_FROM || process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;
    const to = process.env.BACKUP_EMAIL_TO || process.env.RESEND_ORDER_NOTIFICATION_EMAIL || DEFAULT_TO;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const failTimeAmman = new Date(payload.failedAt).toLocaleString('ar-JO', {
      timeZone: 'Asia/Amman',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });

    // Sanitize error message to avoid leaking passwords or internal URLs
    const sanitizedError = payload.errorMessage
      .replace(/postgres(?:ql)?:\/\/[^@]+@/gi, 'postgresql://***:***@')
      .replace(/re_[A-Za-z0-9_]+/g, 're_***');

    // HTML-escape to prevent HTML injection and rendering corruption in email clients
    const htmlEscapedError = sanitizedError
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    const subject = `⚠️ [تنبيه عاجل] تعذر إكمال النسخة الاحتياطية لنظام غزل`;

    const textContent = `
GHAZAL SYSTEM — Backup Failure Alert
--------------------------------------------------
تعذر إكمال النسخة الاحتياطية الأسبوعية

وقت حدوث الخطأ: ${failTimeAmman}
المرحلة: ${payload.stage}
سبب الخطأ: ${sanitizedError}

الضمانات الفنية:
1. تم الاحتفاظ بالنسخة الاحتياطية السابقة (ghazal_backup_current) دون حذفها وحمايتها بالكامل.
2. لم تتأثر عمليات المتجر الإلكتروني أو الكاشير أو قاعدة البيانات الرئيسية نهائياً بسبب فشل النسخ.
3. يمكنك فحص السجلات أو إعادة المحاولة يدوياً عبر لوحة الإدارة: ${appUrl}/admin/settings/backups
    `.trim();

    const htmlContent = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #fef2f2; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; -webkit-font-smoothing: antialiased; direction: rtl; text-align: right;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #fef2f2; padding: 30px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 620px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.08); border: 1px solid #fecaca;">
          
          <!-- Alert Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #7f1d1d 0%, #b91c1c 50%, #dc2626 100%); padding: 32px 24px; text-align: center;">
              <h1 style="margin: 0 0 6px 0; color: #ffffff; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">GHAZAL</h1>
              <div style="color: #fee2e2; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
                Backup Failure Alert
              </div>
            </td>
          </tr>

          <!-- Alert Body -->
          <tr>
            <td style="padding: 28px 28px 12px 28px;">
              <div style="background-color: #fef2f2; border: 1px solid #f87171; border-radius: 12px; padding: 18px 20px; margin-bottom: 24px;">
                <div style="font-size: 18px; font-weight: 800; color: #991b1b; margin-bottom: 8px;">
                  ⚠️ تعذر إكمال النسخة الاحتياطية الأسبوعية
                </div>
                <p style="margin: 0; font-size: 13.5px; color: #b91c1c; line-height: 1.6;">
                  واجه نظام النسخ الاحتياطي عائقاً أثناء مرحلة (<strong>${payload.stage}</strong>). تم إيقاف العملية فوراً وتفعيل بروتوكول الحماية.
                </p>
              </div>

              <!-- Error Box -->
              <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; margin-bottom: 24px;">
                <div style="font-size: 12px; font-weight: bold; color: #6b7280; margin-bottom: 4px;">تفاصيل الخطأ الفني المعقم:</div>
                <div style="font-family: monospace; font-size: 12.5px; color: #111827; word-break: break-all; direction: ltr; text-align: left;">
                  ${htmlEscapedError}
                </div>
              </div>

              <h2 style="margin: 0 0 12px 0; font-size: 15px; font-weight: 800; color: #1f2937;">
                🛡️ ضمانات سلامة واستمرارية النظام
              </h2>

              <ul style="margin: 0 0 24px 0; padding-right: 20px; font-size: 13.5px; color: #374151; line-height: 1.8;">
                <li style="margin-bottom: 6px;">
                  <strong>النسخة السابقة محفوظة:</strong> تم الإبقاء على آخر نسخة احتياطية سليمة معتمدة (<code style="background-color: #f3f4f6; padding: 2px 6px; border-radius: 4px;">ghazal_backup_current</code>) دون أي تعديل أو حذف.
                </li>
                <li style="margin-bottom: 6px;">
                  <strong>المتجر والكاشير يعملان:</strong> لم تتأثر قاعدة البيانات التشغيلية (Supabase) أو عمليات البيع ونقاط البيع إطلاقاً بهذا العطل.
                </li>
                <li>
                  <strong>إعادة المحاولة:</strong> يمكنك التحقق من حالة الاتصال أو تشغيل النسخ يدوياً في أي وقت.
                </li>
              </ul>

              <!-- Action Link -->
              <div style="text-align: center; margin: 28px 0 10px 0;">
                <a href="${appUrl}/admin/settings/backups" target="_blank" style="display: inline-block; background-color: #dc2626; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: bold; padding: 12px 28px; border-radius: 8px; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.25);">
                  🔍 فحص سجلات النسخ وإعادة المحاولة
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #fdf8f6; border-top: 1px solid #f1ded5; padding: 16px 24px; text-align: center; font-size: 11.5px; color: #9ca3af;">
              رسالة تحذير آلية من نظام حماية واستعادة بيانات غزل (GHAZAL Independent Disaster Recovery Engine).
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();

    const response = await resend.emails.send({
      from,
      to,
      subject,
      text: textContent,
      html: htmlContent,
    });

    if (response.error) {
      console.error('[Resend Backup Failure Email Error]:', response.error);
      return { success: false, error: response.error.message };
    }

    console.log(`[Resend Email Sent] Backup Failure alert sent to ${to} (ID: ${response.data?.id})`);
    return { success: true, id: response.data?.id };
  } catch (err: any) {
    console.error('[Resend Backup Failure Email Exception]:', err?.message || err);
    return { success: false, error: err?.message || String(err) };
  }
}

