'use client';

import { CircleCheckBig, Hash } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';

import Button from '@/app/components/ui/button';
import Field from '@/app/components/ui/field';
import Input from '@/app/components/ui/input';
import { ApiError } from '@/app/lib/api';
import { useAuth } from '@/app/lib/auth';
import {
  FEEDBACK_TOPICS,
  FEEDBACK_TYPES,
  type FeedbackTopic,
  type FeedbackType,
  MAX_DESCRIPTION_LENGTH,
  MAX_TOPICS,
  sendFeedback,
} from '@/app/lib/feedback';

type SendError = 'tooMany' | 'dailyLimit' | 'failed';

const STEAM_ID_PATTERN = /^[1-9]\d{0,9}$/;

function isFeedbackTopic(value: string | null): value is FeedbackTopic {
  return FEEDBACK_TOPICS.includes(value as FeedbackTopic);
}

function toSendError(error: unknown): SendError {
  if (error instanceof ApiError && error.status === 429) {
    return error.code === 'daily_limit_reached' ? 'dailyLimit' : 'tooMany';
  }
  return 'failed';
}

const chipClass = (selected: boolean, shape = 'rounded-full') =>
  `${shape} border px-3.5 min-h-10 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link disabled:text-faint ${
    selected
      ? 'border-link bg-link/10 text-heading'
      : 'border-line bg-control text-content enabled:hover:bg-control-hover enabled:hover:text-heading'
  }`;

export default function FeedbackPage() {
  const t = useTranslations('feedback');
  const auth = useAuth();
  const pathname = usePathname();
  // 其他页面可以带着主题、ID 与描述跳进来，玩家只需补充几句
  const searchParams = useSearchParams();
  const [type, setType] = useState<FeedbackType>('problem');
  const [topics, setTopics] = useState<FeedbackTopic[]>(() => {
    const topic = searchParams.get('topic');
    return isFeedbackTopic(topic) ? [topic] : [];
  });
  const [description, setDescription] = useState(() =>
    (searchParams.get('description') ?? '').slice(0, MAX_DESCRIPTION_LENGTH),
  );
  const [steamId, setSteamId] = useState(() => {
    const id = searchParams.get('id') ?? '';
    return STEAM_ID_PATTERN.test(id) ? id : '';
  });
  const [steamIdTouched, setSteamIdTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<SendError | null>(null);
  const [sent, setSent] = useState(false);

  const signedIn = auth.status === 'authenticated';
  const suggesting = type === 'suggestion';
  const steamIdValid = signedIn || STEAM_ID_PATTERN.test(steamId.trim());
  const canSend = description.trim() !== '' && steamIdValid;
  const topicsFull = topics.length >= MAX_TOPICS;

  const toggleTopic = (topic: FeedbackTopic) => {
    setTopics((current) =>
      current.includes(topic) ? current.filter((item) => item !== topic) : [...current, topic],
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSteamIdTouched(true);
    if (!canSend || sending) {
      return;
    }

    setSending(true);
    setSendError(null);
    try {
      await sendFeedback(
        { type, topics, description: description.trim() },
        signedIn ? undefined : steamId.trim(),
      );
      setSent(true);
    } catch (error) {
      setSendError(toSendError(error));
    } finally {
      setSending(false);
    }
  };

  const startOver = () => {
    setTopics([]);
    setDescription('');
    setSendError(null);
    setSent(false);
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8">
      <div className="space-y-3">
        <h1 className="title-primary">{t('title')}</h1>
        <p className="text-content">
          {t.rich('intro', {
            launcher: (chunks) => (
              <Link href="/launch" className="link-inline">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </div>

      {sent ? (
        <section className="card-container card-pad flex flex-col items-center gap-6 text-center">
          <CircleCheckBig aria-hidden="true" className="size-16 text-success" strokeWidth={1.5} />
          <p className="text-lg text-heading">{t('thanks')}</p>
          <Button variant="secondary" onClick={startOver}>
            {t('another')}
          </Button>
        </section>
      ) : (
        <form noValidate onSubmit={handleSubmit} className="card-container card-pad space-y-6">
          <fieldset className="space-y-2">
            <legend className="mb-2 font-medium text-heading">{t('type')}</legend>
            <div className="grid grid-cols-2 gap-2">
              {FEEDBACK_TYPES.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={type === item}
                  onClick={() => setType(item)}
                  className={`${chipClass(type === item, 'rounded-[7px]')} font-bold`}
                >
                  {t(`types.${item}`)}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 font-medium text-heading">
              {t('topics')}
              <span className="ml-2 text-sm font-normal text-muted">{t('upToTwo')}</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {FEEDBACK_TOPICS.map((topic) => {
                const selected = topics.includes(topic);
                return (
                  <button
                    key={topic}
                    type="button"
                    aria-pressed={selected}
                    disabled={!selected && topicsFull}
                    onClick={() => toggleTopic(topic)}
                    className={chipClass(selected)}
                  >
                    {t(`topicNames.${topic}`)}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <Field
            required
            htmlFor="feedbackDescription"
            label={t('description')}
            messageId="feedbackDescriptionMessage"
          >
            <div className="flex flex-col rounded-md border border-line bg-panel-soft text-content transition-shadow focus-within:border-link focus-within:ring-2 focus-within:ring-link/30">
              <textarea
                id="feedbackDescription"
                value={description}
                rows={6}
                maxLength={MAX_DESCRIPTION_LENGTH}
                placeholder={suggesting ? t('suggestionCue') : t('problemCue')}
                onChange={(event) => setDescription(event.target.value)}
                className="min-h-36 resize-y bg-transparent px-3 py-2.5 outline-none placeholder:text-muted"
              />
              <span
                aria-hidden="true"
                className="self-end px-3 pb-2 text-xs tabular-nums text-muted"
              >
                {description.length} / {MAX_DESCRIPTION_LENGTH}
              </span>
            </div>
          </Field>

          {signedIn ? null : (
            <Field
              required
              htmlFor="feedbackSteamId"
              label={t('steamId')}
              messageId="feedbackSteamIdMessage"
              error={steamIdTouched && !steamIdValid ? t('steamIdHelp') : undefined}
              help={
                <a href={auth.loginUrl(pathname)} className="link-inline">
                  {t('signInInstead')}
                </a>
              }
            >
              <Input
                id="feedbackSteamId"
                value={steamId}
                icon={<Hash className="size-5" />}
                invalid={steamIdTouched && !steamIdValid}
                inputMode="numeric"
                autoComplete="off"
                placeholder={t('steamIdPlaceholder')}
                aria-describedby="feedbackSteamIdMessage"
                onChange={(event) => setSteamId(event.target.value)}
                onBlur={() => setSteamIdTouched(true)}
              />
            </Field>
          )}

          {sendError ? (
            <p role="alert" className="text-sm text-danger">
              {t(`errors.${sendError}`)}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-muted">
              {t.rich('privacy', {
                link: (chunks) => (
                  <Link href="/launch/code-signing#privacy" className="link-inline">
                    {chunks}
                  </Link>
                ),
              })}
            </p>
            <Button
              type="submit"
              loading={sending}
              disabled={!canSend}
              className="w-full md:w-auto"
            >
              {sending ? t('sending') : sendError ? t('resend') : t('send')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
