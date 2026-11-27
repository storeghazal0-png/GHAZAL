import { NextRequest, NextResponse } from 'next/server';
import { recordDeviceHeartbeat } from '@/actions/pos-devices';

export async function POST(req: NextRequest) {
  try {
    const body: any = await req.json().catch(() => ({}));
    const machineKey = body.machineKey || 'GHAZAL-MAC-AIN-ALBASHA-2026';
    await recordDeviceHeartbeat(machineKey);

    return NextResponse.json({
      success: true,
      status: 'ONLINE',
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ success: true, status: 'ONLINE' });
  }
}
