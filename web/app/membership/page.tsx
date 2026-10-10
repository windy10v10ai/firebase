'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import React, { useCallback, useState } from 'react';

import { useAuth } from '@/app/lib/auth';
import { invalidatePlayerState, playerMemberQuery } from '@/app/lib/queries';

import Section from '../components/Section';

import AlipayPayDialog, { type AlipayRequest } from './AlipayPayDialog';
import MemberStatusCard from './MemberStatusCard';
import PurchaseSection from './PurchaseSection';

// emoji 的字形画得比排版宽度宽，紧跟其后的汉字会被压住，所以让 emoji 单独占一列
const LEADING_EMOJI = /^(\p{Extended_Pictographic}️?)\s*/u;

function splitLeadingEmoji(text: string): [string | null, string] {
  const matched = text.match(LEADING_EMOJI);
  return matched ? [matched[1]!, text.slice(matched[0].length)] : [null, text];
}

const MANUAL_ACTIVE_LINKS = [
  {
    href: '/regist/afdian',
    labelKey: 'membership.manualActive.afdian',
    colorClass: 'text-afdian hover:brightness-110',
  },
  {
    href: '/regist/kofi',
    labelKey: 'membership.manualActive.kofi',
    colorClass: 'text-kofi hover:brightness-110',
  },
];

function EmojiLead({ text }: { text: string }) {
  const [emoji, rest] = splitLeadingEmoji(text);
  if (!emoji) {
    return <>{text}</>;
  }
  return (
    <>
      <span aria-hidden="true" className="mr-1.5">
        {emoji}
      </span>
      {rest}
    </>
  );
}

export default function MembershipPage() {
  const t = useTranslations();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const uid = auth.status === 'authenticated' ? auth.uid : null;
  const memberQuery = useQuery({ ...playerMemberQuery(uid ?? ''), enabled: uid !== null });
  const [payRequest, setPayRequest] = useState<AlipayRequest | null>(null);
  const [payKey, setPayKey] = useState(0);
  const [paidExpireDate, setPaidExpireDate] = useState<string | null>(null);

  // 没有玩家记录或取失败都按「没有会员、积分为零」显示，页面照常能买
  const info = uid ? (memberQuery.data ?? (memberQuery.isError ? null : undefined)) : undefined;

  const onPaid = useCallback(() => {
    if (!uid) {
      return;
    }
    // 失效会立即重新请求正在显示的会员数据，等它回来再取新的有效期
    void invalidatePlayerState(queryClient, uid).then(() => {
      const state = queryClient.getQueryState(playerMemberQuery(uid).queryKey);
      // 重新请求失败时缓存里还是付款前的有效期，不能拿来当新的显示
      setPaidExpireDate(state?.status === 'success' ? (state.data?.member?.expireDateString ?? null) : null);
    });
  }, [uid, queryClient]);

  const openPay = useCallback((request: AlipayRequest) => {
    setPayKey((key) => key + 1);
    setPayRequest(request);
  }, []);

  const onClosePay = useCallback(() => {
    setPayRequest(null);
    setPaidExpireDate(null);
  }, []);

  return (
    <div className="space-y-6 lg:space-y-8">
      {uid ? (
        <MemberStatusCard authenticated steamId={uid} info={info} />
      ) : (
        <MemberStatusCard authenticated={false} />
      )}

      <Section title={t('membership.title')} titleClassName="text-member-strong">
        <div className="space-y-6">
          <p className="text-content text-lg text-center">
            <EmojiLead text={t('membership.description')} />
          </p>

          <ul className="space-y-3">
            {t.raw('membership.benefits').map((benefit: string, index: number) => {
              const [emoji, rest] = splitLeadingEmoji(benefit);
              return (
                <li key={index} className="flex items-start gap-2 text-content">
                  <span aria-hidden="true" className="w-6 shrink-0 text-center">
                    {emoji}
                  </span>
                  <span className="flex-1">{rest}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </Section>

      <PurchaseSection steamId={uid} onAlipay={openPay} />

      <p className="text-muted text-sm text-center">
        {t('membership.manualActive.prompt')}
        {MANUAL_ACTIVE_LINKS.map((link, index) => (
          <React.Fragment key={link.href}>
            {index > 0 ? <span className="mx-1">/</span> : ' '}
            <Link
              href={link.href}
              className={`inline-block py-1 transition-[filter] ${link.colorClass}`}
            >
              {t(link.labelKey)}
            </Link>
          </React.Fragment>
        ))}
      </p>

      <AlipayPayDialog
        key={payKey}
        steamId={uid}
        request={payRequest}
        paidExpireDate={paidExpireDate}
        onPaid={onPaid}
        onClose={onClosePay}
      />
    </div>
  );
}
