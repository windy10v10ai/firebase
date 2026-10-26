import { Crown, MessageSquareText, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';

import ActionCard from '@/app/components/ActionCard';
import GithubIcon from '@/app/components/GithubIcon';
import { EXTERNAL_LINKS } from '@/config/links';

const GITHUB_HREF = EXTERNAL_LINKS.find((link) => link.labelKey === 'github')!.href;

const ROW_CLASS = 'grid gap-2.5 md:grid-cols-2 md:gap-3.5';

/** 主要页面之后的几张入口卡：会员订阅、启动方式、反馈、GitHub */
export default function HomeLinks() {
  const t = useTranslations();

  return (
    <>
      <section className={ROW_CLASS}>
        <ActionCard
          translucent
          href="/membership"
          Icon={Crown}
          iconClassName="text-member-strong"
          tileClassName="bg-member-soft"
          title={t('navigation.membership')}
          description={t('home.memberCard.description')}
          capsule={t('home.memberCard.capsule')}
          capsuleBelow
          hoverClassName="hover:border-member-border"
        />
        <ActionCard
          translucent
          href="/launch"
          Icon={Play}
          iconClassName="text-cta"
          tileClassName="bg-cta-soft"
          title={t('launch.homeCard.title')}
          description={t('launch.homeCard.body')}
          capsule={t('launch.homeCard.capsule')}
          capsuleBelow
        />
      </section>
      <section className={ROW_CLASS}>
        <ActionCard
          translucent
          href="/feedback"
          Icon={MessageSquareText}
          iconClassName="text-content"
          tileClassName="bg-icon-tile"
          title={t('home.feedback.title')}
          description={t('home.feedback.description')}
        />
        <ActionCard
          translucent
          external
          href={GITHUB_HREF}
          Icon={GithubIcon}
          iconClassName="text-content"
          tileClassName="bg-icon-tile"
          title={t('home.github.title')}
          description={t('home.github.description')}
        />
      </section>
    </>
  );
}
