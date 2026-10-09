import Link from 'next/link';
import { useTranslations } from 'next-intl';

import Section from '../../components/Section';
import { pageTitle } from '../../lib/page-title';
import { LAUNCHER_BUILD_URL, LAUNCHER_MAINTAINER_URL, LAUNCHER_SOURCE_URL } from '../launcher';

export const generateMetadata = pageTitle('codeSigning', 'title');

const external = (href: string) => {
  const ExternalLink = (chunks: React.ReactNode) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="link-inline">
      {chunks}
    </a>
  );
  return ExternalLink;
};

// 启动器内的反馈窗口按此路径链接隐私一节，路径不能改
export default function CodeSigningPage() {
  const t = useTranslations('codeSigning');
  const launch = (chunks: React.ReactNode) => (
    <Link href="/launch" className="link-inline">
      {chunks}
    </Link>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <h1 className="title-primary">{t('title')}</h1>
      <p className="text-content text-pretty">{t('intro')}</p>

      <Section title={t('build.title')}>
        <ul className="list-disc space-y-2 pl-5 text-content text-pretty">
          <li>{t.rich('build.source', { source: external(LAUNCHER_SOURCE_URL) })}</li>
          <li>{t.rich('build.ci', { workflow: external(LAUNCHER_BUILD_URL) })}</li>
          <li>{t.rich('build.download', { launch })}</li>
        </ul>
      </Section>

      <Section title={t('team.title')}>
        <p className="text-content text-pretty">
          {t.rich('team.body', { maintainer: external(LAUNCHER_MAINTAINER_URL) })}
        </p>
      </Section>

      <Section title={t('changes.title')}>
        <ul className="list-disc space-y-2 pl-5 text-content text-pretty">
          <li>{t('changes.files')}</li>
          <li>{t('changes.settings')}</li>
        </ul>
      </Section>

      <Section id="privacy" title={t('privacy.title')}>
        <ul className="list-disc space-y-2 pl-5 text-content text-pretty">
          <li>{t('privacy.update')}</li>
          <li>{t('privacy.online')}</li>
          <li>{t('privacy.data')}</li>
        </ul>
      </Section>
    </div>
  );
}
