import { NextRequest, NextResponse } from 'next/server';

// 内部服务器的基础 URL
const API_DOMAIN = process.env.API_DOMAIN;

export async function GET(request: NextRequest) {
  return handleRequest(request, 'GET');
}

export async function POST(request: NextRequest) {
  return handleRequest(request, 'POST');
}

export async function PUT(request: NextRequest) {
  return handleRequest(request, 'PUT');
}

export async function DELETE(request: NextRequest) {
  return handleRequest(request, 'DELETE');
}

export async function PATCH(request: NextRequest) {
  return handleRequest(request, 'PATCH');
}

async function handleRequest(request: NextRequest, method: string) {
  try {
    // 构建目标 URL，包含查询参数
    const targetUrl = `${API_DOMAIN}${request.nextUrl.pathname}${request.nextUrl.search}`;

    // 获取请求头
    const headers = new Headers(request.headers);

    // 获取请求体
    let body;
    if (method !== 'GET' && method !== 'HEAD') {
      body = await request.text();
    }

    console.log(`Proxying ${method} request to: ${targetUrl}`);

    // 发送请求到内部服务器
    const response = await fetch(targetUrl, {
      method,
      headers,
      body,
    });

    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return NextResponse.json(await response.json(), {
        status: response.status,
      });
    }
    return new NextResponse(await response.text(), { status: response.status });
  } catch (error) {
    console.error('Proxy request failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
