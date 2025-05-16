import { NextRequest, NextResponse } from 'next/server';
import { kofiActiveUrl } from '@/config/constant';
import { logger } from 'firebase-functions/v2';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { steamId, mailAddress } = body;

    logger.log('开始处理ko-fi订单激活请求', { steamId, mailAddress });

    // 调用后端API
    const response = await fetch(kofiActiveUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        steamId: Number(steamId),
        mailAddress,
      }),
    });

    const data = await response.json();
    logger.log('ko-fi订单激活请求完成', {
      steamId,
      mailAddress,
      status: response.status,
      data,
    });

    return NextResponse.json(data);
  } catch (error) {
    logger.error('ko-fi订单激活请求失败', {
      error: error instanceof Error ? error.message : '未知错误',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
