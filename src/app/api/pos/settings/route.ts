import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    success: true,
    shop: {
      name: 'محل غزل للمكياج ومستحضرات التجميل',
      brandTitle: 'GHAZAL Cosmetics & More',
      branch: 'عين الباشا - شارع القدس',
      phone: '+962776299243',
      vatNumber: '100458923',
      currency: 'JOD',
      currencySymbol: 'د.أ',
      taxRate: 0.16,
      terminalId: 'GHAZAL-POS-01',
      receiptHeader: 'أهلاً بكم في محل غزل للمكياجات — عين الباشا',
      receiptFooter: 'شكراً لزيارتكم • البضاعة المباعة تستبدل خلال 3 أيام مع إبراز أصل الفاتورة بحالتها',
    },
    printer: {
      paperWidth: '80mm',
      autoCut: true,
      openDrawerOnSale: true,
    },
  });
}
