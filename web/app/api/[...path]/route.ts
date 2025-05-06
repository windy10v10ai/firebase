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
    // 构建目标 URL
    const targetUrl = `${API_DOMAIN}${request.nextUrl.pathname}`;

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

    // 获取响应内容类型
    const contentType = response.headers.get('content-type');

    // 如果是 JSON 响应，则解析 JSON
    if (contentType?.includes('application/json')) {
      const data = await response.json();
      return NextResponse.json(data, {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    // 非 JSON 响应，直接返回原始响应
    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: {
        'Content-Type': contentType || 'text/plain',
      },
    });
  } catch (error) {
    console.error('Proxy request failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
