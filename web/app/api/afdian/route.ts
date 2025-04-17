import { NextRequest, NextResponse } from 'next/server';
import { afdianActiveUrl } from '@/config/constant';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { steamId, outTradeNo } = body;

    // 调用后端API
    const response = await fetch(afdianActiveUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        steamId: Number(steamId),
        outTradeNo,
      }),
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in afdian order active:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
