/**
 * 首屏背后的全宽背景：往上伸到页面顶部，透过透明的头部露出来；往下多伸一截，让暖色渐变回页面底色。
 * 定位在首屏 section 里但不设层级，负 z-index 落进外层布局的层叠上下文，位于头部与内容之下。
 */
export default function HeroBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -bottom-[28rem] left-1/2 -z-10 w-screen -translate-x-1/2 top-[calc(var(--header-height)*-1)]"
    >
      <div className="home-hero-wash absolute inset-0" />
      {/* 窄屏只取图片上方的标志做一条横带；电脑宽度铺满首屏，右移让出左边的文案 */}
      <div className="absolute inset-x-0 top-0 h-[23rem] overflow-hidden lg:bottom-[28rem] lg:h-auto">
        {/* eslint-disable-next-line @next/next/no-img-element -- 背景图要 sepia 滤镜与自定义裁切，next/image 的容器模型不适用 */}
        <img
          src="/images/home/hero-1920.webp"
          srcSet="/images/home/hero-960.webp 960w, /images/home/hero-1920.webp 1920w"
          sizes="(min-width: 64rem) 124vw, 54rem"
          alt=""
          fetchPriority="high"
          className="absolute top-[-6rem] left-1/2 w-[54rem] max-w-none -translate-x-1/2 [filter:sepia(0.35)_saturate(1.25)] lg:top-0 lg:left-0 lg:h-full lg:w-[124%] lg:translate-x-0 lg:object-cover lg:[object-position:center_42%]"
        />
        <div className="home-hero-shade absolute inset-0" />
      </div>
    </div>
  );
}
