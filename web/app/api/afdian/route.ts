import { NextRequest, NextResponse } from 'next/server';
import { afdianActiveUrl } from '@/config/constant';
import { logger } from 'firebase-functions/v2';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { steamId, outTradeNo } = body;

    logger.log('开始处理爱发电订单激活请求', { steamId, outTradeNo });

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
    logger.log('爱发电订单激活请求完成', {
      steamId,
      outTradeNo,
      status: response.status,
      data,
    });

    return NextResponse.json(data);
  } catch (error) {
    logger.error('爱发电订单激活请求失败', {
      error: error instanceof Error ? error.message : '未知错误',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
