# Windy10v10ai-cloud API 调用指南

本文档提供了关于如何调用 Windy10v10ai-cloud API 的详细指南，包括配置、认证和示例代码。

## 目录

- [API 访问配置](#api-访问配置)
  - [Firebase 重写规则配置](#firebase-重写规则配置)
  - [API 路由处理](#api-路由处理)
- [API 认证](#api-认证)
  - [API 密钥](#api-密钥)
  - [公开 API](#公开-api)
- [API 调用示例](#api-调用示例)
  - [使用 curl](#使用-curl)
- [常见问题排查](#常见问题排查)
  - [WSL 访问问题](#wsl-访问问题)
  - [认证错误](#认证错误)
- [开发环境信息](#开发环境信息)

## API 访问配置

### Firebase 重写规则配置

在 `firebase.json` 文件中，我们使用重写规则将 API 请求路径映射到相应的 Firebase 函数：

```json
"rewrites": [
  {
    "regex": "^/api/(game|afdian|analytics|player).*",
    "function": "client",
    "region": "asia-northeast1"
  }
]
```

如果需要添加新的 API 路径，请在正则表达式中添加相应的路径前缀。

### API 路由处理

在 `api/index.ts` 中，我们使用正则表达式来处理 API 请求：

```typescript
export const client = onRequest(
  {
    region: 'asia-northeast1',
    minInstances: 0,
    maxInstances: 10,
    timeoutSeconds: 10,
    secrets: commonSecrets,
  },
  async (req, res) => {
    const regex = '^/api/(game|afdian|analytics|player).*';
    callServerWithRegex(regex, req, res);
  },
);
```

如果添加了新的 API 路径，需要在此正则表达式中添加相应的路径前缀。

## API 认证

大多数 API 端点都需要认证。认证是通过 API 密钥实现的，需要在请求头中添加 `x-api-key` 字段。

### API 密钥

在本地开发环境中，可以使用以下两个 API 密钥之一：

- `Invalid_NotOnDedicatedServer`（在 `.env.local` 中的 `SERVER_APIKEY`）
- `apikey`（在 `.env.local` 中的 `SERVER_APIKEY_TEST`）

认证逻辑在 `api/src/util/auth/auth.guard.ts` 中实现：

```typescript
canActivate(context: ExecutionContext): boolean {
  const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
    context.getHandler(),
    context.getClass(),
  ]);
  if (isPublic) {
    return true;
  }

  const request = context.switchToHttp().getRequest<Request>();
  const apiKey = request.headers['x-api-key'];

  const serverApiKey = this.sercretService.getSecretValue(SECRET.SERVER_APIKEY);
  const testServerApiKey = this.sercretService.getSecretValue(SECRET.SERVER_APIKEY_TEST);

  if (apiKey === serverApiKey || apiKey === testServerApiKey) {
    return true;
  }

  throw new UnauthorizedException();
}
```

### 公开 API

如果需要将某个 API 端点设为公开访问（无需 API 密钥），可以使用 `@Public()` 装饰器：

```typescript
import { Public } from '../util/auth/public.decorator';

@Public()
@Get('/some-public-endpoint')
somePublicMethod() {
  // ...
}
```

## API 调用示例

### 使用 curl

#### 在 Windows 系统中：

```bash
curl -H "x-api-key: Invalid_NotOnDedicatedServer" http://localhost:5000/api/player/ranking
```

#### 在 WSL 中：

需要使用 Windows 主机的 IP 地址（可通过 `/etc/resolv.conf` 中的 nameserver 获取）：

```bash
curl -H "x-api-key: Invalid_NotOnDedicatedServer" http://10.255.255.254:5000/api/player/ranking
```

## 常见问题排查

### WSL 访问问题

如果在 WSL 中无法访问 API，但在 Windows 中可以，可能是网络配置问题。尝试使用 Windows 主机的 IP 地址：

1. 查找 Windows 主机 IP：`cat /etc/resolv.conf | grep nameserver | awk '{print $2}'`
2. 使用该 IP 访问 API：`curl -H "x-api-key: apikey" http://<WINDOWS_IP>:5000/api/player/ranking`

### 认证错误

如果收到 401 Unauthorized 错误，检查：

1. API 密钥是否正确
2. 请求头中的 `x-api-key` 字段是否正确设置
3. 目标 API 是否需要认证（不需要认证时，是否使用了 `@Public()` 装饰器）

## 开发环境信息

- API 文档：http://localhost:3001/api-doc
- Firebase 模拟器 UI：http://localhost:4000/
- 本地 API 端点：http://localhost:3001/api/
- Firebase Hosting：http://localhost:5000/api/

启动开发环境：

```bash
npm run start
```

这将启动 Next.js 应用和 Firebase 模拟器。 