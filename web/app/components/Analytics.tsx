import Script from 'next/script';

import { GA_MEASUREMENT_ID } from '../lib/analytics';

// 本机开发的事件带上调试标记才进得了 GA4 的 DebugView，省掉每次开浏览器扩展
const CONFIG_OPTIONS = process.env.NODE_ENV === 'production' ? '' : ', { debug_mode: true }';

// 用 gtag 而非 firebase/analytics：只需要它发事件，不值得为此多一次远端配置请求与一个可能到不了的域名
export default function Analytics() {
  if (!GA_MEASUREMENT_ID) {
    return null;
  }

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
      <Script id="gtag-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}'${CONFIG_OPTIONS});`}
      </Script>
    </>
  );
}
