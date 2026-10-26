import Hero from './home/Hero';
import HomeLinks from './home/HomeLinks';
import PageCards from './home/PageCards';

export default function Home() {
  return (
    // main 自带上边距，首屏要紧贴头部底边，用负边距抵消
    <div className="-mt-6 md:-mt-8">
      <Hero />
      <div className="flex flex-col gap-6 lg:gap-9">
        <PageCards />
        <HomeLinks />
      </div>
    </div>
  );
}
