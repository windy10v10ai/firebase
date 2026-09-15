'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import PlayerAvatar from '@/app/components/PlayerAvatar';
import Skeleton from '@/app/components/ui/skeleton';
import { useAuth } from '@/app/lib/auth';
import { fetchPlayerInfo, memberStatusKey, type PlayerInfo } from '@/app/lib/player-info';
import { playerPagePath } from '@/app/lib/player-path';
import { fetchSteamProfile, type SteamProfile } from '@/app/lib/steam-profile';

function StatRow({
  label,
  value,
  className,
}: {
  label: string;
  value: string | null;
  className: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={`font-medium ${className}`}>{value ?? <Skeleton />}</dd>
    </div>
  );
}

export default function PlayerSummary({ uid }: { uid: string }) {
  const t = useTranslations('home.summary');
  const { initialProfile } = useAuth();
  const [info, setInfo] = useState<PlayerInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadedProfile, setLoadedProfile] = useState<SteamProfile | null>(() => initialProfile);

  // 网格始终占位，失败时数值显示为横线，卡片高度不随请求结果变化
  useEffect(() => {
    let cancelled = false;
    fetchPlayerInfo(uid)
      .then((loaded) => {
        if (!cancelled) {
          setInfo(loaded);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // 昵称头像单独发一次，与上面那次并行：写法同 profile 页身份卡
  useEffect(() => {
    let cancelled = false;
    fetchSteamProfile(uid).then((fetched) => {
      if (!cancelled) {
        setLoadedProfile(fetched);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // 换了账号时旧资料立刻失效，不用先手动置空
  const profile = loadedProfile?.steamId === uid ? loadedProfile : null;
  const member = info?.member;
  const status = memberStatusKey(member);
  const pending = !info && !failed;
  const valueOf = (read: (loaded: PlayerInfo) => number) =>
    info ? read(info).toLocaleString() : failed ? '—' : null;
  const idText = t('heading', { id: uid });
  const personaName = profile?.personaName ?? null;

  return (
    <section className="card-container card-pad space-y-5">
      {/* 整行都能点：窄屏把链接文字收成箭头，ID 才放得进一行 */}
      <Link href={playerPagePath(uid)} className="group flex items-center gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-panel-soft">
          <PlayerAvatar
            avatarUrl={profile?.avatarUrl}
            imageClassName="size-14 object-cover"
            iconClassName="size-7 text-muted"
            iconStrokeWidth={1.7}
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-2xl font-bold text-heading md:text-[26px]">
            {personaName ?? idText}
          </p>
          {/* 昵称没取到时标题本身就是 ID，这一行空着；高度照留，写法同 profile 页身份卡 */}
          <p className="min-h-5 truncate text-sm text-muted">{personaName ? idText : null}</p>
          {/* 会员状态只做陈述，订阅入口在下面的会员卡和会员页，同屏不放第三个；没开通过留空，「未开通会员」既没信息也没去处 */}
          {/* 两行始终占位且不折行，会员信息晚到也不撑高身份行；加载中同样只留白，非会员本来就空着，放骨架会预告不存在的内容 */}
          <p className="flex flex-col md:flex-row md:items-center md:gap-x-2">
            {/* 金色代表会员有效，过期了照样上金会让人以为还在生效 */}
            <span
              className={`min-h-6 truncate ${member?.enable ? 'font-medium text-member-strong' : 'text-muted'}`}
            >
              {member ? t(`member.${status}`) : null}
            </span>
            <span className="min-h-5 truncate text-sm text-muted">
              {member ? t('member.expireDate', { date: member.expireDateString }) : null}
            </span>
          </p>
        </div>
        <span className="inline-flex items-center gap-1 text-sm whitespace-nowrap text-link transition-colors group-hover:text-link-hover">
          <span className="hidden md:inline">{t('profileLink')}</span>
          <ChevronRight className="size-4" aria-hidden="true" />
        </span>
      </Link>

      <dl className="grid gap-x-8 md:grid-cols-2" aria-busy={pending}>
        <StatRow
          label={t('battleLevel')}
          value={valueOf((loaded) => loaded.seasonLevel)}
          className="text-season"
        />
        <StatRow
          label={t('memberLevel')}
          value={valueOf((loaded) => loaded.memberLevel)}
          className="text-member"
        />
        <StatRow
          label={t('battlePoint')}
          value={valueOf((loaded) => loaded.useableSeasonPoint)}
          className="text-season"
        />
        <StatRow
          label={t('memberPoint')}
          value={valueOf((loaded) => loaded.useableMemberPoint)}
          className="text-member"
        />
      </dl>
    </section>
  );
}
