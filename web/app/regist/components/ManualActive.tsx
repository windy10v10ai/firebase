'use client';

import { Hash, Mail, ReceiptText } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';

import Button from '@/app/components/ui/button';
import Field from '@/app/components/ui/field';
import Input from '@/app/components/ui/input';
import Spinner from '@/app/components/ui/spinner';
import { apiFetch } from '@/app/lib/api';
import { useAuth } from '@/app/lib/auth';
import { buildSteamLoginUrl } from '@/app/lib/steam-login';

import ActiveResult from './ActiveResult';
import {
  type ManualActiveFormValues,
  validateManualActiveForm,
} from './manual-active-validation';

import type { PlatformType } from '../../types/platform';

interface ManualActiveProps {
  activeType: PlatformType;
}

interface ActivationResponse {
  result: boolean;
}

interface ActivationResult {
  errorMessage?: string;
  success: boolean;
}

type TouchedFields = Partial<Record<keyof ManualActiveFormValues, true>>;

const ACTIVE_PATHS: Record<PlatformType, string> = {
  afdian: '/api/afdian/order/active',
  kofi: '/api/kofi/order/active',
};

const STEAM_ID_HELP_URLS: Record<PlatformType, string> = {
  afdian: 'https://afdian.com/p/bfba558c5d9311ed836152540025c377',
  kofi: 'https://ko-fi.com/post/Membership-Z8Z01CDJLU',
};

const INITIAL_VALUES: ManualActiveFormValues = {
  platformOrderKey: '',
  steamId: '',
};

const ManualActive = ({ activeType }: ManualActiveProps) => {
  const t = useTranslations('manualActive');
  const auth = useAuth();
  const pathname = usePathname();
  const [values, setValues] = useState(INITIAL_VALUES);
  const [touchedFields, setTouchedFields] = useState<TouchedFields>({});
  const [activationResult, setActivationResult] = useState<ActivationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const uid = auth.status === 'authenticated' ? auth.uid : null;
  // 登录后 Dota2 ID 就是 uid，玩家自己动过输入框才以输入框为准
  const formValues = uid && !touchedFields.steamId ? { ...values, steamId: uid } : values;

  const errors = validateManualActiveForm(formValues, activeType);
  const formValid = Object.keys(errors).length === 0;
  const platformField = activeType === 'afdian' ? 'afdianOrderId' : 'kofiMailAddress';

  const updateField = (field: keyof ManualActiveFormValues, value: string) => {
    setValues((currentValues) => ({ ...currentValues, [field]: value }));
    setTouchedFields((currentFields) => ({ ...currentFields, [field]: true }));
  };

  const requestActivation = async () => {
    setIsLoading(true);

    try {
      const response = await apiFetch<ActivationResponse>(ACTIVE_PATHS[activeType], {
        method: 'POST',
        body: JSON.stringify({
          steamId: Number(formValues.steamId),
          ...(activeType === 'afdian'
            ? { outTradeNo: formValues.platformOrderKey }
            : { email: formValues.platformOrderKey }),
        }),
      });

      setActivationResult({ success: response.result });
    } catch (error) {
      setActivationResult({
        errorMessage: error instanceof Error ? error.message : String(error),
        success: false,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouchedFields({ platformOrderKey: true, steamId: true });

    if (!formValid || isLoading) {
      return;
    }

    void requestActivation();
  };

  const helpLinkClass = 'link-inline';
  const steamIdError =
    touchedFields.steamId && errors.steamId ? t('input.steamId.help') : undefined;
  const platformOrderKeyError =
    touchedFields.platformOrderKey && errors.platformOrderKey
      ? t(`input.${platformField}.help`)
      : undefined;

  return (
    <div className="mx-auto w-full max-w-2xl">
      {isLoading ? <Spinner label={t('submitButton.loadingText')} /> : null}

      {activationResult ? (
        <ActiveResult
          activeType={activeType}
          result={activationResult.success}
          errorMsg={activationResult.errorMessage}
          onRetry={() => setActivationResult(null)}
        />
      ) : (
        <section className="space-y-8">
          <div className="space-y-3">
            <h1 className="title-primary text-member-strong">
              {activeType === 'afdian' ? t('afdianTitle') : t('kofiTitle')}
            </h1>
            <p className="text-content">
              {activeType === 'afdian' ? t('afdianDescription') : t('kofiDescription')}
            </p>
          </div>

          <form noValidate onSubmit={handleSubmit} className="card-container space-y-6 p-5 sm:p-8">
            <Field
              required
              htmlFor="inputSteamId"
              label={t('input.steamId.title')}
              messageId="inputSteamIdMessage"
              error={steamIdError}
              help={
                // 窄屏一行放不下两条，各占一行；整条链接不从中间断开
                <span className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                  <a
                    href={STEAM_ID_HELP_URLS[activeType]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={helpLinkClass}
                  >
                    {t('input.steamId.helpLink')}
                  </a>
                  {auth.status === 'unauthenticated' ? (
                    <>
                      <span aria-hidden="true" className="hidden text-muted sm:inline">
                        /
                      </span>
                      <a href={buildSteamLoginUrl(pathname)} className={helpLinkClass}>
                        {t('input.steamId.steamAutoFill')}
                      </a>
                    </>
                  ) : null}
                </span>
              }
            >
              <Input
                showCount
                id="inputSteamId"
                name="steamId"
                value={formValues.steamId}
                icon={<Hash className="size-5" />}
                invalid={Boolean(steamIdError)}
                inputMode="numeric"
                autoComplete="off"
                placeholder={t('input.steamId.placeholder')}
                aria-describedby="inputSteamIdMessage"
                onChange={(event) => updateField('steamId', event.target.value)}
              />
            </Field>

            <Field
              required
              htmlFor={activeType === 'afdian' ? 'inputAfdianOrderId' : 'inputKofiMailAddress'}
              label={t(`input.${platformField}.title`)}
              messageId="platformOrderKeyMessage"
              error={platformOrderKeyError}
              help={
                activeType === 'afdian' ? (
                  <a
                    href="https://afdian.com/dashboard/order"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={helpLinkClass}
                  >
                    {t('input.afdianOrderId.helpLink')}
                  </a>
                ) : undefined
              }
            >
              <Input
                showCount
                id={activeType === 'afdian' ? 'inputAfdianOrderId' : 'inputKofiMailAddress'}
                name={activeType === 'afdian' ? 'afdianOrderId' : 'kofiMailAddress'}
                value={formValues.platformOrderKey}
                icon={
                  activeType === 'afdian' ? (
                    <ReceiptText className="size-5" />
                  ) : (
                    <Mail className="size-5" />
                  )
                }
                invalid={Boolean(platformOrderKeyError)}
                inputMode={activeType === 'afdian' ? 'numeric' : 'email'}
                autoComplete={activeType === 'afdian' ? 'off' : 'email'}
                spellCheck={false}
                placeholder={t(`input.${platformField}.placeholder`)}
                aria-describedby="platformOrderKeyMessage"
                onChange={(event) => updateField('platformOrderKey', event.target.value)}
              />
            </Field>

            <Button type="submit" variant="member" disabled={!formValid || isLoading} className="w-full sm:w-auto">
              {t('submitButton.buttonText')}
            </Button>
          </form>
        </section>
      )}
    </div>
  );
};

export default ManualActive;
