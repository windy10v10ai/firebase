import Script from 'next/script';

import { GA_MEASUREMENT_ID } from '../lib/analytics';

// 用 gtag 而非 firebase/analytics：后者要多取一次远端配置，且默认发往 Firebase 项目所链的媒体资源
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
gtag('config', '${GA_MEASUREMENT_ID}');`}
      </Script>
    </>
  );
}
