'use client';

/* eslint-disable @next/next/no-img-element -- 皇冠是本地静态小图，尺寸已经是目标尺寸，不必过 next/image 优化器 */

import { useTranslations } from 'next-intl';

import CurrencyBlock, { type CurrencyValues } from '@/app/components/CurrencyBlock';
import IdWithCopy from '@/app/components/IdWithCopy';
import SteamLoginButton from '@/app/components/SteamLoginButton';
import Skeleton from '@/app/components/ui/skeleton';
import { memberStatusKey, type PlayerInfo } from '@/app/lib/player-info';

type MemberStatusCardProps =
  | { authenticated: false }
  // info 为 undefined 表示还在取，null 表示取失败或没有记录
  | { authenticated: true; steamId: string; info: PlayerInfo | null | undefined };

// 下一级门槛给 1 而不是 0：CurrencyBlock 把门槛为 0 当成满级，进度条会画满
const EMPTY_VALUES: CurrencyValues = {
  level: 0,
  pointTotal: 0,
  currentLevelPoint: 0,
  nextLevelPoint: 1,
  usablePoint: 0,
};

/** 页面顶部的会员状态；登录与否都占同样的位置和高度，已登录时首帧就是这张卡 */
export default function MemberStatusCard(props: MemberStatusCardProps) {
  const t = useTranslations('membership.status');
  const tIdentity = useTranslations('profile.identity');

  const info = props.authenticated ? props.info : null;
  const member = info?.member;
  const statusKey = memberStatusKey(member);
  const active = member?.enable === true;
  const loading = props.authenticated && props.info === undefined;

  const currencyValues: CurrencyValues | null = loading
    ? null
    : info
      ? {
          level: info.memberLevel,
          pointTotal: info.memberPointTotal,
          currentLevelPoint: info.memberCurrentLevelPoint,
          nextLevelPoint: info.memberNextLevelPoint,
          usablePoint: info.useableMemberPoint,
        }
      : EMPTY_VALUES;

  const title = !props.authenticated ? t('loginTitle') : loading ? null : t(statusKey);
  const detail = !props.authenticated
    ? t('loginDescription')
    : loading
      ? null
      : !member
        ? t('noneDescription')
        : member.enable
          ? t('expireDate', { date: member.expireDateString })
          : t('expiredOn', { date: member.expireDateString });

  return (
    <section className="card-container card-pad grid gap-6 lg:grid-cols-2 lg:gap-12">
      <div className="flex min-w-0 flex-col justify-center gap-4">
        <div className="flex items-center gap-4">
          <img
            src={active ? '/images/member/crown-gold.png' : '/images/member/crown-grey.png'}
            alt=""
            width={64}
            height={64}
            className="size-14 shrink-0 lg:size-16"
          />
          <div className="flex min-w-0 flex-col gap-1">
            <span
              className={`text-xl font-extrabold ${active ? 'text-member-strong' : 'text-heading'}`}
            >
              {title ?? <Skeleton>0000000</Skeleton>}
            </span>
            <span className="min-h-5 text-sm text-muted">
              {detail ?? <Skeleton>00000000000000</Skeleton>}
            </span>
          </div>
        </div>
        {props.authenticated ? (
          <div className="flex min-h-9 items-center gap-2 text-sm">
            <span className="shrink-0 text-muted">{t('friendId')}</span>
            <span className="font-bold text-heading">
              <IdWithCopy
                id={props.steamId}
                idText={props.steamId}
                copyTooltip={tIdentity('copyId.tooltip')}
                copiedLabel={tIdentity('copyId.copied')}
              />
            </span>
          </div>
        ) : (
          <div className="flex min-h-9 items-center">
            <SteamLoginButton />
          </div>
        )}
      </div>
      <div className="border-line lg:border-l lg:ps-12">
        {props.authenticated ? (
          <CurrencyBlock
            tone="member"
            t={tIdentity}
            levelLabel={tIdentity('memberLevel')}
            values={currencyValues}
          />
        ) : (
          // 未登录时照样画出等级与积分的格子，与登录后同高，登录回来不跳
          <div aria-hidden="true" className="opacity-40">
            <CurrencyBlock
              tone="member"
              t={tIdentity}
              levelLabel={tIdentity('memberLevel')}
              values={EMPTY_VALUES}
            />
          </div>
        )}
      </div>
    </section>
  );
}
