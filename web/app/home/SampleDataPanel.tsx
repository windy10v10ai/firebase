import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

const WIN_RATE_PERCENT = 75;
const SIGN_IN_DAYS = 5;
const SIGN_IN_DONE = 3;

// 宽屏靠遮罩压住左两列，窄屏没有这两列可压，直接不渲染，
// 两档露出来的因此是同一组六格
const COVERED = 'hidden sm:block';

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2.5">
      <div className="text-[11px] leading-4 text-muted">{label}</div>
      {children}
    </div>
  );
}

function Value({ children, className }: { children: React.ReactNode; className: string }) {
  return <div className={`text-2xl font-bold ${className}`}>{children}</div>;
}

function Level({ level }: { level: number }) {
  const t = useTranslations('home.sample');
  return (
    <span className="ml-1.5 text-[11px] font-normal text-muted">{t('level', { n: level })}</span>
  );
}

/**
 * 登录引导块的背景：一屏「登录后能看到什么」的示意。
 * 数值写死，不请求接口；属性三项的取值与游戏内逐级取值一致。
 */
export default function SampleDataPanel() {
  const t = useTranslations('home.sample');
  const tIdentity = useTranslations('profile.identity');
  const tStats = useTranslations('profile.stats');

  return (
    <div
      aria-hidden="true"
      className="grid auto-rows-[84px] grid-cols-2 gap-2.5 p-3 sm:auto-rows-[92px] sm:grid-cols-4 sm:gap-3 sm:p-4"
    >
      <div className={COVERED}>
        <Tile label={tIdentity('memberLevel')}>
          <Value className="text-member">3</Value>
        </Tile>
      </div>
      <div className={COVERED}>
        <Tile label={tIdentity('memberPoint')}>
          <Value className="text-member">860</Value>
        </Tile>
      </div>
      <Tile label={tIdentity('battleLevel')}>
        <Value className="text-season">42</Value>
      </Tile>
      <Tile label={tIdentity('battlePoint')}>
        <Value className="text-season">1,240</Value>
      </Tile>

      <div className={COVERED}>
        <Tile label={tStats('games')}>
          <Value className="text-heading">1,284</Value>
        </Tile>
      </div>
      <div className={COVERED}>
        <Tile label={t('awakened')}>
          <Value className="text-heading">7</Value>
        </Tile>
      </div>
      <Tile label={tStats('winRate')}>
        <Value className="text-heading">75.2%</Value>
        <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-line">
          <div className="h-full bg-season-strong" style={{ width: `${WIN_RATE_PERCENT}%` }} />
        </div>
      </Tile>
      {/* 行为分不用金色：金色在本站专指会员，挂上去会被读成会员权益 */}
      <Tile label={tStats('conduct')}>
        <Value className="text-success">110</Value>
      </Tile>

      <div className={COVERED}>
        <Tile label={t('vision')}>
          <Value className="text-heading">
            +100
            <Level level={2} />
          </Value>
        </Tile>
      </div>
      <div className={COVERED}>
        <Tile label={t('cooldown')}>
          <Value className="text-heading">
            −12%
            <Level level={3} />
          </Value>
        </Tile>
      </div>
      <Tile label={t('moveSpeed')}>
        <Value className="text-heading">
          +50
          <Level level={2} />
        </Value>
      </Tile>
      <Tile label={t('signIn')}>
        <div className="mt-2 flex gap-1">
          {Array.from({ length: SIGN_IN_DAYS }, (_, index) =>
            index < SIGN_IN_DONE ? (
              <span
                key={index}
                className="flex size-[22px] items-center justify-center rounded-[5px] border border-member-border bg-member-soft"
              >
                <Check className="size-3 text-member-strong" strokeWidth={3} />
              </span>
            ) : (
              <span
                key={index}
                className="size-[22px] rounded-[5px] border border-line bg-panel-soft"
              />
            ),
          )}
        </div>
      </Tile>
    </div>
  );
}
